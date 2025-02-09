import type { DocumentNode, OperationDefinitionNode } from 'graphql';
import { GraphQLError } from 'graphql';
import type { Planner } from './Planner.js';
import type { Subschema } from './SuperSchema.js';
export interface ExecutionContext {
    operation: OperationDefinitionNode;
    planner: Planner;
    rawVariableValues: {
        readonly [variable: string]: unknown;
    } | undefined;
    coercedVariableValues: {
        [variable: string]: unknown;
    };
}
export interface ExecutionArgs {
    subschemas: ReadonlyArray<Subschema>;
    document: DocumentNode;
    variableValues?: {
        readonly [variable: string]: unknown;
    } | undefined;
    operationName?: string | undefined;
}
export declare function buildExecutionContext(args: ExecutionArgs): ReadonlyArray<GraphQLError> | ExecutionContext;
