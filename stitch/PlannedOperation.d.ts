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
import type { ObjMap } from 'graphql/jsutils/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';
import { Consolidator } from '../utilities/Consolidator.js';
import type { Plan } from './Plan.js';
interface PromiseContext {
  promiseCount: number;
  promise: Promise<void>;
  trigger: () => void;
}
/**
 * @internal
 */
export declare class PlannedOperation {
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
  _consolidator: Consolidator<SubsequentIncrementalExecutionResult> | undefined;
  _promiseContext: PromiseContext | undefined;
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
  _incrementPromiseContext(): PromiseContext;
  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  >;
  _return(): PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >;
  _handleAsyncPossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(
    path: Array<number | string>,
    promiseContext: PromiseContext,
    result: T,
  ): void;
  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(path: Array<string | number>, result: T): void;
  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(path: Array<string | number>, result: T): void;
  _handleSingleResult(
    path: Array<string | number>,
    result: ExecutionResult | InitialIncrementalExecutionResult,
  ): void;
  _getParentAtPath<P>(
    path: Array<string | number>,
    data: P,
  ): ObjMap<unknown> | Array<unknown>;
  _executeSubPlan(subPlan: Plan, path: Array<string | number>): void;
  _deepMerge<P extends ObjMap<unknown> | Array<unknown>>(
    parent: P,
    key: keyof P,
    value: unknown,
  ): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
