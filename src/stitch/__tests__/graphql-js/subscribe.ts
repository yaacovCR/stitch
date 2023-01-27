import type { ExecutionArgs, ExecutionResult } from 'graphql';
import {
  execute as graphQLExecute,
  subscribe as graphQLSubscribe,
} from 'graphql';

import type { PromiseOrValue } from '../../../types/PromiseOrValue.js';

import { subscribe as gatewaySubscribe } from '../../subscribe.js';

export function subscribeWithGraphQL(
  args: ExecutionArgs,
): PromiseOrValue<
  ExecutionResult | AsyncGenerator<ExecutionResult, void, void>
> {
  // casting as subscriptions cannot return incremental values
  return gatewaySubscribe({
    ...args,
    subschemas: [
      {
        schema: args.schema,
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
      },
    ],
    operationName: args.operationName ?? undefined,
    variableValues: args.variableValues ?? undefined,
  });
}
