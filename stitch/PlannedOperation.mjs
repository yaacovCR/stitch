import { GraphQLError, Kind } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isObjectLike } from '../predicates/isObjectLike.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { Consolidator } from '../utilities/Consolidator.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
/**
 * @internal
 */
export class PlannedOperation {
  constructor(plan, operation, fragments, rawVariableValues) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this._data = Object.create(null);
    this._nullData = false;
    this._errors = [];
  }
  execute() {
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
  _createDocument(selections) {
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
  _incrementPromiseContext() {
    if (this._promiseContext) {
      this._promiseContext.promiseCount++;
      return this._promiseContext;
    }
    let trigger;
    const promiseCount = 1;
    const promise = new Promise((resolve) => {
      trigger = resolve;
    });
    const promiseContext = {
      promiseCount,
      promise,
      trigger,
    };
    this._promiseContext = promiseContext;
    return promiseContext;
  }
  subscribe() {
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
  _return() {
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
  _handleMaybeAsyncPossibleMultiPartResult(parent, result) {
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
  _handleAsyncPossibleMultiPartResult(parent, promiseContext, result) {
    promiseContext.promiseCount--;
    this._handlePossibleMultiPartResult(parent, result);
    if (promiseContext.promiseCount === 0) {
      promiseContext.trigger();
    }
  }
  _handlePossibleMultiPartResult(parent, result) {
    if ('initialResult' in result) {
      this._handleSingleResult(parent, result.initialResult);
      if (this._consolidator === undefined) {
        this._consolidator = new Consolidator([result.subsequentResults]);
      } else {
        this._consolidator.add(result.subsequentResults);
      }
    } else {
      this._handleSingleResult(parent, result);
    }
  }
  _handleSingleResult(parent, result) {
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
  _executeSubPlans(data, subPlans) {
    for (const [key, subPlan] of Object.entries(subPlans)) {
      if (data[key]) {
        this._executePossibleListSubPlan(data[key], subPlan);
      }
    }
  }
  _executePossibleListSubPlan(parent, plan) {
    if (Array.isArray(parent)) {
      for (const item of parent) {
        this._executePossibleListSubPlan(item, plan);
      }
      return;
    }
    this._executeSubPlan(parent, plan);
  }
  _executeSubPlan(parent, plan) {
    for (const [subschema, subschemaSelections] of plan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(parent, result);
    }
    this._executeSubPlans(parent, plan.subPlans);
  }
  _deepMerge(parent, key, value) {
    if (
      !isObjectLike(parent[key]) ||
      !isObjectLike(value) ||
      Array.isArray(value)
    ) {
      parent[key] = value;
      return;
    }
    for (const [subKey, subValue] of Object.entries(value)) {
      const parentObjMap = parent[key];
      this._deepMerge(parentObjMap, subKey, subValue);
    }
  }
  _handlePossibleStream(result) {
    if (isAsyncIterable(result)) {
      return mapAsyncIterable(result, (payload) => payload);
    }
    return result;
  }
}
