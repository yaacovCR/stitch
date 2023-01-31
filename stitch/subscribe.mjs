import { GraphQLError, OperationTypeNode } from 'graphql';
import { invariant } from '../utilities/invariant.mjs';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Plan } from './Plan.mjs';
import { PlannedOperation } from './PlannedOperation.mjs';
export function subscribe(args) {
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
  const plannedOperation = new PlannedOperation(
    plan,
    operation,
    fragments,
    rawVariableValues,
  );
  return plannedOperation.subscribe();
}
