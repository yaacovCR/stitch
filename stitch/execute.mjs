import { assertValidSchema, GraphQLError, Kind } from 'graphql';
import { isPromise } from '../predicates/isPromise.mjs';
import { createRequest } from './createRequest.mjs';
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
  const result = delegate(exeContext);
  if (isPromise(result)) {
    return result.then((resolved) => handlePossibleMultiPartResult(resolved));
  }
  return handlePossibleMultiPartResult(result);
}
export function buildExecutionContext(args) {
  const {
    schemas,
    document,
    variableValues: rawVariableValues,
    operationName,
    executor,
  } = args;
  for (const schema of schemas) {
    // If the schema used for execution is invalid, throw an error.
    assertValidSchema(schema);
  }
  const superSchema = new SuperSchema(schemas);
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
    executor,
  };
}
function delegate(exeContext) {
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
  const { operation, fragments, rawVariableValues, executor } = exeContext;
  const document = createRequest(operation, fragments);
  return executor({
    document,
    variables: rawVariableValues,
  });
}
function handlePossibleMultiPartResult(result) {
  if ('initialResult' in result) {
    return {
      initialResult: result.initialResult,
      subsequentResults: mapAsyncIterable(
        result.subsequentResults,
        (payload) => {
          if (payload.incremental) {
            const stitchedEntries = [];
            let containsPromises = false;
            for (const entry of payload.incremental) {
              const stitchedEntry = entry;
              if (isPromise(stitchedEntry)) {
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
