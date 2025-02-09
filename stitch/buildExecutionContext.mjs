import { assertValidSchema, GraphQLError, Kind } from 'graphql';
import { inlineFragments } from '../utilities/inlineFragments.js';
import { createPlanner } from "./Planner.mjs";
import { SuperSchema } from "./SuperSchema.mjs";
export function buildExecutionContext(args) {
    const { subschemas, document, variableValues: rawVariableValues, operationName, } = args;
    for (const subschema of subschemas) {
        // If the schema used for execution is invalid, throw an error.
        assertValidSchema(subschema.schema);
    }
    const superSchema = new SuperSchema(subschemas);
    let operation;
    const fragments = [];
    for (const definition of document.definitions) {
        switch (definition.kind) {
            case Kind.OPERATION_DEFINITION:
                if (operationName == null) {
                    if (operation !== undefined) {
                        return [
                            new GraphQLError('Must provide operation name if query contains multiple operations.'),
                        ];
                    }
                    operation = definition;
                }
                else if (definition.name?.value === operationName) {
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
    const variableValuesOrErrors = superSchema.getVariableValues(variableDefinitions, rawVariableValues ?? {}, { maxErrors: 50 });
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
