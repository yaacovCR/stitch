import { GraphQLError, OperationTypeNode } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { buildExecutionContext } from './execute.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
export function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('superSchema' in exeContext)) {
    return { errors: exeContext };
  }
  exeContext.operation.operation === OperationTypeNode.SUBSCRIPTION ||
    invariant(false);
  const rootType = exeContext.superSchema.getRootType(
    exeContext.operation.operation,
  );
  if (rootType == null) {
    const error = new GraphQLError(
      'Schema is not configured to execute subscription operation.',
      { nodes: exeContext.operation },
    );
    return { errors: [error] };
  }
  const { operation, fragments, fragmentMap, rawVariableValues } = exeContext;
  const documents = exeContext.superSchema.splitDocument(
    operation,
    fragments,
    fragmentMap,
  );
  if (documents.size === 0) {
    const error = new GraphQLError('Could not route subscription.', {
      nodes: exeContext.operation,
    });
    return { errors: [error] };
  }
  const [subschema, document] = documents.entries().next().value;
  const subscriber = subschema.subscriber;
  if (!subscriber) {
    const error = new GraphQLError(
      'Subschema is not configured to execute subscription operation.',
      { nodes: exeContext.operation },
    );
    return { errors: [error] };
  }
  const result = subscriber({
    document,
    variables: rawVariableValues,
  });
  if (isPromise(result)) {
    return result.then((resolved) => handlePossibleStream(resolved));
  }
  return handlePossibleStream(result);
}
function handlePossibleStream(result) {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) => payload);
  }
  return result;
}
