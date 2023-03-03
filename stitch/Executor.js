'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Executor = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
const isDeferResult_js_1 = require('../predicates/isDeferResult.js');
const isObjectLike_js_1 = require('../predicates/isObjectLike.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const Consolidator_js_1 = require('../utilities/Consolidator.js');
const PromiseAggregator_js_1 = require('../utilities/PromiseAggregator.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
/**
 * @internal
 */
class Executor {
  constructor(plan, operation, fragments, rawVariableValues) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this._data = Object.create(null);
    this._nullData = false;
    this._errors = [];
    this._deferredResults = new Map();
    this._promiseAggregator = new PromiseAggregator_js_1.PromiseAggregator(() =>
      this._return(),
    );
  }
  execute() {
    for (const [
      subschema,
      subschemaSelections,
    ] of this.plan.selectionMap.entries()) {
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
      kind: graphql_1.Kind.DOCUMENT,
      definitions: [
        {
          ...this.operation,
          selectionSet: {
            kind: graphql_1.Kind.SELECTION_SET,
            selections,
          },
        },
        ...this.fragments,
      ],
    };
  }
  subscribe() {
    const iteration = this.plan.selectionMap.entries().next();
    if (iteration.done) {
      const error = new graphql_1.GraphQLError(
        'Could not route subscription.',
        {
          nodes: this.operation,
        },
      );
      return { errors: [error] };
    }
    const [subschema, subschemaSelections] = iteration.value;
    const subscriber = subschema.subscriber;
    if (!subscriber) {
      const error = new graphql_1.GraphQLError(
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
    if ((0, isPromise_js_1.isPromise)(result)) {
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
    if ((0, isPromise_js_1.isPromise)(result)) {
      this._promiseAggregator.add(
        result,
        (resolved) =>
          this._handlePossibleMultiPartResult(parent, resolved, path),
        (err) =>
          this._handlePossibleMultiPartResult(
            parent,
            {
              data: null,
              errors: [
                new graphql_1.GraphQLError(err.message, { originalError: err }),
              ],
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
    const taggedResults = (0, mapAsyncIterable_js_1.mapAsyncIterable)(
      subsequentResults,
      (incrementalResult) => ({
        path,
        incrementalResult,
      }),
    );
    if (this._consolidator === undefined) {
      this._consolidator = new Consolidator_js_1.Consolidator(
        [taggedResults],
        (taggedResult) => this._handleIncrementalResult(taggedResult),
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
      if (!(0, isDeferResult_js_1.isDeferIncrementalResult)(result)) {
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
        if (key !== '__deferredIdentifier__') {
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
      let deferredResults = this._deferredResults.get(key);
      if (deferredResults === undefined) {
        deferredResults = [newData];
        this._deferredResults.set(key, deferredResults);
      } else {
        deferredResults.push(newData);
      }
      const deferredSubschemas = this._getDeferredSubschemas(
        this.plan,
        fullPath,
      );
      if (
        deferredSubschemas &&
        deferredResults.length < deferredSubschemas.size
      ) {
        continue;
      }
      this._deferredResults.delete(key);
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
  _getDeferredSubschemas(plan, path) {
    let currentPlan = plan;
    const fieldPath = [...path];
    let key;
    while ((key = fieldPath.shift()) !== undefined) {
      if (typeof key === 'number') {
        continue;
      }
      currentPlan = currentPlan.subPlans[key];
    }
    if (currentPlan === undefined) {
      return undefined;
    }
    return currentPlan.deferredSubschemas;
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
    for (const [
      subschema,
      subschemaSelections,
    ] of plan.selectionMap.entries()) {
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
      !(0, isObjectLike_js_1.isObjectLike)(parent[key]) ||
      !(0, isObjectLike_js_1.isObjectLike)(value) ||
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
    if ((0, isAsyncIterable_js_1.isAsyncIterable)(result)) {
      return (0, mapAsyncIterable_js_1.mapAsyncIterable)(
        result,
        (payload) => payload,
      );
    }
    return result;
  }
}
exports.Executor = Executor;
