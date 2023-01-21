import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import { isAsyncIterable } from '../predicates/isAsyncIterable.ts';
import { isPromise } from '../predicates/isPromise.ts';
import { invariant } from '../utilities/invariant.ts';
import { createRequest } from './createRequest.ts';
import type { ExecutionArgs } from './execute.ts';
import { buildExecutionContext } from './execute.ts';
import { mapAsyncIterable } from './mapAsyncIterable.ts';
import type { ExecutionContext } from './Stitcher.ts';
import { Stitcher } from './Stitcher.ts';
export type Subscriber = (args: {
  document: DocumentNode;
  variables?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
}) => PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>>;
export interface SubscriptionArgs extends ExecutionArgs {
  subscriber: Subscriber;
}
export function subscribe(
  args: SubscriptionArgs,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>> {
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
function delegateSubscription(
  exeContext: ExecutionContext,
  subscriber: Subscriber,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>> {
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
function handlePossibleStream<
  T extends ExecutionResult | AsyncIterableIterator<ExecutionResult>,
>(exeContext: ExecutionContext, result: T): PromiseOrValue<T> {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable<ExecutionResult, ExecutionResult>(
      result,
      (payload) => new Stitcher(exeContext, payload).stitch(),
    ) as T;
  }
  return result;
}
