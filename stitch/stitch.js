'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.stitch = void 0;
const graphql_1 = require('graphql');
const invariant_js_1 = require('../utilities/invariant.js');
const isAsyncIterable_js_1 = require('../utilities/isAsyncIterable.js');
const isPromise_js_1 = require('../utilities/isPromise.js');
const createRequest_js_1 = require('./createRequest.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
const Stitcher_js_1 = require('./Stitcher.js');
function stitch(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('schema' in exeContext)) {
    return { errors: exeContext };
  }
  const result = delegate(exeContext);
  if ((0, isPromise_js_1.isPromise)(result)) {
    return result.then((resolved) =>
      handlePossibleMultiPartResult(exeContext, resolved),
    );
  }
  return handlePossibleMultiPartResult(exeContext, result);
}
exports.stitch = stitch;
function buildExecutionContext(args) {
  const {
    schema,
    document,
    variableValues: rawVariableValues,
    operationName,
    executor,
  } = args;
  // If the schema used for execution is invalid, throw an error.
  (0, graphql_1.assertValidSchema)(schema);
  let operation;
  const fragments = [];
  const fragmentMap = Object.create(null);
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case graphql_1.Kind.OPERATION_DEFINITION:
        if (operationName == null) {
          if (operation !== undefined) {
            return [
              new graphql_1.GraphQLError(
                'Must provide operation name if query contains multiple operations.',
              ),
            ];
          }
          operation = definition;
        } else if (definition.name?.value === operationName) {
          operation = definition;
        }
        break;
      case graphql_1.Kind.FRAGMENT_DEFINITION:
        fragments.push(definition);
        fragmentMap[definition.name.value] = definition;
        break;
      default:
      // ignore non-executable definitions
    }
  }
  if (!operation) {
    if (operationName != null) {
      return [
        new graphql_1.GraphQLError(
          `Unknown operation named "${operationName}".`,
        ),
      ];
    }
    return [new graphql_1.GraphQLError('Must provide an operation.')];
  }
  // FIXME: https://github.com/graphql/graphql-js/issues/2203
  /* c8 ignore next */
  const variableDefinitions = operation.variableDefinitions ?? [];
  const coercedVariableValues = (0, graphql_1.getVariableValues)(
    schema,
    variableDefinitions,
    rawVariableValues ?? {},
    { maxErrors: 50 },
  );
  if (coercedVariableValues.errors) {
    return coercedVariableValues.errors;
  }
  return {
    schema,
    fragments,
    fragmentMap,
    operation,
    variableDefinitions,
    rawVariableValues,
    coercedVariableValues: coercedVariableValues.coerced,
    executor,
  };
}
function delegate(exeContext) {
  const rootType = exeContext.schema.getRootType(
    exeContext.operation.operation,
  );
  if (rootType == null) {
    const error = new graphql_1.GraphQLError(
      `Schema is not configured to execute ${exeContext.operation.operation} operation.`,
      { nodes: exeContext.operation },
    );
    const { operation } = exeContext;
    // execution is not considered to have begun for subscriptions until the source stream is created
    if (operation.operation === graphql_1.OperationTypeNode.SUBSCRIPTION) {
      return { errors: [error] };
    }
    return { data: null, errors: [error] };
  }
  const { operation, fragments, rawVariableValues, executor } = exeContext;
  const document = (0, createRequest_js_1.createRequest)(operation, fragments);
  return executor({
    document,
    variables: rawVariableValues,
  });
}
function handleSingleResult(exeContext, result) {
  return new Stitcher_js_1.Stitcher(exeContext, result).stitch();
}
// executions and mutations can return incremental results
// subscriptions on successful creation will return multiple payloads
function handlePossibleMultiPartResult(exeContext, result) {
  if ((0, isAsyncIterable_js_1.isAsyncIterable)(result)) {
    return (0, mapAsyncIterable_js_1.mapAsyncIterable)(result, (payload) =>
      handleSingleResult(exeContext, payload),
    );
  }
  if (
    exeContext.operation.operation === graphql_1.OperationTypeNode.SUBSCRIPTION
  ) {
    // subscriptions cannot return a result containing an incremental stream
    !('initialResult' in result) || (0, invariant_js_1.invariant)(false);
    // execution is not considered to have begun for subscriptions until the source stream is created
    if (result.data == null && result.errors) {
      return { errors: result.errors };
    }
    // Not reached.
    return result;
  }
  if ('initialResult' in result) {
    return {
      initialResult: handleSingleResult(exeContext, result.initialResult),
      subsequentResults: (0, mapAsyncIterable_js_1.mapAsyncIterable)(
        result.subsequentResults,
        (payload) => {
          if (payload.incremental) {
            const stitchedEntries = [];
            let containsPromises = false;
            for (const entry of payload.incremental) {
              const stitchedEntry = handleSingleResult(exeContext, entry);
              if ((0, isPromise_js_1.isPromise)(stitchedEntry)) {
                containsPromises = true;
              }
              stitchedEntries.push(stitchedEntry);
            }
            return {
              ...payload,
              incremental: containsPromises
                ? Promise.all(stitchedEntries)
                : stitchedEntries,
            };
          }
          return payload;
        },
      ),
    };
  }
  return handleSingleResult(exeContext, result);
}
