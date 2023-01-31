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
  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(parent: ObjMap<unknown>, result: T): void;
  _handleAsyncPossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(parent: ObjMap<unknown>, promiseContext: PromiseContext, result: T): void;
  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(parent: ObjMap<unknown>, result: T): void;
  _handleSingleResult(
    parent: ObjMap<unknown>,
    result: ExecutionResult | InitialIncrementalExecutionResult,
  ): void;
  _executeSubPlan(parent: ObjMap<unknown>, subPlan: Plan): void;
  _deepMerge(parent: ObjMap<unknown>, key: string, value: unknown): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
