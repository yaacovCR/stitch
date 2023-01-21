import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  GraphQLSchema,
} from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { Executor } from './Stitcher.js';
export interface ExecutionArgs {
  schema: GraphQLSchema;
  document: DocumentNode;
  variableValues?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  operationName?: string | undefined;
  executor: Executor;
}
export declare function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;
export type Subscriber = (args: {
  document: DocumentNode;
  variables?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
}) => PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>>;
export interface SubscriptionArgs extends ExecutionArgs {
  subscriber: Subscriber;
}
export declare function subscribe(
  args: SubscriptionArgs,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>>;
