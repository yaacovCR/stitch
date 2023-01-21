import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  GraphQLError,
  GraphQLSchema,
  IncrementalResult,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  VariableDefinitionNode,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isPromise } from '../predicates/isPromise.js';
import { deepAssign } from '../utilities/deepAssign.js';

export type Executor = (args: {
  document: DocumentNode;
  variables?: { readonly [variable: string]: unknown } | undefined;
}) => PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;

export interface ExecutionContext {
  schema: GraphQLSchema;
  fragments: Array<FragmentDefinitionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  operation: OperationDefinitionNode;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
  rawVariableValues: { readonly [variable: string]: unknown } | undefined;
  coercedVariableValues: { [variable: string]: unknown };
  executor: Executor;
}

/**
 * @internal
 */
export class Stitcher<
  T extends
    | ExecutionResult
    | InitialIncrementalExecutionResult
    | IncrementalResult,
> {
  exeContext: ExecutionContext;

  finished: Promise<unknown>;
  originalResult: T;
  data: ObjMap<unknown> | null | undefined;
  errors: Array<GraphQLError>;
  promiseCount: number;
  // this is safe because the promise executor is executed synchronously within the constructor;
  trigger!: (value?: unknown) => void;

  constructor(exeContext: ExecutionContext, originalResult: T) {
    this.exeContext = exeContext;
    this.originalResult = originalResult;
    this.finished = new Promise((resolve) => {
      this.trigger = resolve;
    });
    this.originalResult = originalResult;
    this.data = undefined;
    this.errors = [];
    this.promiseCount = 0;
  }

  stitch(): PromiseOrValue<T> {
    if (!('data' in this.originalResult) || this.originalResult.data == null) {
      return this.originalResult;
    }

    try {
      this.merge(this.originalResult);
    } catch (error) {
      this.errors.push(error);
      return this.createResult();
    }

    if (this.promiseCount > 0) {
      return this.finished.then(() => this.createResult());
    }

    return this.createResult();
  }

  mergePossiblePromise(result: PromiseOrValue<ExecutionResult>): void {
    if (isPromise(result)) {
      this.promiseCount++;
      result.then(
        (resolved) => {
          this.promiseCount--;
          this.merge(resolved);
          if (this.promiseCount === 0) {
            this.trigger();
          }
        },
        (error) => {
          this.promiseCount--;
          this.errors.push(error);
          if (this.promiseCount === 0) {
            this.trigger();
          }
        },
      );
    } else {
      this.merge(result);
    }
  }

  merge(result: ExecutionResult): void {
    if (result.data == null) {
      this.data = null;
    } else if (this.data === undefined) {
      this.data = result.data;
    } else if (this.data !== null) {
      deepAssign(this.data, result.data);
    }

    if (result.errors) {
      this.errors.push(...result.errors);
    }
  }

  createResult(): T {
    if (this.errors.length > 0) {
      return {
        ...this.originalResult,
        data: this.data ? this.data : null,
        errors: this.errors,
      };
    }
    return {
      ...this.originalResult,
      data: this.data ? this.data : null,
    };
  }
}
