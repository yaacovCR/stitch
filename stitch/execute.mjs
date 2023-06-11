import { GraphQLError } from 'graphql';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Executor } from './Executor.mjs';
import { createPlan } from './Plan.mjs';
export function execute(args) {
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
