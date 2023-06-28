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
  const stitches = [];
  for (const [subschema, subschemaPlan] of rootFieldPlan.subschemaPlans) {
    stitches.push(
      toStitch(subschema, subschemaPlan, operation, rawVariableValues),
    );
  }
  const composer = new Composer(
    stitches,
    rootFieldPlan.superSchema,
    rawVariableValues,
  );
  return composer.compose();
}
function toStitch(subschema, subschemaPlan, operation, rawVariableValues) {
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
    fromSubschema: subschema,
    stitchTrees: subschemaPlan.stitchTrees,
    initialResult: subschema.executor({
      document,
      variables: rawVariableValues,
    }),
  };
}
