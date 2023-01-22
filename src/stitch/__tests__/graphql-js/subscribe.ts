import type { ExecutionArgs, ExecutionResult } from 'graphql';
import {
  execute as graphQLExecute,
  subscribe as graphQLSubscribe,
} from 'graphql';

import type { PromiseOrValue } from '../../../types/PromiseOrValue.js';

import { subscribe as gatewaySubscribe } from '../../subscribe.js';

export function subscribeWithGraphQL(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>> {
  // casting as subscriptions cannot return incremental values
  return gatewaySubscribe({
    ...args,
    schemas: [args.schema],
    operationName: args.operationName ?? undefined,
    variableValues: args.variableValues ?? undefined,
    executor: ({ document, variables }) =>
      graphQLExecute({
        ...args,
        document,
        variableValues: variables,
      }),
    subscriber: ({ document, variables }) =>
      graphQLSubscribe({
        ...args,
        document,
        variableValues: variables,
      }),
  });
}
