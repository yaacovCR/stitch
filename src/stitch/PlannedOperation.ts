import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  SelectionNode,
  SubsequentIncrementalExecutionResult,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';
import type { ObjMap } from 'graphql/jsutils/ObjMap.js';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isObjectLike } from '../predicates/isObjectLike.js';
import { isPromise } from '../predicates/isPromise.js';
import { Consolidator } from '../utilities/Consolidator.js';

import { mapAsyncIterable } from './mapAsyncIterable.js';
import type { Plan } from './Plan.js';

interface PromiseContext {
  promiseCount: number;
  promise: Promise<void>;
  trigger: () => void;
}

/**
 * @internal
 */
export class PlannedOperation {
  plan: Plan;
  operation: OperationDefinitionNode;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;

  _data: ObjMap<unknown>;
  _nullData: boolean;
  _errors: Array<GraphQLError>;
  _consolidator: Consolidator<SubsequentIncrementalExecutionResult> | undefined;

  _promiseContext: PromiseContext | undefined;

  constructor(
    plan: Plan,
    operation: OperationDefinitionNode,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  ) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this._data = Object.create(null);
    this._nullData = false;
    this._errors = [];
  }

  execute(): PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  > {
    for (const [subschema, subschemaSelections] of this.plan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });

      this._handleMaybeAsyncPossibleMultiPartResult([], result);
    }

    return this._promiseContext !== undefined
      ? this._promiseContext.promise.then(() => this._return())
      : this._return();
  }

  _createDocument(selections: Array<SelectionNode>): DocumentNode {
    return {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...this.operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections,
          },
        },
        ...this.fragments,
      ],
    };
  }

  _incrementPromiseContext(): PromiseContext {
    if (this._promiseContext) {
      this._promiseContext.promiseCount++;
      return this._promiseContext;
    }

    let trigger!: () => void;
    const promiseCount = 1;
    const promise = new Promise<void>((resolve) => {
      trigger = resolve;
    });
    const promiseContext: PromiseContext = {
      promiseCount,
      promise,
      trigger,
    };
    this._promiseContext = promiseContext;
    return promiseContext;
  }

  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  > {
    const iteration = this.plan.map.entries().next();
    if (iteration.done) {
      const error = new GraphQLError('Could not route subscription.', {
        nodes: this.operation,
      });

      return { errors: [error] };
    }

    const [subschema, subschemaSelections] = iteration.value;

    const subscriber = subschema.subscriber;
    if (!subscriber) {
      const error = new GraphQLError(
        'Subschema is not configured to execute subscription operation.',
        { nodes: this.operation },
      );

      return { errors: [error] };
    }

    const document = this._createDocument(subschemaSelections);

    const result = subscriber({
      document,
      variables: this.rawVariableValues,
    });

    if (isPromise(result)) {
      return result.then((resolved) => this._handlePossibleStream(resolved));
    }
    return this._handlePossibleStream(result);
  }

  _return(): PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  > {
    const dataOrNull = this._nullData ? null : this._data;

    if (this._consolidator !== undefined) {
      this._consolidator.close();

      const initialResult =
        this._errors.length > 0
          ? { data: dataOrNull, errors: this._errors, hasNext: true }
          : { data: dataOrNull, hasNext: true };

      return {
        initialResult,
        subsequentResults: this._consolidator,
      };
    }

    return this._errors.length > 0
      ? { data: dataOrNull, errors: this._errors }
      : { data: dataOrNull };
  }

  _handleAsyncPossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(
    path: Array<number | string>,
    promiseContext: PromiseContext,
    result: T,
  ): void {
    promiseContext.promiseCount--;
    this._handlePossibleMultiPartResult(path, result);
    if (promiseContext.promiseCount === 0) {
      promiseContext.trigger();
    }
  }

  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(path: Array<string | number>, result: T): void {
    if (isPromise(result)) {
      const promiseContext = this._incrementPromiseContext();
      result.then(
        (resolved) =>
          this._handleAsyncPossibleMultiPartResult(
            path,
            promiseContext,
            resolved,
          ),
        (err) =>
          this._handleAsyncPossibleMultiPartResult(path, promiseContext, {
            data: null,
            errors: [new GraphQLError(err.message, { originalError: err })],
          }),
      );
    } else {
      this._handlePossibleMultiPartResult(path, result);
    }
  }

  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(path: Array<string | number>, result: T): void {
    if ('initialResult' in result) {
      this._handleSingleResult(path, result.initialResult);

      if (this._consolidator === undefined) {
        this._consolidator =
          new Consolidator<SubsequentIncrementalExecutionResult>([
            result.subsequentResults,
          ]);
      } else {
        this._consolidator.add(result.subsequentResults);
      }
    } else {
      this._handleSingleResult(path, result);
    }
  }

  _handleSingleResult(
    path: Array<string | number>,
    result: ExecutionResult | InitialIncrementalExecutionResult,
  ): void {
    if (result.errors != null) {
      this._errors.push(...result.errors);
    }
    if (this._nullData) {
      return;
    }
    if (result.data == null) {
      this._nullData = true;
      return;
    }

    const parent = this._getParentAtPath(path, this._data);

    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(parent, key as keyof typeof parent, value);
      const subPlan = this.plan.subPlans[key];
      if (subPlan && value) {
        this._executeSubPlan(subPlan, [...path, key]);
      }
    }
  }

  _getParentAtPath<P>(
    path: Array<string | number>,
    data: P,
  ): ObjMap<unknown> | Array<unknown> {
    if (path.length === 0) {
      return data as ObjMap<unknown> | Array<unknown>;
    }
    const [key, ...rest] = path;
    return this._getParentAtPath(rest, data[key as keyof P]);
  }

  _executeSubPlan(subPlan: Plan, path: Array<string | number>): void {
    for (const [subschema, subschemaSelections] of subPlan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });

      this._handleMaybeAsyncPossibleMultiPartResult(path, result);
    }
  }

  _deepMerge<P extends ObjMap<unknown> | Array<unknown>>(
    parent: P,
    key: keyof P,
    value: unknown,
  ): void {
    if (!isObjectLike(parent[key]) || !isObjectLike(value)) {
      parent[key] = value as P[keyof P];
      return;
    }

    if (Array.isArray(value)) {
      const parentArray = parent[key] as Array<unknown>;
      for (let i = 0; i < value.length; i++) {
        this._deepMerge(parentArray, i, value[i]);
      }
    }

    for (const [subKey, subValue] of Object.entries(value)) {
      const parentObjMap = parent[key] as ObjMap<unknown>;
      this._deepMerge(parentObjMap, subKey, subValue);
    }
  }

  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T> {
    if (isAsyncIterable(result)) {
      return mapAsyncIterable(result, (payload) => payload) as T;
    }

    return result;
  }
}
