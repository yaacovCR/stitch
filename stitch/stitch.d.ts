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
export declare function stitch(
  args: ExecutionArgs,
): PromiseOrValue<
  | ExecutionResult
  | AsyncIterableIterator<ExecutionResult>
  | ExperimentalIncrementalExecutionResults
>;
