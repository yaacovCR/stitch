import { Repeater } from '@repeaterjs/repeater';
import { GraphQLError } from 'graphql';
import { isPromise } from '../predicates/isPromise.mjs';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
import { Plan } from './Plan.mjs';
export function execute(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('operationContext' in exeContext)) {
    return { errors: exeContext };
  }
  const {
    operationContext: { superSchema, operation },
  } = exeContext;
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${operation.operation} operation.`,
      { nodes: operation },
    );
    return { data: null, errors: [error] };
  }
  const results = delegateRootFields(exeContext);
  if (isPromise(results)) {
    return results.then((resolvedResults) =>
      handlePossibleMultiPartResults(resolvedResults),
    );
  }
  return handlePossibleMultiPartResults(results);
}
function delegateRootFields(exeContext) {
  const { operationContext, rawVariableValues } = exeContext;
  const { superSchema } = operationContext;
  const plan = new Plan(superSchema, operationContext);
  const results = [];
  let containsPromise = false;
  for (const [subschema, subschemaPlan] of plan.map.entries()) {
    const result = subschema.executor({
      document: subschemaPlan.document,
      variables: rawVariableValues,
    });
    if (isPromise(result)) {
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
  const mergedAsyncIterator = Repeater.merge(asyncIterators);
  return mapAsyncIterable(mergedAsyncIterator, (payload) => {
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
  });
}
