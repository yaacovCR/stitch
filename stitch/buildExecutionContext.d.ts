import type { DocumentNode } from 'graphql';
import { GraphQLError } from 'graphql';
import type { ExecutionContext, Subschema } from './SuperSchema.js';
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
