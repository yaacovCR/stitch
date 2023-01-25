import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  VariableDefinitionNode,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { Subschema } from './SuperSchema.js';
import { SuperSchema } from './SuperSchema.js';
export interface ExecutionArgs {
  subschemas: ReadonlyArray<Subschema>;
  document: DocumentNode;
  variableValues?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  operationName?: string | undefined;
}
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
}
export declare function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;
export declare function buildExecutionContext(
  args: ExecutionArgs,
): ReadonlyArray<GraphQLError> | ExecutionContext;
