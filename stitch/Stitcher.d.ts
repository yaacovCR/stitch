import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  GraphQLError,
  GraphQLSchema,
  IncrementalResult,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  VariableDefinitionNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
export type Executor = (args: {
  document: DocumentNode;
  variables?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
}) => PromiseOrValue<
  | ExecutionResult
  | AsyncIterableIterator<ExecutionResult>
  | ExperimentalIncrementalExecutionResults
>;
export interface ExecutionContext {
  schema: GraphQLSchema;
  fragments: Array<FragmentDefinitionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  operation: OperationDefinitionNode;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  coercedVariableValues: {
    [variable: string]: unknown;
  };
  executor: Executor;
}
/**
 * @internal
 */
export declare class Stitcher<
  T extends
    | ExecutionResult
    | InitialIncrementalExecutionResult
    | IncrementalResult,
> {
  exeContext: ExecutionContext;
  finished: Promise<unknown>;
  originalResult: T;
  data: ObjMap<unknown> | null | undefined;
  errors: Array<GraphQLError>;
  promiseCount: number;
  trigger: (value?: unknown) => void;
  constructor(exeContext: ExecutionContext, originalResult: T);
  stitch(): PromiseOrValue<T>;
  mergePossiblePromise(result: PromiseOrValue<ExecutionResult>): void;
  merge(result: ExecutionResult): void;
  createResult(): T;
}
