"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = execute;
const graphql_1 = require("graphql");
const buildExecutionContext_js_1 = require("./buildExecutionContext.js");
const compose_js_1 = require("./compose.js");
function execute(args) {
    // If a valid execution context cannot be created due to incorrect arguments,
    // a "Response" with only errors is returned.
    const exeContext = (0, buildExecutionContext_js_1.buildExecutionContext)(args);
    // Return early errors if execution context failed.
    if (!('planner' in exeContext)) {
        return { errors: exeContext };
    }
    const { operation, planner, rawVariableValues, variableValues } = exeContext;
    const plan = planner.createRootPlan(variableValues);
    if (plan instanceof graphql_1.GraphQLError) {
        return { data: null, errors: [plan] };
    }
    const subschemaPlanResults = [];
    for (const subschemaPlan of plan.subschemaPlans) {
        subschemaPlanResults.push(toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues));
    }
    return (0, compose_js_1.compose)(subschemaPlanResults, plan.superSchema, rawVariableValues);
}
function toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues) {
    const document = {
        kind: graphql_1.Kind.DOCUMENT,
        definitions: [
            {
                ...operation,
                selectionSet: {
                    kind: graphql_1.Kind.SELECTION_SET,
                    selections: subschemaPlan.fieldNodes,
                },
            },
        ],
    };
    return {
        subschemaPlan,
        initialResult: subschemaPlan.toSubschema.executor({
            document,
            variables: rawVariableValues,
        }),
    };
}
