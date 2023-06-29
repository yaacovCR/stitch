import type { DocumentNode, ExecutionResult, SelectionNode } from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
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
export declare class Composer {
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
  );
  compose(): PromiseOrValue<ExecutionResult>;
  _createDocument(selections: ReadonlyArray<SelectionNode>): DocumentNode;
  _buildResponse(): ExecutionResult;
  _handleMaybeAsyncResult(
    pointer: Pointer | undefined,
    fields: ObjMap<unknown>,
    subschemaPlan: SubschemaPlan,
    initialResult: PromiseOrValue<ExecutionResult>,
  ): void;
  _handleResult(
    pointer: Pointer | undefined,
    fields: ObjMap<unknown>,
    subschemaPlan: SubschemaPlan,
    result: ExecutionResult,
  ): void;
  _walkStitchPlans(
    stitchMap: AccumulatorMap<Subschema, Stitch>,
    fields: ObjMap<unknown>,
    stitchPlans: ObjMap<StitchPlan>,
  ): void;
  _performStitches(stitchMap: Map<Subschema, ReadonlyArray<Stitch>>): void;
  _collectSubFetches(
    stitchMap: AccumulatorMap<Subschema, Stitch>,
    parent: ObjMap<unknown> | Array<unknown>,
    responseKey: string | number,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    stitchPlan: StitchPlan,
  ): void;
}
export {};
