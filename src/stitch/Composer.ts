import type {
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  SelectionNode,
} from 'graphql';
import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isObjectLike } from '../predicates/isObjectLike.js';
import { isPromise } from '../predicates/isPromise.js';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';

import type { FieldPlan } from './FieldPlan.js';
import type { SubFieldPlan } from './SubFieldPlan.js';
import type { Subschema } from './SuperSchema.js';

type Path = ReadonlyArray<string | number>;

interface FetchPlan {
  subschemaSelections: ReadonlyArray<SelectionNode>;
  parent: ObjMap<unknown>;
  target: ObjMap<unknown>;
  path: Path;
}

/**
 * @internal
 */
export class Composer {
  results: Array<PromiseOrValue<ExecutionResult>>;
  fieldPlan: FieldPlan;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;

  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator;

  constructor(
    results: Array<PromiseOrValue<ExecutionResult>>,
    fieldPlan: FieldPlan,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  ) {
    this.results = results;
    this.fieldPlan = fieldPlan;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator();
  }

  compose(): PromiseOrValue<ExecutionResult> {
    this.results.map((result) =>
      this._handleMaybeAsyncResult(
        undefined,
        this.fields,
        this.fieldPlan,
        result,
        [],
      ),
    );

    if (this.promiseAggregator.isEmpty()) {
      return this._buildResponse();
    }

    return this.promiseAggregator.resolved().then(() => this._buildResponse());
  }

  _createDocument(selections: ReadonlyArray<SelectionNode>): DocumentNode {
    return {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          kind: Kind.OPERATION_DEFINITION,
          operation: OperationTypeNode.QUERY,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections,
          },
        },
        ...this.fragments,
      ],
    };
  }

  _buildResponse(): ExecutionResult {
    const fieldsOrNull = this.nulled ? null : this.fields;

    return this.errors.length > 0
      ? { data: fieldsOrNull, errors: this.errors }
      : { data: fieldsOrNull };
  }

  _handleMaybeAsyncResult(
    parent: ObjMap<unknown> | undefined,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan | undefined,
    result: PromiseOrValue<ExecutionResult>,
    path: Path,
  ): void {
    if (!isPromise(result)) {
      this._handleResult(parent, fields, fieldPlan, result, path);
      return;
    }

    const promise = result.then(
      (resolved) =>
        this._handleResult(parent, fields, fieldPlan, resolved, path),
      (err) =>
        this._handleResult(
          parent,
          fields,
          fieldPlan,
          {
            data: null,
            errors: [new GraphQLError(err.message, { originalError: err })],
          },
          path,
        ),
    );

    this.promiseAggregator.add(promise);
  }

  _handleResult(
    parent: ObjMap<unknown> | undefined,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan | undefined,
    result: ExecutionResult,
    path: Path,
  ): void {
    if (result.errors != null) {
      this.errors.push(...result.errors);
    }

    const parentKey: string | number | undefined = path[path.length - 1];
    if (parent !== undefined) {
      if (parent[parentKey] === null) {
        return;
      }
    } else if (this.nulled) {
      return;
    }

    if (result.data == null) {
      if (parentKey === undefined) {
        this.nulled = true;
      } else if (parent) {
        parent[parentKey] = null;
        // TODO: null bubbling?
      }
      return;
    }

    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(fields, key, value);
    }

    if (fieldPlan !== undefined) {
      const subQueriesBySchema = new AccumulatorMap<Subschema, FetchPlan>();
      this._collectSubQueries(
        subQueriesBySchema,
        result.data,
        this.fieldPlan.subFieldPlans,
        path,
      );
      for (const [subschema, subQueries] of subQueriesBySchema) {
        for (const subQuery of subQueries) {
          // TODO: send one document per subschema
          const subResult = subschema.executor({
            document: this._createDocument(subQuery.subschemaSelections),
            variables: this.rawVariableValues,
          });

          this._handleMaybeAsyncResult(
            subQuery.parent,
            subQuery.target,
            // TODO: add multilayer plan support
            undefined,
            subResult,
            subQuery.path,
          );
        }
      }
    }
  }

  _collectSubQueries(
    subQueriesBySchema: AccumulatorMap<Subschema, FetchPlan>,
    fields: ObjMap<unknown>,
    subFieldPlans: ObjMap<SubFieldPlan>,
    path: Path,
  ): void {
    for (const [key, subFieldPlan] of Object.entries(subFieldPlans)) {
      if (fields[key] !== undefined) {
        this._collectPossibleListSubQueries(
          subQueriesBySchema,
          fields,
          fields[key] as ObjMap<unknown> | Array<unknown>,
          subFieldPlan,
          [...path, key],
        );
      }
    }
  }

  _collectPossibleListSubQueries(
    subQueriesBySchema: AccumulatorMap<Subschema, FetchPlan>,
    parent: ObjMap<unknown> | Array<unknown>,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    subFieldPlan: SubFieldPlan,
    path: Path,
  ): void {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._collectPossibleListSubQueries(
          subQueriesBySchema,
          fieldsOrList,
          fieldsOrList[i] as ObjMap<unknown>,
          subFieldPlan,
          [...path, i],
        );
      }
      return;
    }

    const typeName = fieldsOrList.__stitching__typename as
      | string
      | undefined
      | null;

    invariant(
      typeName != null,
      `Missing entry '__stitching__typename' in response ${inspect(
        fieldsOrList,
      )}.`,
    );

    const type = subFieldPlan.superSchema.getType(typeName);

    invariant(
      isObjectType(type),
      `Expected Object type, received '${typeName}'.`,
    );

    const fieldPlan = subFieldPlan.fieldPlans.get(type);

    invariant(
      fieldPlan !== undefined,
      `Missing field plan for type '${typeName}'.`,
    );

    for (const [
      subschema,
      subschemaSelections,
    ] of fieldPlan.selectionMap.entries()) {
      subQueriesBySchema.add(subschema, {
        subschemaSelections,
        parent: parent as ObjMap<unknown>,
        target: fieldsOrList,
        path,
      });
    }

    this._collectSubQueries(
      subQueriesBySchema,
      fieldsOrList,
      fieldPlan.subFieldPlans,
      path,
    );
  }

  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void {
    if (
      !isObjectLike(fields[key]) ||
      !isObjectLike(value) ||
      Array.isArray(value)
    ) {
      fields[key] = value;
      return;
    }

    for (const [subKey, subValue] of Object.entries(value)) {
      const subFields = fields[key] as ObjMap<unknown>;
      this._deepMerge(subFields, subKey, subValue);
    }
  }
}
