'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PlannedOperation = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
const isObjectLike_js_1 = require('../predicates/isObjectLike.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const Consolidator_js_1 = require('../utilities/Consolidator.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
/**
 * @internal
 */
class PlannedOperation {
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
      this._handleMaybeAsyncPossibleMultiPartResult([], result);
    }
    return this._promiseContext !== undefined
      ? this._promiseContext.promise.then(() => this._return())
      : this._return();
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
  _handleAsyncPossibleMultiPartResult(path, promiseContext, result) {
    promiseContext.promiseCount--;
    this._handlePossibleMultiPartResult(path, result);
    if (promiseContext.promiseCount === 0) {
      promiseContext.trigger();
    }
  }
  _handleMaybeAsyncPossibleMultiPartResult(path, result) {
    if ((0, isPromise_js_1.isPromise)(result)) {
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
            errors: [
              new graphql_1.GraphQLError(err.message, { originalError: err }),
            ],
          }),
      );
    } else {
      this._handlePossibleMultiPartResult(path, result);
    }
  }
  _handlePossibleMultiPartResult(path, result) {
    if ('initialResult' in result) {
      this._handleSingleResult(path, result.initialResult);
      if (this._consolidator === undefined) {
        this._consolidator = new Consolidator_js_1.Consolidator([
          result.subsequentResults,
        ]);
      } else {
        this._consolidator.add(result.subsequentResults);
      }
    } else {
      this._handleSingleResult(path, result);
    }
  }
  _handleSingleResult(path, result) {
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
      this._deepMerge(parent, key, value);
      const subPlan = this.plan.subPlans[key];
      if (subPlan && value) {
        this._executeSubPlan(subPlan, [...path, key]);
      }
    }
  }
  _getParentAtPath(path, data) {
    if (path.length === 0) {
      return data;
    }
    const [key, ...rest] = path;
    return this._getParentAtPath(rest, data[key]);
  }
  _executeSubPlan(subPlan, path) {
    for (const [subschema, subschemaSelections] of subPlan.map.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(path, result);
    }
  }
  _deepMerge(parent, key, value) {
    if (
      !(0, isObjectLike_js_1.isObjectLike)(parent[key]) ||
      !(0, isObjectLike_js_1.isObjectLike)(value)
    ) {
      parent[key] = value;
      return;
    }
    if (Array.isArray(value)) {
      const parentArray = parent[key];
      for (let i = 0; i < value.length; i++) {
        this._deepMerge(parentArray, i, value[i]);
      }
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
exports.PlannedOperation = PlannedOperation;
