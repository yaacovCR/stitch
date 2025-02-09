import { GraphQLError, Kind } from 'graphql';
import { buildExecutionContext } from "./buildExecutionContext.mjs";
import { compose } from "./compose.mjs";
export function execute(args) {
    // If a valid execution context cannot be created due to incorrect arguments,
    // a "Response" with only errors is returned.
    const exeContext = buildExecutionContext(args);
    // Return early errors if execution context failed.
    if (!('planner' in exeContext)) {
        return { errors: exeContext };
    }
    const { operation, planner, rawVariableValues, variableValues } = exeContext;
    const plan = planner.createRootPlan(variableValues);
    if (plan instanceof GraphQLError) {
        return { data: null, errors: [plan] };
    }
    const subschemaPlanResults = [];
    for (const subschemaPlan of plan.subschemaPlans) {
        subschemaPlanResults.push(toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues));
    }
    return compose(subschemaPlanResults, plan.superSchema, rawVariableValues);
}
function toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues) {
    const document = {
        kind: Kind.DOCUMENT,
        definitions: [
            {
                ...operation,
                selectionSet: {
                    kind: Kind.SELECTION_SET,
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
