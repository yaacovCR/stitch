'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const invariant_js_1 = require('../utilities/invariant.js');
const createRequest_js_1 = require('./createRequest.js');
const execute_js_1 = require('./execute.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
const Stitcher_js_1 = require('./Stitcher.js');
function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = (0, execute_js_1.buildExecutionContext)(args);
  // Return early errors if execution context failed.
  if (!('schema' in exeContext)) {
    return { errors: exeContext };
  }
  exeContext.operation.operation === graphql_1.OperationTypeNode.SUBSCRIPTION ||
    (0, invariant_js_1.invariant)(false);
  const result = delegateSubscription(exeContext, args.subscriber);
  if ((0, isPromise_js_1.isPromise)(result)) {
    return result.then((resolved) =>
      handlePossibleStream(exeContext, resolved),
    );
  }
  return handlePossibleStream(exeContext, result);
}
exports.subscribe = subscribe;
function delegateSubscription(exeContext, subscriber) {
  const rootType = exeContext.schema.getRootType(
    exeContext.operation.operation,
  );
  if (rootType == null) {
    const error = new graphql_1.GraphQLError(
      'Schema is not configured to execute subscription operation.',
      { nodes: exeContext.operation },
    );
    return { errors: [error] };
  }
  const { operation, fragments, rawVariableValues } = exeContext;
  const document = (0, createRequest_js_1.createRequest)(operation, fragments);
  return subscriber({
    document,
    variables: rawVariableValues,
  });
}
function handlePossibleStream(exeContext, result) {
  if ((0, isAsyncIterable_js_1.isAsyncIterable)(result)) {
    return (0, mapAsyncIterable_js_1.mapAsyncIterable)(result, (payload) =>
      new Stitcher_js_1.Stitcher(exeContext, payload).stitch(),
    );
  }
  return result;
}
