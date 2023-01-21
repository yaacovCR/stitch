import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isPromise } from '../predicates/isPromise.js';
import { invariant } from '../utilities/invariant.js';

import { createRequest } from './createRequest.js';
import type { ExecutionArgs } from './execute.js';
import { buildExecutionContext } from './execute.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';
import type { ExecutionContext } from './Stitcher.js';
import { Stitcher } from './Stitcher.js';

export type Subscriber = (args: {
  document: DocumentNode;
  variables?: { readonly [variable: string]: unknown } | undefined;
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

  invariant(exeContext.operation.operation === OperationTypeNode.SUBSCRIPTION);

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
