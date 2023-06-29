import { GraphQLError, Kind } from 'graphql';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Composer } from './Composer.mjs';
export function execute(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { operation, planner, rawVariableValues, coercedVariableValues } =
    exeContext;
  const rootFieldPlan = planner.createRootFieldPlan(coercedVariableValues);
  if (rootFieldPlan instanceof GraphQLError) {
    return { data: null, errors: [rootFieldPlan] };
  }
  const subschemaPlanResults = [];
  for (const subschemaPlan of rootFieldPlan.subschemaPlans) {
    subschemaPlanResults.push(
      toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues),
    );
  }
  const composer = new Composer(
    subschemaPlanResults,
    rootFieldPlan.superSchema,
    rawVariableValues,
  );
  return composer.compose();
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
