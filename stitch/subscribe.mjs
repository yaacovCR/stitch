import { GraphQLError, Kind, OperationTypeNode } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
import { Plan } from './Plan.mjs';
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
  const iteration = plan.map.entries().next();
  if (iteration.done) {
    const error = new GraphQLError('Could not route subscription.', {
      nodes: operation,
    });
    return { errors: [error] };
  }
  const [subschema, subschemaSelections] = iteration.value;
  const subscriber = subschema.subscriber;
  if (!subscriber) {
    const error = new GraphQLError(
      'Subschema is not configured to execute subscription operation.',
      { nodes: operation },
    );
    return { errors: [error] };
  }
  const document = {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        ...operation,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subschemaSelections,
        },
      },
      ...fragments,
    ],
  };
  const result = subscriber({
    document,
    variables: rawVariableValues,
  });
  if (isPromise(result)) {
    return result.then((resolved) => handlePossibleStream(resolved));
  }
  return handlePossibleStream(result);
}
function handlePossibleStream(result) {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) => payload);
  }
  return result;
}
