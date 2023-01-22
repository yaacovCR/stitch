'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildExecutionContext = exports.execute = void 0;
const graphql_1 = require('graphql');
const isPromise_js_1 = require('../predicates/isPromise.js');
const createRequest_js_1 = require('./createRequest.js');
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
  const result = delegate(exeContext);
  if ((0, isPromise_js_1.isPromise)(result)) {
    return result.then((resolved) => handlePossibleMultiPartResult(resolved));
  }
  return handlePossibleMultiPartResult(result);
}
exports.execute = execute;
function buildExecutionContext(args) {
  const {
    schemas,
    document,
    variableValues: rawVariableValues,
    operationName,
    executor,
  } = args;
  for (const schema of schemas) {
    // If the schema used for execution is invalid, throw an error.
    (0, graphql_1.assertValidSchema)(schema);
  }
  const superSchema = new SuperSchema_js_1.SuperSchema(schemas);
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
    executor,
  };
}
exports.buildExecutionContext = buildExecutionContext;
function delegate(exeContext) {
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
  const { operation, fragments, rawVariableValues, executor } = exeContext;
  const document = (0, createRequest_js_1.createRequest)(operation, fragments);
  return executor({
    document,
    variables: rawVariableValues,
  });
}
function handlePossibleMultiPartResult(result) {
  if ('initialResult' in result) {
    return {
      initialResult: result.initialResult,
      subsequentResults: (0, mapAsyncIterable_js_1.mapAsyncIterable)(
        result.subsequentResults,
        (payload) => {
          if (payload.incremental) {
            const stitchedEntries = [];
            let containsPromises = false;
            for (const entry of payload.incremental) {
              const stitchedEntry = entry;
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
  return result;
}
