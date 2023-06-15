import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, Kind, OperationTypeNode } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.ts';
import { isAsyncIterable } from '../predicates/isAsyncIterable.ts';
import { isPromise } from '../predicates/isPromise.ts';
import { invariant } from '../utilities/invariant.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import { Composer } from './Composer.ts';
import { createFieldPlan } from './FieldPlan.ts';
import { mapAsyncIterable } from './mapAsyncIterable.ts';
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
          const composer = new Composer(
            [payload],
            fieldPlan,
            fragments,
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
        [payload],
        fieldPlan,
        fragments,
        rawVariableValues,
      );
      return composer.compose();
    });
  }
  return result;
}
