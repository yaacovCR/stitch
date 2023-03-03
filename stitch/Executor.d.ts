import type { Push } from '@repeaterjs/repeater';
import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  SelectionNode,
  SubsequentIncrementalExecutionResult,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';
import { Consolidator } from '../utilities/Consolidator.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';
import type { Plan } from './Plan.js';
import type { Subschema } from './SuperSchema.js';
interface TaggedSubsequentIncrementalExecutionResult {
  path: Path;
  incrementalResult: SubsequentIncrementalExecutionResult;
}
type Path = ReadonlyArray<string | number>;
interface GraphQLData {
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator<
    ExecutionResult | ExperimentalIncrementalExecutionResults,
    GraphQLError,
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >;
}
interface Parent {
  [key: string | number]: unknown;
}
/**
 * @internal
 */
export declare class Executor {
  plan: Plan;
  operation: OperationDefinitionNode;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  _consolidator:
    | Consolidator<
        TaggedSubsequentIncrementalExecutionResult,
        SubsequentIncrementalExecutionResult
      >
    | undefined;
  _deferredResults: Map<string, Array<ObjMap<unknown>>>;
  constructor(
    plan: Plan,
    operation: OperationDefinitionNode,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  );
  execute(): PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >;
  _createDocument(selections: Array<SelectionNode>): DocumentNode;
  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  >;
  _buildResponse(
    initialGraphQLData: GraphQLData,
  ): ExecutionResult | ExperimentalIncrementalExecutionResults;
  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: T,
    path: Path,
  ): void;
  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: T,
    path: Path,
  ): void;
  _push(
    incrementalResult: SubsequentIncrementalExecutionResult,
    push: Push<SubsequentIncrementalExecutionResult>,
  ): void;
  _handleIncrementalResult(
    taggedResult: TaggedSubsequentIncrementalExecutionResult,
    push: Push<SubsequentIncrementalExecutionResult>,
  ): void;
  _getDeferredSubschemas(
    plan: Plan,
    path: ReadonlyArray<string | number>,
  ): Set<Subschema> | undefined;
  _handleDeferredResult(
    data: ObjMap<unknown>,
    subPlans: ObjMap<Plan>,
    push: Push<SubsequentIncrementalExecutionResult>,
    path: Path,
  ): void;
  _getSubPlans(path: Path): ObjMap<Plan> | undefined;
  _handleInitialResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: ExecutionResult | InitialIncrementalExecutionResult,
    path: Path,
  ): void;
  _executeSubPlans(
    graphQLData: GraphQLData,
    fields: ObjMap<unknown>,
    subPlans: ObjMap<Plan>,
    path: Path,
  ): void;
  _executePossibleListSubPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    plan: Plan,
    path: Path,
  ): void;
  _executeSubPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fields: ObjMap<unknown>,
    plan: Plan,
    path: Path,
  ): void;
  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
