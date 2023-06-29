import type {
  DocumentNode,
  ExecutionResult,
  FieldNode,
  SelectionNode,
} from 'graphql';
import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isPromise } from '../predicates/isPromise.js';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';

import type { StitchPlan } from './Planner.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';

type Path = ReadonlyArray<string | number>;

export interface Stitch {
  fromSubschema: Subschema;
  stitchPlans: ObjMap<StitchPlan> | undefined;
  initialResult: PromiseOrValue<ExecutionResult>;
}

interface FetchPlan {
  fieldNodes: ReadonlyArray<FieldNode>;
  stitchPlans: ObjMap<StitchPlan> | undefined;
  parent: ObjMap<unknown>;
  target: ObjMap<unknown>;
  path: Path;
}

/**
 * @internal
 */
export class Composer {
  stitches: Array<Stitch>;
  superSchema: SuperSchema;
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
    stitches: Array<Stitch>,
    superSchema: SuperSchema,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  ) {
    this.stitches = stitches;
    this.superSchema = superSchema;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator();
  }

  compose(): PromiseOrValue<ExecutionResult> {
    for (const stitch of this.stitches) {
      this._handleMaybeAsyncResult(undefined, this.fields, stitch, []);
    }

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
    stitch: Stitch,
    path: Path,
  ): void {
    const initialResult = stitch.initialResult;
    if (!isPromise(initialResult)) {
      this._handleResult(parent, fields, stitch, initialResult, path);
      return;
    }

    const promise = initialResult.then(
      (resolved) => this._handleResult(parent, fields, stitch, resolved, path),
      (err) =>
        this._handleResult(
          parent,
          fields,
          stitch,
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
    stitch: Stitch | undefined,
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
      fields[key] = value;
    }

    if (stitch?.stitchPlans !== undefined) {
      const subFetchMap = new AccumulatorMap<Subschema, FetchPlan>();
      this._walkStitchPlans(subFetchMap, result.data, stitch.stitchPlans, path);
      for (const [subschema, subFetches] of subFetchMap) {
        for (const subFetch of subFetches) {
          // TODO: batch subStitches by accessors
          // TODO: batch subStitches by subschema?
          const subStitch: Stitch = {
            fromSubschema: subschema,
            stitchPlans: subFetch.stitchPlans,
            initialResult: subschema.executor({
              document: this._createDocument(subFetch.fieldNodes),
              variables: this.rawVariableValues,
            }),
          };

          this._handleMaybeAsyncResult(
            subFetch.parent,
            subFetch.target,
            subStitch,
            subFetch.path,
          );
        }
      }
    }
  }

  _walkStitchPlans(
    subFetchMap: AccumulatorMap<Subschema, FetchPlan>,
    fields: ObjMap<unknown>,
    stitchPlans: ObjMap<StitchPlan>,
    path: Path,
  ): void {
    for (const [key, stitchPlan] of Object.entries(stitchPlans)) {
      if (fields[key] !== undefined) {
        this._collectSubFetches(
          subFetchMap,
          fields,
          fields[key] as ObjMap<unknown> | Array<unknown>,
          stitchPlan,
          [...path, key],
        );
      }
    }
  }

  _collectSubFetches(
    subFetchMap: AccumulatorMap<Subschema, FetchPlan>,
    parent: ObjMap<unknown> | Array<unknown>,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    stitchPlan: StitchPlan,
    path: Path,
  ): void {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._collectSubFetches(
          subFetchMap,
          fieldsOrList,
          fieldsOrList[i] as ObjMap<unknown>,
          stitchPlan,
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

    const type = this.superSchema.getType(typeName);

    invariant(
      isObjectType(type),
      `Expected Object type, received '${typeName}'.`,
    );

    const fieldPlan = stitchPlan.get(type);

    invariant(
      fieldPlan !== undefined,
      `Missing field plan for type '${typeName}'.`,
    );

    for (const [subschema, subschemaPlan] of fieldPlan.subschemaPlans) {
      subFetchMap.add(subschema, {
        fieldNodes: subschemaPlan.fieldNodes,
        stitchPlans: subschemaPlan.stitchPlans,
        parent: parent as ObjMap<unknown>,
        target: fieldsOrList,
        path,
      });
    }

    this._walkStitchPlans(
      subFetchMap,
      fieldsOrList,
      fieldPlan.stitchPlans,
      path,
    );
  }
}
