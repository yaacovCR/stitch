import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  GraphQLSchema,
  OperationDefinitionNode,
  VariableDefinitionNode,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import { SuperSchema } from './SuperSchema.js';
export interface ExecutionArgs {
  schemas: ReadonlyArray<GraphQLSchema>;
  document: DocumentNode;
  variableValues?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  operationName?: string | undefined;
  executor: Executor;
}
export type Executor = (args: {
  document: DocumentNode;
  variables?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
}) => PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;
export interface ExecutionContext {
  superSchema: SuperSchema;
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
export declare function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;
export declare function buildExecutionContext(
  args: ExecutionArgs,
): ReadonlyArray<GraphQLError> | ExecutionContext;
