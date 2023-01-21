import type { DocumentNode, ExecutionResult } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { ExecutionArgs } from './execute.js';
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
