import { GraphQLError, OperationTypeNode } from 'graphql';
import { invariant } from '../utilities/invariant.mjs';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Executor } from './Executor.mjs';
import { createFieldPlan } from './FieldPlan.mjs';
export function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('operationContext' in exeContext)) {
    return { errors: exeContext };
  }
  const { operationContext, rawVariableValues } = exeContext;
  const { superSchema, operation, fragments } = operationContext;
  operation.operation === OperationTypeNode.SUBSCRIPTION || invariant(false);
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new GraphQLError(
      'Schema is not configured to execute subscription operation.',
      { nodes: operation },
    );
    return { errors: [error] };
  }
  const fieldPlan = createFieldPlan(
    operationContext,
    rootType,
    operation.selectionSet.selections,
  );
  const executor = new Executor(
    fieldPlan,
    operation,
    fragments,
    rawVariableValues,
  );
  return executor.subscribe();
}
