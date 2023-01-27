'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const invariant_js_1 = require('../utilities/invariant.js');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
const Plan_js_1 = require('./Plan.js');
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
    operationContext: { superSchema, operation },
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
  const { operationContext, rawVariableValues } = exeContext;
  const plan = new Plan_js_1.Plan(superSchema, operationContext);
  const iteration = plan.map.entries().next();
  if (iteration.done) {
    const error = new graphql_1.GraphQLError('Could not route subscription.', {
      nodes: operation,
    });
    return { errors: [error] };
  }
  const [subschema, subschemaPlan] = iteration.value;
  const subscriber = subschema.subscriber;
  if (!subscriber) {
    const error = new graphql_1.GraphQLError(
      'Subschema is not configured to execute subscription operation.',
      { nodes: operation },
    );
    return { errors: [error] };
  }
  const result = subscriber({
    document: subschemaPlan.document,
    variables: rawVariableValues,
  });
  if ((0, isPromise_js_1.isPromise)(result)) {
    return result.then((resolved) => handlePossibleStream(resolved));
  }
  return handlePossibleStream(result);
}
exports.subscribe = subscribe;
function handlePossibleStream(result) {
  if ((0, isAsyncIterable_js_1.isAsyncIterable)(result)) {
    return (0, mapAsyncIterable_js_1.mapAsyncIterable)(
      result,
      (payload) => payload,
    );
  }
  return result;
}
