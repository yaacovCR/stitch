'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = void 0;
const graphql_1 = require('graphql');
const invariant_js_1 = require('../utilities/invariant.js');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const Executor_js_1 = require('./Executor.js');
const FieldPlan_js_1 = require('./FieldPlan.js');
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
  const { operationContext, rawVariableValues } = exeContext;
  const { superSchema, operation, fragments } = operationContext;
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
  const fieldPlan = (0, FieldPlan_js_1.createFieldPlan)(
    operationContext,
    rootType,
    operation.selectionSet.selections,
  );
  const executor = new Executor_js_1.Executor(
    fieldPlan,
    operation,
    fragments,
    rawVariableValues,
  );
  return executor.subscribe();
}
exports.subscribe = subscribe;
