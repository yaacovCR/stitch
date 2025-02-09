import type {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from 'graphql';
import { assertValidSchema, GraphQLError, Kind } from 'graphql';
import { inlineFragments } from '../utilities/inlineFragments.js';
import type { Planner } from './Planner.ts';
import { createPlanner } from './Planner.ts';
import type { Subschema, VariableValues } from './SuperSchema.ts';
import { SuperSchema } from './SuperSchema.ts';
export interface ExecutionContext {
  operation: OperationDefinitionNode;
  planner: Planner;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  variableValues: VariableValues;
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
export function buildExecutionContext(
  args: ExecutionArgs,
): ReadonlyArray<GraphQLError> | ExecutionContext {
  const {
    subschemas,
    document,
    variableValues: rawVariableValues,
    operationName,
  } = args;
  for (const subschema of subschemas) {
    // If the schema used for execution is invalid, throw an error.
    assertValidSchema(subschema.schema);
  }
  const superSchema = new SuperSchema(subschemas);
  let operation: OperationDefinitionNode | undefined;
  const fragments: Array<FragmentDefinitionNode> = [];
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        if (operationName == null) {
          if (operation !== undefined) {
            return [
              new GraphQLError(
                'Must provide operation name if query contains multiple operations.',
              ),
            ];
          }
          operation = definition;
        } else if (definition.name?.value === operationName) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        fragments.push(definition);
        break;
      default:
      // ignore non-executable definitions
    }
  }
  if (!operation) {
    if (operationName != null) {
      return [new GraphQLError(`Unknown operation named "${operationName}".`)];
    }
    return [new GraphQLError('Must provide an operation.')];
  }
  // FIXME: https://github.com/graphql/graphql-js/issues/2203
  /* c8 ignore next */
  const variableDefinitions = operation.variableDefinitions ?? [];
  const variableValuesOrErrors = superSchema.getVariableValues(
    variableDefinitions,
    rawVariableValues ?? {},
    { maxErrors: 50 },
  );
  if (variableValuesOrErrors.errors) {
    return variableValuesOrErrors.errors;
  }
  operation = inlineFragments(operation, fragments);
  return {
    operation,
    planner: createPlanner(superSchema, operation),
    rawVariableValues,
    variableValues: variableValuesOrErrors.variableValues,
  };
}
