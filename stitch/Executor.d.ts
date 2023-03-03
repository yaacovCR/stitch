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
  _data: ObjMap<unknown>;
  _nullData: boolean;
  _errors: Array<GraphQLError>;
  _consolidator:
    | Consolidator<
        TaggedSubsequentIncrementalExecutionResult,
        SubsequentIncrementalExecutionResult
      >
    | undefined;
  _deferredResults: Map<string, Array<ObjMap<unknown>>>;
  _promiseAggregator: PromiseAggregator<
    ExecutionResult | ExperimentalIncrementalExecutionResults,
    GraphQLError,
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >;
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
  _return(): ExecutionResult | ExperimentalIncrementalExecutionResults;
  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(parent: ObjMap<unknown>, result: T, path: Path): void;
  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(parent: ObjMap<unknown>, result: T, path: Path): void;
  _handleIncrementalResult(
    taggedResult: TaggedSubsequentIncrementalExecutionResult,
  ): SubsequentIncrementalExecutionResult | undefined;
  _getDeferredSubschemas(
    plan: Plan,
    path: ReadonlyArray<string | number>,
  ): Set<Subschema> | undefined;
  _handleSingleResult(
    parent: ObjMap<unknown>,
    result: ExecutionResult | InitialIncrementalExecutionResult,
    path: Path,
  ): void;
  _executeSubPlans(
    data: ObjMap<unknown>,
    subPlans: ObjMap<Plan>,
    path: Path,
  ): void;
  _executePossibleListSubPlan(
    parent: ObjMap<unknown> | Array<unknown>,
    plan: Plan,
    path: Path,
  ): void;
  _executeSubPlan(parent: ObjMap<unknown>, plan: Plan, path: Path): void;
  _deepMerge(parent: ObjMap<unknown>, key: string, value: unknown): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
