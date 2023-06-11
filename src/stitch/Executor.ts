import type {
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionNode,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isObjectLike } from '../predicates/isObjectLike.js';
import { isPromise } from '../predicates/isPromise.js';

import { PromiseAggregator } from '../utilities/PromiseAggregator.js';

import type { FieldPlan } from './FieldPlan.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';

type Path = ReadonlyArray<string | number>;

interface GraphQLData {
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator;
}

interface Parent {
  [key: string | number]: unknown;
}

/**
 * @internal
 */
export class Executor {
  fieldPlan: FieldPlan;
  operation: OperationDefinitionNode;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;

  constructor(
    fieldPlan: FieldPlan,
    operation: OperationDefinitionNode,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  ) {
    this.fieldPlan = fieldPlan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
  }

  execute(): PromiseOrValue<ExecutionResult> {
    const initialGraphQLData: GraphQLData = {
      fields: Object.create(null),
      errors: [],
      nulled: false,
      promiseAggregator: new PromiseAggregator(),
    };

    for (const [
      subschema,
      subschemaSelections,
    ] of this.fieldPlan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });

      this._handleMaybeAsyncResult(
        initialGraphQLData,
        undefined,
        initialGraphQLData.fields,
        result,
        [],
      );
    }

    if (initialGraphQLData.promiseAggregator.isEmpty()) {
      return this._buildResponse(initialGraphQLData);
    }

    return initialGraphQLData.promiseAggregator
      .resolved()
      .then(() => this._buildResponse(initialGraphQLData));
  }

  _createDocument(selections: Array<SelectionNode>): DocumentNode {
    return {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...this.operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections,
          },
        },
        ...this.fragments,
      ],
    };
  }

  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  > {
    const iteration = this.fieldPlan.selectionMap.entries().next();
    if (iteration.done) {
      const error = new GraphQLError('Could not route subscription.', {
        nodes: this.operation,
      });

      return { errors: [error] };
    }

    const [subschema, subschemaSelections] = iteration.value;

    const subscriber = subschema.subscriber;
    if (!subscriber) {
      const error = new GraphQLError(
        'Subschema is not configured to execute subscription operation.',
        { nodes: this.operation },
      );

      return { errors: [error] };
    }

    const document = this._createDocument(subschemaSelections);

    const result = subscriber({
      document,
      variables: this.rawVariableValues,
    });

    if (isPromise(result)) {
      return result.then((resolved) => this._handlePossibleStream(resolved));
    }
    return this._handlePossibleStream(result);
  }

  _buildResponse(initialGraphQLData: GraphQLData): ExecutionResult {
    const fieldsOrNull = initialGraphQLData.nulled
      ? null
      : initialGraphQLData.fields;

    return initialGraphQLData.errors.length > 0
      ? { data: fieldsOrNull, errors: initialGraphQLData.errors }
      : { data: fieldsOrNull };
  }

  _handleMaybeAsyncResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: PromiseOrValue<ExecutionResult>,
    path: Path,
  ): void {
    if (!isPromise(result)) {
      this._handleInitialResult(graphQLData, parent, fields, result, path);
      return;
    }

    const promise = result.then(
      (resolved) =>
        this._handleInitialResult(graphQLData, parent, fields, resolved, path),
      (err) =>
        this._handleInitialResult(
          graphQLData,
          parent,
          fields,
          {
            data: null,
            errors: [new GraphQLError(err.message, { originalError: err })],
          },
          path,
        ),
    );

    graphQLData.promiseAggregator.add(promise);
  }

  _getSubFieldPlans(path: Path): ObjMap<FieldPlan> | undefined {
    let subFieldPlans = this.fieldPlan.subFieldPlans;
    for (const key of path) {
      if (typeof key === 'number') {
        continue;
      }
      if (subFieldPlans[key] === undefined) {
        return undefined;
      }
      subFieldPlans = subFieldPlans[key].subFieldPlans;
    }
    return subFieldPlans;
  }

  _handleInitialResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: ExecutionResult,
    path: Path,
  ): void {
    if (result.errors != null) {
      graphQLData.errors.push(...result.errors);
    }

    const parentKey: string | number | undefined = path[path.length - 1];
    if (parent !== undefined) {
      if (parent[parentKey] === null) {
        return;
      }
    } else if (graphQLData.nulled) {
      return;
    }

    if (result.data == null) {
      if (parentKey === undefined) {
        graphQLData.nulled = true;
      } else if (parent) {
        parent[parentKey] = null;
        // TODO: null bubbling?
      }
      return;
    }

    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(fields, key, value);
    }

    this._executeSubFieldPlans(
      graphQLData,
      result.data,
      this.fieldPlan.subFieldPlans,
      path,
    );
  }

  _executeSubFieldPlans(
    graphQLData: GraphQLData,
    fields: ObjMap<unknown>,
    subFieldPlans: ObjMap<FieldPlan>,
    path: Path,
  ): void {
    for (const [key, subFieldPlan] of Object.entries(subFieldPlans)) {
      if (fields[key] !== undefined) {
        this._executePossibleListSubFieldPlan(
          graphQLData,
          fields,
          fields[key] as ObjMap<unknown> | Array<unknown>,
          subFieldPlan,
          [...path, key],
        );
      }
    }
  }

  _executePossibleListSubFieldPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    fieldPlan: FieldPlan,
    path: Path,
  ): void {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._executePossibleListSubFieldPlan(
          graphQLData,
          fieldsOrList as unknown as Parent,
          fieldsOrList[i] as ObjMap<unknown>,
          fieldPlan,
          [...path, i],
        );
      }
      return;
    }

    this._executeSubFieldPlan(
      graphQLData,
      parent,
      fieldsOrList,
      fieldPlan,
      path,
    );
  }

  _executeSubFieldPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan,
    path: Path,
  ): void {
    for (const [
      subschema,
      subschemaSelections,
    ] of fieldPlan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });

      this._handleMaybeAsyncResult(graphQLData, parent, fields, result, path);
    }

    this._executeSubFieldPlans(
      graphQLData,
      fields,
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

  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T> {
    if (isAsyncIterable(result)) {
      return mapAsyncIterable(result, (payload) => payload) as T;
    }

    return result;
  }
}
