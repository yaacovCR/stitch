import type { ExecutionResult } from 'graphql';
import { GraphQLError, OperationTypeNode } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.ts';
import { invariant } from '../utilities/invariant.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import { Plan } from './Plan.ts';
import { PlanResult } from './PlanResult.ts';
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
  operation.operation === OperationTypeNode.SUBSCRIPTION || invariant(false);
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
