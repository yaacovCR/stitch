import type { ExecutionArgs, ExecutionResult } from 'graphql';
import { subscribe as graphQLSubscribe } from 'graphql';

import type { PromiseOrValue } from '../../../types/PromiseOrValue.js';

import { stitch } from '../../stitch.js';

export function subscribeWithGraphQL(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>> {
  // casting as subscriptions cannot return incremental values
  return stitch({
    ...args,
    operationName: args.operationName ?? undefined,
    variableValues: args.variableValues ?? undefined,
    executor: ({ document, variables }) =>
      graphQLSubscribe({
        ...args,
        document,
        variableValues: variables,
      }),
  }) as PromiseOrValue<
    ExecutionResult | AsyncIterableIterator<ExecutionResult>
  >;
}
