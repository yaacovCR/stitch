import { GraphQLError, Kind, OperationTypeNode } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Composer } from './Composer.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
export function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { operation, planner, rawVariableValues, coercedVariableValues } =
    exeContext;
  operation.operation === OperationTypeNode.SUBSCRIPTION || invariant(false);
  const fieldPlan = planner.createRootFieldPlan(coercedVariableValues);
  if (fieldPlan instanceof GraphQLError) {
    return { errors: [fieldPlan] };
  }
  const iteration = fieldPlan.subschemaPlans.entries().next();
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
  const document = {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        ...operation,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subschemaPlan.fieldNodes,
        },
      },
    ],
  };
  const result = subscriber({
    document,
    variables: rawVariableValues,
  });
  if (isPromise(result)) {
    return result.then((resolved) => {
      if (isAsyncIterable(resolved)) {
        return mapAsyncIterable(resolved, (payload) => {
          const composer = new Composer(
            [
              {
                subschema,
                stitchTrees: fieldPlan.stitchTrees,
                initialResult: payload,
              },
            ],
            fieldPlan.superSchema,
            rawVariableValues,
          );
          return composer.compose();
        });
      }
      return result;
    });
  }
  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) => {
      const composer = new Composer(
        [
          {
            subschema,
            stitchTrees: fieldPlan.stitchTrees,
            initialResult: payload,
          },
        ],
        fieldPlan.superSchema,
        rawVariableValues,
      );
      return composer.compose();
    });
  }
  return result;
}
