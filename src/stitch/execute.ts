import type { ExecutionResult } from 'graphql';
import { GraphQLError } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import { Executor } from './Executor.js';
import { createPlan } from './Plan.js';

export function execute(args: ExecutionArgs): PromiseOrValue<ExecutionResult> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);

  // Return early errors if execution context failed.
  if (!('operationContext' in exeContext)) {
    return { errors: exeContext };
  }

  const { operationContext, rawVariableValues } = exeContext;
  const { superSchema, operation, fragments } = operationContext;

  const rootType = superSchema.getRootType(operation.operation);

  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${operation.operation} operation.`,
      { nodes: operation },
    );

    return { data: null, errors: [error] };
  }

  const plan = createPlan(
    operationContext,
    rootType,
    operation.selectionSet.selections,
  );

  const executor = new Executor(plan, operation, fragments, rawVariableValues);

  return executor.execute();
}
