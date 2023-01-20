import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  GraphQLSchema,
  IncrementalResult,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
} from 'graphql';
import {
  assertValidSchema,
  getVariableValues,
  GraphQLError,
  Kind,
  OperationTypeNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.ts';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import { invariant } from '../utilities/invariant.ts';
import { isAsyncIterable } from '../utilities/isAsyncIterable.ts';
import { isPromise } from '../utilities/isPromise.ts';
import { createRequest } from './createRequest.ts';
import { mapAsyncIterable } from './mapAsyncIterable.ts';
import type { ExecutionContext, Executor } from './Stitcher.ts';
import { Stitcher } from './Stitcher.ts';
export interface ExecutionArgs {
  schema: GraphQLSchema;
  document: DocumentNode;
  variableValues?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  operationName?: string | undefined;
  executor: Executor;
}
export function stitch(
  args: ExecutionArgs,
): PromiseOrValue<
  | ExecutionResult
  | AsyncIterableIterator<ExecutionResult>
  | ExperimentalIncrementalExecutionResults
> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('schema' in exeContext)) {
    return { errors: exeContext };
  }
  const result = delegate(exeContext);
  if (isPromise(result)) {
    return result.then((resolved) =>
      handlePossibleMultiPartResult(exeContext, resolved),
    );
  }
  return handlePossibleMultiPartResult(exeContext, result);
}
function buildExecutionContext(
  args: ExecutionArgs,
): ReadonlyArray<GraphQLError> | ExecutionContext {
  const {
    schema,
    document,
    variableValues: rawVariableValues,
    operationName,
    executor,
  } = args;
  // If the schema used for execution is invalid, throw an error.
  assertValidSchema(schema);
  let operation: OperationDefinitionNode | undefined;
  const fragments: Array<FragmentDefinitionNode> = [];
  const fragmentMap: ObjMap<FragmentDefinitionNode> = Object.create(null);
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        if (operationName == null) {
          if (operation !== undefined) {
            return [
              new GraphQLError(
                'Must provide operation name if query contains multiple operations.',
              ),
            ];
          }
          operation = definition;
        } else if (definition.name?.value === operationName) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        fragments.push(definition);
        fragmentMap[definition.name.value] = definition;
        break;
      default:
      // ignore non-executable definitions
    }
  }
  if (!operation) {
    if (operationName != null) {
      return [new GraphQLError(`Unknown operation named "${operationName}".`)];
    }
    return [new GraphQLError('Must provide an operation.')];
  }
  // FIXME: https://github.com/graphql/graphql-js/issues/2203
  /* c8 ignore next */
  const variableDefinitions = operation.variableDefinitions ?? [];
  const coercedVariableValues = getVariableValues(
    schema,
    variableDefinitions,
    rawVariableValues ?? {},
    { maxErrors: 50 },
  );
  if (coercedVariableValues.errors) {
    return coercedVariableValues.errors;
  }
  return {
    schema,
    fragments,
    fragmentMap,
    operation,
    variableDefinitions,
    rawVariableValues,
    coercedVariableValues: coercedVariableValues.coerced,
    executor,
  };
}
function delegate(
  exeContext: ExecutionContext,
): PromiseOrValue<
  | ExecutionResult
  | AsyncIterableIterator<ExecutionResult>
  | ExperimentalIncrementalExecutionResults
> {
  const rootType = exeContext.schema.getRootType(
    exeContext.operation.operation,
  );
  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${exeContext.operation.operation} operation.`,
      { nodes: exeContext.operation },
    );
    const { operation } = exeContext;
    // execution is not considered to have begun for subscriptions until the source stream is created
    if (operation.operation === OperationTypeNode.SUBSCRIPTION) {
      return { errors: [error] };
    }
    return { data: null, errors: [error] };
  }
  const { operation, fragments, rawVariableValues, executor } = exeContext;
  const document = createRequest(operation, fragments);
  return executor({
    document,
    variables: rawVariableValues,
  });
}
function handleSingleResult<
  T extends
    | ExecutionResult
    | InitialIncrementalExecutionResult
    | IncrementalResult,
>(exeContext: ExecutionContext, result: T): PromiseOrValue<T> {
  return new Stitcher(exeContext, result).stitch();
}
// executions and mutations can return incremental results
// subscriptions on successful creation will return multiple payloads
function handlePossibleMultiPartResult<
  T extends
    | ExecutionResult
    | AsyncIterableIterator<ExecutionResult>
    | ExperimentalIncrementalExecutionResults,
>(exeContext: ExecutionContext, result: T): PromiseOrValue<T> {
  if (isAsyncIterable(result)) {
    return mapAsyncIterable<ExecutionResult, ExecutionResult>(
      result,
      (payload) => handleSingleResult(exeContext, payload),
    ) as T;
  }
  if (exeContext.operation.operation === OperationTypeNode.SUBSCRIPTION) {
    // subscriptions cannot return a result containing an incremental stream
    !('initialResult' in result) || invariant(false);
    // execution is not considered to have begun for subscriptions until the source stream is created
    if (result.data == null && result.errors) {
      return { errors: result.errors } as T;
    }
    // Not reached.
    return result;
  }
  if ('initialResult' in result) {
    return {
      initialResult: handleSingleResult(exeContext, result.initialResult),
      subsequentResults: mapAsyncIterable(
        result.subsequentResults,
        (payload) => {
          if (payload.incremental) {
            const stitchedEntries: Array<PromiseOrValue<IncrementalResult>> =
              [];
            let containsPromises = false;
            for (const entry of payload.incremental) {
              const stitchedEntry = handleSingleResult(exeContext, entry);
              if (isPromise(stitchedEntry)) {
                containsPromises = true;
              }
              stitchedEntries.push(stitchedEntry);
            }
            return {
              ...payload,
              incremental: containsPromises
                ? Promise.all(stitchedEntries)
                : stitchedEntries,
            };
          }
          return payload;
        },
      ),
    } as T;
  }
  return handleSingleResult(exeContext, result) as T;
}
