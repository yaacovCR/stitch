import { Repeater } from '@repeaterjs/repeater';
import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  IncrementalResult,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  SubsequentIncrementalExecutionResult,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.ts';
import { isPromise } from '../predicates/isPromise.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import { mapAsyncIterable } from './mapAsyncIterable.ts';
import { Plan } from './Plan.ts';
export function execute(
  args: ExecutionArgs,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('operationContext' in exeContext)) {
    return { errors: exeContext };
  }
  const {
    operationContext: { superSchema, operation, fragments, fragmentMap },
    rawVariableValues,
  } = exeContext;
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${operation.operation} operation.`,
      { nodes: operation },
    );
    return { data: null, errors: [error] };
  }
  const plan = new Plan(
    superSchema,
    rootType,
    operation.selectionSet,
    fragmentMap,
  );
  const results = executePlan(plan, operation, fragments, rawVariableValues);
  if (isPromise(results)) {
    return results.then((resolvedResults) =>
      handlePossibleMultiPartResults(resolvedResults),
    );
  }
  return handlePossibleMultiPartResults(results);
}
function executePlan(
  plan: Plan,
  operation: OperationDefinitionNode,
  fragments: ReadonlyArray<FragmentDefinitionNode>,
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined,
): PromiseOrValue<
  Array<ExecutionResult | ExperimentalIncrementalExecutionResults>
> {
  const results: Array<
    PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>
  > = [];
  let containsPromise = false;
  for (const [subschema, selectionSet] of plan.map.entries()) {
    const document: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [{ ...operation, selectionSet }, ...fragments],
    };
    const result = subschema.executor({
      document,
      variables: rawVariableValues,
    });
    if (isPromise(result)) {
      containsPromise = true;
    }
    results.push(result);
  }
  return containsPromise
    ? Promise.all(results)
    : (results as Array<
        ExecutionResult | ExperimentalIncrementalExecutionResults
      >);
}
function handlePossibleMultiPartResults<
  T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
>(
  results: Array<T>,
): PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults> {
  if (results.length === 1) {
    return results[0];
  }
  const initialResults: Array<
    ExecutionResult | InitialIncrementalExecutionResult
  > = [];
  const asyncIterators: Array<
    SimpleAsyncGenerator<SubsequentIncrementalExecutionResult>
  > = [];
  for (const result of results) {
    if ('initialResult' in result) {
      initialResults.push(result.initialResult);
      asyncIterators.push(result.subsequentResults);
    } else {
      initialResults.push(result);
    }
  }
  if (asyncIterators.length === 0) {
    return mergeInitialResults(initialResults, false);
  }
  return {
    initialResult: mergeInitialResults(
      initialResults,
      true,
    ) as InitialIncrementalExecutionResult,
    subsequentResults: mergeSubsequentResults(asyncIterators),
  };
}
function mergeInitialResults(
  results: Array<ExecutionResult | InitialIncrementalExecutionResult>,
  hasNext: boolean,
): ExecutionResult | InitialIncrementalExecutionResult {
  const data = Object.create(null);
  const errors: Array<GraphQLError> = [];
  let nullData = false;
  for (const result of results) {
    if (result.errors != null) {
      errors.push(...result.errors);
    }
    if (nullData) {
      continue;
    }
    if (result.data == null) {
      nullData = true;
      continue;
    }
    Object.assign(data, result.data);
  }
  const dataOrNull = nullData ? null : data;
  if (hasNext) {
    return errors.length > 0
      ? { data: dataOrNull, errors, hasNext }
      : { data: dataOrNull, hasNext };
  }
  return errors.length > 0
    ? { data: dataOrNull, errors }
    : { data: dataOrNull };
}
function mergeSubsequentResults(
  asyncIterators: Array<AsyncGenerator<SubsequentIncrementalExecutionResult>>,
): SimpleAsyncGenerator<SubsequentIncrementalExecutionResult> {
  const mergedAsyncIterator = Repeater.merge(asyncIterators);
  return mapAsyncIterable(mergedAsyncIterator, (payload) => {
    const incremental: Array<IncrementalResult> = [];
    if (payload.incremental) {
      for (const entry of payload.incremental) {
        incremental.push(entry);
      }
      return {
        ...payload,
        incremental,
      };
    }
    return payload;
  });
}
