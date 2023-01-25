import type { ExecutionResult } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { ExecutionArgs } from './execute.js';
export declare function subscribe(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>>;
