import { assertValidSchema, GraphQLError, Kind } from 'graphql';
import { applySkipIncludeDirectives } from '../utilities/applySkipIncludeDirectives.mjs';
import { Planner } from './Planner.mjs';
import { SuperSchema } from './SuperSchema.mjs';
export function buildExecutionContext(args) {
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
  let operation;
  let fragments = [];
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
  const coercedVariableValues = superSchema.getVariableValues(
    variableDefinitions,
    rawVariableValues ?? {},
    { maxErrors: 50 },
  );
  if (coercedVariableValues.errors) {
    return coercedVariableValues.errors;
  }
  const coerced = coercedVariableValues.coerced;
  operation = applySkipIncludeDirectives(operation, coerced);
  const fragmentMap = Object.create(null);
  fragments = fragments.map((fragment) => {
    const processedFragment = applySkipIncludeDirectives(fragment, coerced);
    fragmentMap[fragment.name.value] = processedFragment;
    return processedFragment;
  });
  return {
    superSchema,
    operation,
    fragments,
    planner: new Planner(
      superSchema,
      operation,
      fragments,
      fragmentMap,
      variableDefinitions,
    ),
    rawVariableValues,
    coercedVariableValues: coerced,
  };
}
