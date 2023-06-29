import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, Kind, OperationTypeNode } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isPromise } from '../predicates/isPromise.js';

import { invariant } from '../utilities/invariant.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import { compose } from './compose.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';

export function subscribe(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | SimpleAsyncGenerator<ExecutionResult>> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);

  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }

  const { operation, planner, rawVariableValues, coercedVariableValues } =
    exeContext;
  invariant(operation.operation === OperationTypeNode.SUBSCRIPTION);

  const rootFieldPlan = planner.createRootFieldPlan(coercedVariableValues);
  if (rootFieldPlan instanceof GraphQLError) {
    return { errors: [rootFieldPlan] };
  }

  const subschemaPlan = rootFieldPlan.subschemaPlans[0];
  if (subschemaPlan === undefined) {
    const error = new GraphQLError('Could not route subscription.', {
      nodes: operation,
    });

    return { errors: [error] };
  }

  const subschema = subschemaPlan.toSubschema;
  const subscriber = subschema.subscriber;
  if (!subscriber) {
    const error = new GraphQLError(
      'Subschema is not configured to execute subscription operation.',
      { nodes: operation },
    );

    return { errors: [error] };
  }

  const document: DocumentNode = {
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
        return mapAsyncIterable(resolved, (payload) =>
          compose(
            [
              {
                subschemaPlan,
                initialResult: payload,
              },
            ],
            rootFieldPlan.superSchema,
            rawVariableValues,
          ),
        );
      }

      return result;
    });
  }

  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) =>
      compose(
        [
          {
            subschemaPlan,
            initialResult: payload,
          },
        ],
        rootFieldPlan.superSchema,
        rawVariableValues,
      ),
    );
  }

  return result;
}
