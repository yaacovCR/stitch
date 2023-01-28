'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.execute = void 0;
const repeater_1 = require('@repeaterjs/repeater');
const graphql_1 = require('graphql');
const isPromise_js_1 = require('../predicates/isPromise.js');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
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
    operation.selectionSet,
    fragmentMap,
  );
  const results = executePlan(plan, operation, fragments, rawVariableValues);
  if ((0, isPromise_js_1.isPromise)(results)) {
    return results.then((resolvedResults) =>
      handlePossibleMultiPartResults(resolvedResults),
    );
  }
  return handlePossibleMultiPartResults(results);
}
exports.execute = execute;
function executePlan(plan, operation, fragments, rawVariableValues) {
  const results = [];
  let containsPromise = false;
  for (const [subschema, selectionSet] of plan.map.entries()) {
    const document = {
      kind: graphql_1.Kind.DOCUMENT,
      definitions: [{ ...operation, selectionSet }, ...fragments],
    };
    const result = subschema.executor({
      document,
      variables: rawVariableValues,
    });
    if ((0, isPromise_js_1.isPromise)(result)) {
      containsPromise = true;
    }
    results.push(result);
  }
  return containsPromise ? Promise.all(results) : results;
}
function handlePossibleMultiPartResults(results) {
  if (results.length === 1) {
    return results[0];
  }
  const initialResults = [];
  const asyncIterators = [];
  for (const result of results) {
    if ('initialResult' in result) {
      initialResults.push(result.initialResult);
      asyncIterators.push(result.subsequentResults);
    } else {
      initialResults.push(result);
    }
  }
  if (asyncIterators.length === 0) {
    return mergeInitialResults(initialResults, false);
  }
  return {
    initialResult: mergeInitialResults(initialResults, true),
    subsequentResults: mergeSubsequentResults(asyncIterators),
  };
}
function mergeInitialResults(results, hasNext) {
  const data = Object.create(null);
  const errors = [];
  let nullData = false;
  for (const result of results) {
    if (result.errors != null) {
      errors.push(...result.errors);
    }
    if (nullData) {
      continue;
    }
    if (result.data == null) {
      nullData = true;
      continue;
    }
    Object.assign(data, result.data);
  }
  const dataOrNull = nullData ? null : data;
  if (hasNext) {
    return errors.length > 0
      ? { data: dataOrNull, errors, hasNext }
      : { data: dataOrNull, hasNext };
  }
  return errors.length > 0
    ? { data: dataOrNull, errors }
    : { data: dataOrNull };
}
function mergeSubsequentResults(asyncIterators) {
  const mergedAsyncIterator = repeater_1.Repeater.merge(asyncIterators);
  return (0, mapAsyncIterable_js_1.mapAsyncIterable)(
    mergedAsyncIterator,
    (payload) => {
      const incremental = [];
      if (payload.incremental) {
        for (const entry of payload.incremental) {
          incremental.push(entry);
        }
        return {
          ...payload,
          incremental,
        };
      }
      return payload;
    },
  );
}
