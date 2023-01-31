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
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.ts';
import { isAsyncIterable } from '../predicates/isAsyncIterable.ts';
import { isObjectLike } from '../predicates/isObjectLike.ts';
import { isPromise } from '../predicates/isPromise.ts';
import { Consolidator } from '../utilities/Consolidator.ts';
import { mapAsyncIterable } from './mapAsyncIterable.ts';
import type { Plan } from './Plan.ts';
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
      this._handleMaybeAsyncPossibleMultiPartResult(this._data, result);
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
  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(parent: ObjMap<unknown>, result: T): void {
    if (isPromise(result)) {
      const promiseContext = this._incrementPromiseContext();
      result.then(
        (resolved) =>
          this._handleAsyncPossibleMultiPartResult(
            parent,
            promiseContext,
            resolved,
          ),
        (err) =>
          this._handleAsyncPossibleMultiPartResult(parent, promiseContext, {
            data: null,
            errors: [new GraphQLError(err.message, { originalError: err })],
          }),
      );
    } else {
      this._handlePossibleMultiPartResult(parent, result);
    }
  }
  _handleAsyncPossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(parent: ObjMap<unknown>, promiseContext: PromiseContext, result: T): void {
    promiseContext.promiseCount--;
    this._handlePossibleMultiPartResult(parent, result);
    if (promiseContext.promiseCount === 0) {
      promiseContext.trigger();
    }
  }
  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(parent: ObjMap<unknown>, result: T): void {
    if ('initialResult' in result) {
      this._handleSingleResult(parent, result.initialResult);
      if (this._consolidator === undefined) {
        this._consolidator =
          new Consolidator<SubsequentIncrementalExecutionResult>([
            result.subsequentResults,
          ]);
      } else {
        this._consolidator.add(result.subsequentResults);
      }
    } else {
      this._handleSingleResult(parent, result);
    }
  }
  _handleSingleResult(
    parent: ObjMap<unknown>,
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
    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(parent, key, value);
    }
    this._executeSubPlans(result.data, this.plan.subPlans);
  }
  _executeSubPlans(data: ObjMap<unknown>, subPlans: ObjMap<Plan>): void {
    for (const [key, subPlan] of Object.entries(subPlans)) {
      if (data[key]) {
        this._executeSubPlan(data[key] as ObjMap<unknown>, subPlan);
      }
    }
  }
  _executeSubPlan(parent: ObjMap<unknown>, plan: Plan): void {
    for (const [subschema, subschemaSelections] of plan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(parent, result);
    }
    this._executeSubPlans(parent, plan.subPlans);
  }
  _deepMerge(parent: ObjMap<unknown>, key: string, value: unknown): void {
    if (
      !isObjectLike(parent[key]) ||
      !isObjectLike(value) ||
      Array.isArray(value)
    ) {
      parent[key] = value;
      return;
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
