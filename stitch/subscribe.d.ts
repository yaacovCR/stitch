import type { ExecutionResult } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';
import type { ExecutionArgs } from './buildExecutionContext.js';
export declare function subscribe(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | SimpleAsyncGenerator<ExecutionResult>>;
