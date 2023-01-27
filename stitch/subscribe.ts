import type { ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.ts';
import { isAsyncIterable } from '../predicates/isAsyncIterable.ts';
import { isPromise } from '../predicates/isPromise.ts';
import { invariant } from '../utilities/invariant.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import { mapAsyncIterable } from './mapAsyncIterable.ts';
import { Plan } from './Plan.ts';
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
  operation.operation === OperationTypeNode.SUBSCRIPTION || invariant(false);
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
  const iteration = plan.map.entries().next();
  if (iteration.done) {
    const error = new GraphQLError('Could not route subscription.', {
      nodes: operation,
    });
    return { errors: [error] };
  }
  const [subschema, subschemaPlan] = iteration.value;
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
