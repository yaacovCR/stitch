import { GraphQLError, Kind } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isDeferIncrementalResult } from '../predicates/isDeferResult.mjs';
import { isObjectLike } from '../predicates/isObjectLike.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { Consolidator } from '../utilities/Consolidator.mjs';
import { PromiseAggregator } from '../utilities/PromiseAggregator.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
/**
 * @internal
 */
export class Executor {
  constructor(plan, operation, fragments, rawVariableValues) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this._data = Object.create(null);
    this._nullData = false;
    this._errors = [];
    this._deferredResults = new Map();
    this._promiseAggregator = new PromiseAggregator(() => this._return());
  }
  execute() {
    for (const [subschema, subschemaSelections] of this.plan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(this._data, result, []);
    }
    return this._promiseAggregator.return();
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
  _handleMaybeAsyncPossibleMultiPartResult(parent, result, path) {
    if (isPromise(result)) {
      this._promiseAggregator.add(
        result,
        (resolved) =>
          this._handlePossibleMultiPartResult(parent, resolved, path),
        (err) =>
          this._handlePossibleMultiPartResult(
            parent,
            {
              data: null,
              errors: [new GraphQLError(err.message, { originalError: err })],
            },
            path,
          ),
      );
    } else {
      this._handlePossibleMultiPartResult(parent, result, path);
    }
  }
  _handlePossibleMultiPartResult(parent, result, path) {
    if (!('initialResult' in result)) {
      this._handleSingleResult(parent, result, path);
      return;
    }
    const { initialResult, subsequentResults } = result;
    this._handleSingleResult(parent, initialResult, path);
    const taggedResults = mapAsyncIterable(
      subsequentResults,
      (incrementalResult) => ({
        path,
        incrementalResult,
      }),
    );
    if (this._consolidator === undefined) {
      this._consolidator = new Consolidator([taggedResults], (taggedResult) =>
        this._handleIncrementalResult(taggedResult),
      );
      return;
    }
    this._consolidator.add(taggedResults);
  }
  _handleIncrementalResult(taggedResult) {
    const { path, incrementalResult } = taggedResult;
    if (incrementalResult.incremental === undefined) {
      return incrementalResult;
    }
    const newIncremental = [];
    for (const result of incrementalResult.incremental) {
      if (!isDeferIncrementalResult(result)) {
        newIncremental.push(result);
        continue;
      }
      const data = result.data;
      if (data == null) {
        newIncremental.push(result);
        continue;
      }
      let identifier;
      const newData = Object.create(null);
      for (const key of Object.keys(data)) {
        if (!key.startsWith('__identifier')) {
          newData[key] = data[key];
          continue;
        }
        identifier = key;
      }
      if (identifier === undefined) {
        newIncremental.push(result);
        continue;
      }
      const fullPath = result.path ? [...path, ...result.path] : path;
      const key = fullPath.join();
      const total = parseInt(identifier.split('__')[3], 10);
      const deferredResults = this._deferredResults.get(key);
      if (deferredResults === undefined) {
        this._deferredResults.set(key, [newData]);
        continue;
      }
      if (deferredResults.length !== total - 1) {
        deferredResults.push(newData);
        continue;
      }
      for (const deferredResult of deferredResults) {
        for (const [deferredKey, value] of Object.entries(deferredResult)) {
          newData[deferredKey] = value;
        }
      }
      this._deferredResults.delete(key);
      newIncremental.push({
        ...result,
        data: newData,
        path: fullPath,
      });
    }
    if (newIncremental.length === 0) {
      return undefined;
    }
    const newIncrementalResult = {
      ...incrementalResult,
      incremental: newIncremental,
    };
    if (this._deferredResults.size) {
      newIncrementalResult.hasNext = true;
    }
    return newIncrementalResult;
  }
  _handleSingleResult(parent, result, path) {
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
    this._executeSubPlans(result.data, this.plan.subPlans, path);
  }
  _executeSubPlans(data, subPlans, path) {
    for (const [key, subPlan] of Object.entries(subPlans)) {
      if (data[key]) {
        this._executePossibleListSubPlan(data[key], subPlan, [...path, key]);
      }
    }
  }
  _executePossibleListSubPlan(parent, plan, path) {
    if (Array.isArray(parent)) {
      for (let i = 0; i < parent.length; i++) {
        this._executePossibleListSubPlan(parent[i], plan, [...path, i]);
      }
      return;
    }
    this._executeSubPlan(parent, plan, path);
  }
  _executeSubPlan(parent, plan, path) {
    for (const [subschema, subschemaSelections] of plan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(parent, result, path);
    }
    this._executeSubPlans(parent, plan.subPlans, path);
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
