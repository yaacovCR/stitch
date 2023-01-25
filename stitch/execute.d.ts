import type {
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
} from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { ExecutionArgs } from './buildExecutionContext.js';
export declare function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;
