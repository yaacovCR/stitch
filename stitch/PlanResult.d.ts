import type {
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
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
export declare class PlanResult {
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
  _incrementPromiseContext(): PromiseContext;
  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  >;
  _return(): PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >;
  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(result: T): void;
  _handleSingleResult(
    result: ExecutionResult | InitialIncrementalExecutionResult,
  ): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
