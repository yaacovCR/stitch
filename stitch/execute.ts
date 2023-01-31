import type {
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import { Plan } from './Plan.ts';
import { PlanResult } from './PlanResult.ts';
export function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults> {
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
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${operation.operation} operation.`,
      { nodes: operation },
    );
    return { data: null, errors: [error] };
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
  return planResult.execute();
}
