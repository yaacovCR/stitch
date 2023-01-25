import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isPromise } from '../predicates/isPromise.js';
import { invariant } from '../utilities/invariant.js';

import type { ExecutionArgs } from './execute.js';
import { buildExecutionContext } from './execute.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';
import type { Subschema } from './SuperSchema.js';

export function subscribe(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);

  // Return early errors if execution context failed.
  if (!('superSchema' in exeContext)) {
    return { errors: exeContext };
  }

  invariant(exeContext.operation.operation === OperationTypeNode.SUBSCRIPTION);

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

  const [subschema, document] = documents.entries().next().value as [
    Subschema,
    DocumentNode,
  ];

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

function handlePossibleStream<
  T extends ExecutionResult | AsyncIterableIterator<ExecutionResult>,
>(result: T): PromiseOrValue<T> {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable<ExecutionResult, ExecutionResult>(
      result,
      (payload) => payload,
    ) as T;
  }

  return result;
}
