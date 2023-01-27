import { assert } from 'chai';
import type {
  ExecutionArgs,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
} from 'graphql';
import { experimentalExecuteIncrementally as graphqlExecute } from 'graphql';

import type { PromiseOrValue } from '../../../types/PromiseOrValue.js';

import { isAsyncIterable } from '../../../predicates/isAsyncIterable.js';
import { isPromise } from '../../../predicates/isPromise.js';

import { execute as gatewayExecute } from '../../execute.js';

export function executeWithGraphQL(
  args: ExecutionArgs,
): PromiseOrValue<
  | ExecutionResult
  | AsyncGenerator<ExecutionResult, void, void>
  | ExperimentalIncrementalExecutionResults
> {
  return gatewayExecute({
    ...args,
    subschemas: [
      {
        schema: args.schema,
        executor: ({ document, variables }) =>
          graphqlExecute({
            ...args,
            schema: args.schema,
            document,
            variableValues: variables,
          }),
      },
    ],
    operationName: args.operationName ?? undefined,
    variableValues: args.variableValues ?? undefined,
  });
}

export function executeSyncWithGraphQL(args: ExecutionArgs): ExecutionResult {
  const result = executeWithGraphQL(args);

  assert(
    !isPromise(result) &&
      !isAsyncIterable(result) &&
      !('initialResult' in result),
  );

  return result;
}
