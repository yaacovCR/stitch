import type { ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isPromise } from '../predicates/isPromise.js';
import { invariant } from '../utilities/invariant.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';
import type { SubschemaPlan } from './Plan.js';
import { Plan } from './Plan.js';
import type { Subschema } from './SuperSchema.js';

export function subscribe(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | SimpleAsyncGenerator<ExecutionResult>> {
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
  invariant(operation.operation === OperationTypeNode.SUBSCRIPTION);

  const rootType = superSchema.getRootType(operation.operation);

  if (rootType == null) {
    const error = new GraphQLError(
      'Schema is not configured to execute subscription operation.',
      { nodes: operation },
    );

    return { errors: [error] };
  }

  const { operationContext, rawVariableValues } = exeContext;

  const plan = new Plan(superSchema, operationContext);

  if (plan.map.size === 0) {
    const error = new GraphQLError('Could not route subscription.', {
      nodes: operation,
    });

    return { errors: [error] };
  }

  const [subschema, subschemaPlan] = plan.map.entries().next().value as [
    Subschema,
    SubschemaPlan,
  ];

  const subscriber = subschema.subscriber;
  if (!subscriber) {
    const error = new GraphQLError(
      'Subschema is not configured to execute subscription operation.',
      { nodes: operation },
    );

    return { errors: [error] };
  }

  const result = subscriber({
    document: subschemaPlan.document,
    variables: rawVariableValues,
  });

  if (isPromise(result)) {
    return result.then((resolved) => handlePossibleStream(resolved));
  }
  return handlePossibleStream(result);
}

function handlePossibleStream<
  T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
>(result: T): PromiseOrValue<T> {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) => payload) as T;
  }

  return result;
}
