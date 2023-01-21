import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  GraphQLSchema,
  IncrementalResult,
  OperationDefinitionNode,
} from 'graphql';
import {
  assertValidSchema,
  getVariableValues,
  GraphQLError,
  Kind,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isPromise } from '../predicates/isPromise.js';

import { createRequest } from './createRequest.js';
import { mapAsyncIterable } from './mapAsyncIterable.js';
import type { ExecutionContext, Executor } from './Stitcher.js';
import { Stitcher } from './Stitcher.js';

export interface ExecutionArgs {
  schema: GraphQLSchema;
  document: DocumentNode;
  variableValues?: { readonly [variable: string]: unknown } | undefined;
  operationName?: string | undefined;
  executor: Executor;
}

export function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults> {
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

export function buildExecutionContext(
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
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults> {
  const rootType = exeContext.schema.getRootType(
    exeContext.operation.operation,
  );

  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${exeContext.operation.operation} operation.`,
      { nodes: exeContext.operation },
    );

    return { data: null, errors: [error] };
  }

  const { operation, fragments, rawVariableValues, executor } = exeContext;

  const document = createRequest(operation, fragments);

  return executor({
    document,
    variables: rawVariableValues,
  });
}

function handlePossibleMultiPartResult<
  T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
>(exeContext: ExecutionContext, result: T): PromiseOrValue<T> {
  if ('initialResult' in result) {
    return {
      initialResult: new Stitcher(exeContext, result.initialResult).stitch(),
      subsequentResults: mapAsyncIterable(
        result.subsequentResults,
        (payload) => {
          if (payload.incremental) {
            const stitchedEntries: Array<PromiseOrValue<IncrementalResult>> =
              [];

            let containsPromises = false;
            for (const entry of payload.incremental) {
              const stitchedEntry = new Stitcher(exeContext, entry).stitch();
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

  return new Stitcher(exeContext, result).stitch() as T;
}
