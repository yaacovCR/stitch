import { Repeater } from '@repeaterjs/repeater';
import { assertValidSchema, GraphQLError, Kind } from 'graphql';
import { isPromise } from '../predicates/isPromise.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
import { SuperSchema } from './SuperSchema.mjs';
export function execute(args) {
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
    const error = new GraphQLError(
      `Schema is not configured to execute ${exeContext.operation.operation} operation.`,
      { nodes: exeContext.operation },
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
export function buildExecutionContext(args) {
  const {
    subschemas,
    document,
    variableValues: rawVariableValues,
    operationName,
  } = args;
  for (const subschema of subschemas) {
    // If the schema used for execution is invalid, throw an error.
    assertValidSchema(subschema.schema);
  }
  const superSchema = new SuperSchema(subschemas);
  let operation;
  const fragments = [];
  const fragmentMap = Object.create(null);
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        if (operationName == null) {
          if (operation !== undefined) {
            return [
              new GraphQLError(
                'Must provide operation name if query contains multiple operations.',
              ),
            ];
          }
          operation = definition;
        } else if (definition.name?.value === operationName) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        fragments.push(definition);
        fragmentMap[definition.name.value] = definition;
        break;
      default:
      // ignore non-executable definitions
    }
  }
  if (!operation) {
    if (operationName != null) {
      return [new GraphQLError(`Unknown operation named "${operationName}".`)];
    }
    return [new GraphQLError('Must provide an operation.')];
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
