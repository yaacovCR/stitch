'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = void 0;
const graphql_1 = require('graphql');
const invariant_js_1 = require('../utilities/invariant.js');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const Plan_js_1 = require('./Plan.js');
const PlanResult_js_1 = require('./PlanResult.js');
function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = (0, buildExecutionContext_js_1.buildExecutionContext)(
    args,
  );
  // Return early errors if execution context failed.
  if (!('operationContext' in exeContext)) {
    return { errors: exeContext };
  }
  const {
    operationContext: { superSchema, operation, fragments, fragmentMap },
    rawVariableValues,
  } = exeContext;
  operation.operation === graphql_1.OperationTypeNode.SUBSCRIPTION ||
    (0, invariant_js_1.invariant)(false);
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new graphql_1.GraphQLError(
      'Schema is not configured to execute subscription operation.',
      { nodes: operation },
    );
    return { errors: [error] };
  }
  const plan = new Plan_js_1.Plan(
    superSchema,
    rootType,
    operation.selectionSet.selections,
    fragmentMap,
  );
  const planResult = new PlanResult_js_1.PlanResult(
    plan,
    operation,
    fragments,
    rawVariableValues,
  );
  return planResult.subscribe();
}
exports.subscribe = subscribe;
