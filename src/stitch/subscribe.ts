import type { ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { invariant } from '../utilities/invariant.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import { Plan } from './Plan.js';
import { PlanResult } from './PlanResult.js';

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
    operationContext: { superSchema, operation, fragments, fragmentMap },
    rawVariableValues,
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

  const plan = new Plan(
    superSchema,
    rootType,
    operation.selectionSet.selections,
    fragmentMap,
  );

  const planResult = new PlanResult(
    plan,
    operation,
    fragments,
    rawVariableValues,
  );

  return planResult.subscribe();
}
