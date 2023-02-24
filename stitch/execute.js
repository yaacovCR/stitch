'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.execute = void 0;
const graphql_1 = require('graphql');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const Executor_js_1 = require('./Executor.js');
const Plan_js_1 = require('./Plan.js');
function execute(args) {
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
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new graphql_1.GraphQLError(
      `Schema is not configured to execute ${operation.operation} operation.`,
      { nodes: operation },
    );
    return { data: null, errors: [error] };
  }
  const plan = new Plan_js_1.Plan(
    superSchema,
    rootType,
    operation.selectionSet.selections,
    fragmentMap,
  );
  const executor = new Executor_js_1.Executor(
    plan,
    operation,
    fragments,
    rawVariableValues,
  );
  return executor.execute();
}
exports.execute = execute;
