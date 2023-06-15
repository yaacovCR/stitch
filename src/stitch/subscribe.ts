import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, Kind, OperationTypeNode } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isPromise } from '../predicates/isPromise.js';

import { invariant } from '../utilities/invariant.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import { Executor } from './Executor.js';
import { createFieldPlan } from './FieldPlan.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';

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

  const { operationContext, rawVariableValues } = exeContext;
  const { superSchema, operation, fragments } = operationContext;
  invariant(operation.operation === OperationTypeNode.SUBSCRIPTION);

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

  const iteration = fieldPlan.selectionMap.entries().next();
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

  const document: DocumentNode = {
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
    return result.then((resolved) => {
      if (isAsyncIterable(resolved)) {
        return mapAsyncIterable(resolved, (payload) => {
          const executor = new Executor(
            [payload],
            fieldPlan,
            fragments,
            rawVariableValues,
          );
          return executor.execute();
        });
      }

      return result;
    });
  }

  if (isAsyncIterable(result)) {
    return mapAsyncIterable(result, (payload) => {
      const executor = new Executor(
        [payload],
        fieldPlan,
        fragments,
        rawVariableValues,
      );
      return executor.execute();
    });
  }

  return result;
}
