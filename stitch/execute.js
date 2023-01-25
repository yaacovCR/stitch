'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildExecutionContext = exports.execute = void 0;
const repeater_1 = require('@repeaterjs/repeater');
const graphql_1 = require('graphql');
const isPromise_js_1 = require('../predicates/isPromise.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
const SuperSchema_js_1 = require('./SuperSchema.js');
function execute(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('superSchema' in exeContext)) {
    return { errors: exeContext };
  }
  const rootType = exeContext.superSchema.getRootType(
    exeContext.operation.operation,
  );
  if (rootType == null) {
    const error = new graphql_1.GraphQLError(
      `Schema is not configured to execute ${exeContext.operation.operation} operation.`,
      { nodes: exeContext.operation },
    );
    return { data: null, errors: [error] };
  }
  const results = delegateRootFields(exeContext);
  if ((0, isPromise_js_1.isPromise)(results)) {
    return results.then((resolvedResults) =>
      handlePossibleMultiPartResults(resolvedResults),
    );
  }
  return handlePossibleMultiPartResults(results);
}
exports.execute = execute;
function buildExecutionContext(args) {
  const {
    subschemas,
    document,
    variableValues: rawVariableValues,
    operationName,
  } = args;
  for (const subschema of subschemas) {
    // If the schema used for execution is invalid, throw an error.
    (0, graphql_1.assertValidSchema)(subschema.schema);
  }
  const superSchema = new SuperSchema_js_1.SuperSchema(subschemas);
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
  const coercedVariableValues = superSchema.getVariableValues(
    variableDefinitions,
    rawVariableValues ?? {},
    { maxErrors: 50 },
  );
  if (coercedVariableValues.errors) {
    return coercedVariableValues.errors;
  }
  return {
    superSchema,
    fragments,
    fragmentMap,
    operation,
    variableDefinitions,
    rawVariableValues,
    coercedVariableValues: coercedVariableValues.coerced,
  };
}
exports.buildExecutionContext = buildExecutionContext;
function delegateRootFields(exeContext) {
  const { operation, fragments, fragmentMap, rawVariableValues } = exeContext;
  const documents = exeContext.superSchema.splitDocument(
    operation,
    fragments,
    fragmentMap,
  );
  const results = [];
  let containsPromise = false;
  for (const [subschema, document] of documents.entries()) {
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
  if (hasNext) {
    return errors.length > 0 ? { data, errors, hasNext } : { data, hasNext };
  }
  return errors.length > 0 ? { data, errors } : { data };
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
