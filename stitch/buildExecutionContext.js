"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExecutionContext = buildExecutionContext;
const graphql_1 = require("graphql");
const inlineFragments_js_1 = require("../utilities/inlineFragments.js");
const Planner_js_1 = require("./Planner.js");
const SuperSchema_js_1 = require("./SuperSchema.js");
function buildExecutionContext(args) {
    const { subschemas, document, variableValues: rawVariableValues, operationName, } = args;
    for (const subschema of subschemas) {
        // If the schema used for execution is invalid, throw an error.
        (0, graphql_1.assertValidSchema)(subschema.schema);
    }
    const superSchema = new SuperSchema_js_1.SuperSchema(subschemas);
    let operation;
    const fragments = [];
    for (const definition of document.definitions) {
        switch (definition.kind) {
            case graphql_1.Kind.OPERATION_DEFINITION:
                if (operationName == null) {
                    if (operation !== undefined) {
                        return [
                            new graphql_1.GraphQLError('Must provide operation name if query contains multiple operations.'),
                        ];
                    }
                    operation = definition;
                }
                else if (definition.name?.value === operationName) {
                    operation = definition;
                }
                break;
            case graphql_1.Kind.FRAGMENT_DEFINITION:
                fragments.push(definition);
                break;
            default:
            // ignore non-executable definitions
        }
    }
    if (!operation) {
        if (operationName != null) {
            return [new graphql_1.GraphQLError(`Unknown operation named "${operationName}".`)];
        }
        return [new graphql_1.GraphQLError('Must provide an operation.')];
    }
    // FIXME: https://github.com/graphql/graphql-js/issues/2203
    /* c8 ignore next */
    const variableDefinitions = operation.variableDefinitions ?? [];
    const variableValuesOrErrors = superSchema.getVariableValues(variableDefinitions, rawVariableValues ?? {}, { maxErrors: 50 });
    if (variableValuesOrErrors.errors) {
        return variableValuesOrErrors.errors;
    }
    operation = (0, inlineFragments_js_1.inlineFragments)(operation, fragments);
    return {
        operation,
        planner: (0, Planner_js_1.createPlanner)(superSchema, operation),
        rawVariableValues,
        variableValues: variableValuesOrErrors.variableValues,
    };
}
