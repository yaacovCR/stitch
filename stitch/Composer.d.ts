import type {
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  SelectionNode,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
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
export declare class Composer {
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
  );
  compose(): PromiseOrValue<ExecutionResult>;
  _createDocument(selections: ReadonlyArray<SelectionNode>): DocumentNode;
  _buildResponse(): ExecutionResult;
  _handleMaybeAsyncResult(
    parent: ObjMap<unknown> | undefined,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan | undefined,
    result: PromiseOrValue<ExecutionResult>,
    path: Path,
  ): void;
  _handleResult(
    parent: ObjMap<unknown> | undefined,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan | undefined,
    result: ExecutionResult,
    path: Path,
  ): void;
  _collectSubQueries(
    subQueriesBySchema: AccumulatorMap<Subschema, FetchPlan>,
    fields: ObjMap<unknown>,
    subFieldPlans: ObjMap<SubFieldPlan>,
    path: Path,
  ): void;
  _collectPossibleListSubQueries(
    subQueriesBySchema: AccumulatorMap<Subschema, FetchPlan>,
    parent: ObjMap<unknown> | Array<unknown>,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    subFieldPlan: SubFieldPlan,
    path: Path,
  ): void;
  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void;
}
export {};
