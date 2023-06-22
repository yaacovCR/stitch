import type {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from 'graphql';
import { GraphQLError } from 'graphql';
import { Planner } from './Planner.js';
import type { Subschema } from './SuperSchema.js';
import { SuperSchema } from './SuperSchema.js';
export interface ExecutionContext {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  fragments: Array<FragmentDefinitionNode>;
  planner: Planner;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  coercedVariableValues: {
    [variable: string]: unknown;
  };
}
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
export declare function buildExecutionContext(
  args: ExecutionArgs,
): ReadonlyArray<GraphQLError> | ExecutionContext;
