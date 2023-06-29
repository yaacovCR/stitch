import type { DocumentNode, ExecutionResult, SelectionNode } from 'graphql';
import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isPromise } from '../predicates/isPromise.js';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';

import type { StitchPlan, SubschemaPlan } from './Planner.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';

export interface SubschemaPlanResult {
  subschemaPlan: SubschemaPlan;
  initialResult: PromiseOrValue<ExecutionResult>;
}

interface Pointer {
  parent: ObjMap<unknown>;
  responseKey: string | number;
}

interface Stitch {
  subschemaPlan: SubschemaPlan;
  target: ObjMap<unknown>;
  pointer: Pointer | undefined;
}

/**
 * @internal
 */
export class Composer {
  subschemaPlanResults: Array<SubschemaPlanResult>;
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
    subschemaPlanResults: Array<SubschemaPlanResult>,
    superSchema: SuperSchema,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  ) {
    this.subschemaPlanResults = subschemaPlanResults;
    this.superSchema = superSchema;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator();
  }

  compose(): PromiseOrValue<ExecutionResult> {
    for (const subschemaPlanResult of this.subschemaPlanResults) {
      const { subschemaPlan, initialResult } = subschemaPlanResult;
      this._handleMaybeAsyncResult(
        undefined,
        this.fields,
        subschemaPlan,
        initialResult,
      );
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
    pointer: Pointer | undefined,
    fields: ObjMap<unknown>,
    subschemaPlan: SubschemaPlan,
    initialResult: PromiseOrValue<ExecutionResult>,
  ): void {
    if (!isPromise(initialResult)) {
      this._handleResult(pointer, fields, subschemaPlan, initialResult);
      return;
    }

    const promise = initialResult.then(
      (resolved) =>
        this._handleResult(pointer, fields, subschemaPlan, resolved),
      (err) =>
        this._handleResult(pointer, fields, subschemaPlan, {
          data: null,
          errors: [new GraphQLError(err.message, { originalError: err })],
        }),
    );

    this.promiseAggregator.add(promise);
  }

  _handleResult(
    pointer: Pointer | undefined,
    fields: ObjMap<unknown>,
    subschemaPlan: SubschemaPlan,
    result: ExecutionResult,
  ): void {
    if (result.errors != null) {
      this.errors.push(...result.errors);
    }

    if (pointer !== undefined) {
      if (pointer.parent[pointer.responseKey] === null) {
        return;
      }
    } else if (this.nulled) {
      return;
    }

    if (result.data == null) {
      if (pointer === undefined) {
        this.nulled = true;
      } else {
        pointer.parent[pointer.responseKey] = null;
        // TODO: null bubbling?
      }
      return;
    }

    for (const [key, value] of Object.entries(result.data)) {
      fields[key] = value;
    }

    if (subschemaPlan.stitchPlans !== undefined) {
      const stitchMap = new AccumulatorMap<Subschema, Stitch>();
      this._walkStitchPlans(stitchMap, result.data, subschemaPlan.stitchPlans);
      this._performStitches(stitchMap);
    }
  }

  _walkStitchPlans(
    stitchMap: AccumulatorMap<Subschema, Stitch>,
    fields: ObjMap<unknown>,
    stitchPlans: ObjMap<StitchPlan>,
  ): void {
    for (const [key, stitchPlan] of Object.entries(stitchPlans)) {
      if (fields[key] !== undefined) {
        this._collectSubFetches(
          stitchMap,
          fields,
          key,
          fields[key] as ObjMap<unknown> | Array<unknown>,
          stitchPlan,
        );
      }
    }
  }

  _performStitches(stitchMap: Map<Subschema, ReadonlyArray<Stitch>>): void {
    for (const [subschema, stitches] of stitchMap) {
      for (const stitch of stitches) {
        // TODO: batch subStitches by accessors
        // TODO: batch subStitches by subschema?
        const subschemaPlan = stitch.subschemaPlan;
        const initialResult = subschema.executor({
          document: this._createDocument(stitch.subschemaPlan.fieldNodes),
          variables: this.rawVariableValues,
        });
        this._handleMaybeAsyncResult(
          stitch.pointer,
          stitch.target,
          subschemaPlan,
          initialResult,
        );
      }
    }
  }

  _collectSubFetches(
    stitchMap: AccumulatorMap<Subschema, Stitch>,
    parent: ObjMap<unknown> | Array<unknown>,
    responseKey: string | number,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    stitchPlan: StitchPlan,
  ): void {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._collectSubFetches(
          stitchMap,
          fieldsOrList,
          i,
          fieldsOrList[i] as ObjMap<unknown>,
          stitchPlan,
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

    for (const subschemaPlan of fieldPlan.subschemaPlans) {
      stitchMap.add(subschemaPlan.toSubschema, {
        subschemaPlan,
        pointer: {
          parent: parent as ObjMap<unknown>,
          responseKey,
        },
        target: fieldsOrList,
      });
    }

    this._walkStitchPlans(stitchMap, fieldsOrList, fieldPlan.stitchPlans);
  }
}
