'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PlannedOperation = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
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
      const document = {
        kind: graphql_1.Kind.DOCUMENT,
        definitions: [
          {
            ...this.operation,
            selectionSet: {
              kind: graphql_1.Kind.SELECTION_SET,
              selections: subschemaSelections,
            },
          },
          ...this.fragments,
        ],
      };
      const result = subschema.executor({
        document,
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(result);
    }
    return this._promiseContext !== undefined
      ? this._promiseContext.promise.then(() => this._return())
      : this._return();
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
    const document = {
      kind: graphql_1.Kind.DOCUMENT,
      definitions: [
        {
          ...this.operation,
          selectionSet: {
            kind: graphql_1.Kind.SELECTION_SET,
            selections: subschemaSelections,
          },
        },
        ...this.fragments,
      ],
    };
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
  _handleAsyncPossibleMultiPartResult(promiseContext, result) {
    promiseContext.promiseCount--;
    this._handlePossibleMultiPartResult(result);
    if (promiseContext.promiseCount === 0) {
      promiseContext.trigger();
    }
  }
  _handleMaybeAsyncPossibleMultiPartResult(result) {
    if ((0, isPromise_js_1.isPromise)(result)) {
      const promiseContext = this._incrementPromiseContext();
      result.then(
        (resolved) =>
          this._handleAsyncPossibleMultiPartResult(promiseContext, resolved),
        (err) =>
          this._handleAsyncPossibleMultiPartResult(promiseContext, {
            data: null,
            errors: [
              new graphql_1.GraphQLError(err.message, { originalError: err }),
            ],
          }),
      );
    } else {
      this._handlePossibleMultiPartResult(result);
    }
  }
  _handlePossibleMultiPartResult(result) {
    if ('initialResult' in result) {
      this._handleSingleResult(result.initialResult);
      if (this._consolidator === undefined) {
        this._consolidator = new Consolidator_js_1.Consolidator([
          result.subsequentResults,
        ]);
      } else {
        this._consolidator.add(result.subsequentResults);
      }
    } else {
      this._handleSingleResult(result);
    }
  }
  _handleSingleResult(result) {
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
    Object.assign(this._data, result.data);
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
