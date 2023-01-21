import { GraphQLError, OperationTypeNode } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { createRequest } from './createRequest.mjs';
import { buildExecutionContext } from './execute.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
import { Stitcher } from './Stitcher.mjs';
export function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('schema' in exeContext)) {
    return { errors: exeContext };
  }
  exeContext.operation.operation === OperationTypeNode.SUBSCRIPTION ||
    invariant(false);
  const result = delegateSubscription(exeContext, args.subscriber);
  if (isPromise(result)) {
    return result.then((resolved) =>
      handlePossibleStream(exeContext, resolved),
    );
  }
  return handlePossibleStream(exeContext, result);
}
function delegateSubscription(exeContext, subscriber) {
  const rootType = exeContext.schema.getRootType(
    exeContext.operation.operation,
  );
  if (rootType == null) {
    const error = new GraphQLError(
      'Schema is not configured to execute subscription operation.',
      { nodes: exeContext.operation },
    );
    return { errors: [error] };
  }
  const { operation, fragments, rawVariableValues } = exeContext;
  const document = createRequest(operation, fragments);
  return subscriber({
    document,
    variables: rawVariableValues,
  });
}
function handlePossibleStream(exeContext, result) {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) =>
      new Stitcher(exeContext, payload).stitch(),
    );
  }
  return result;
}
