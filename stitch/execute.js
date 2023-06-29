'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.execute = void 0;
const graphql_1 = require('graphql');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const Composer_js_1 = require('./Composer.js');
function execute(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = (0, buildExecutionContext_js_1.buildExecutionContext)(
    args,
  );
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { operation, planner, rawVariableValues, coercedVariableValues } =
    exeContext;
  const rootFieldPlan = planner.createRootFieldPlan(coercedVariableValues);
  if (rootFieldPlan instanceof graphql_1.GraphQLError) {
    return { data: null, errors: [rootFieldPlan] };
  }
  const subschemaPlanResults = [];
  for (const subschemaPlan of rootFieldPlan.subschemaPlans) {
    subschemaPlanResults.push(
      toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues),
    );
  }
  const composer = new Composer_js_1.Composer(
    subschemaPlanResults,
    rootFieldPlan.superSchema,
    rawVariableValues,
  );
  return composer.compose();
}
exports.execute = execute;
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
