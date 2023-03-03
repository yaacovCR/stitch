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
    this._deferredResults = new Map();
  }
  execute() {
    const initialGraphQLData = {
      fields: Object.create(null),
      errors: [],
      nulled: false,
      promiseAggregator: new PromiseAggregator_js_1.PromiseAggregator(() =>
        this._buildResponse(initialGraphQLData),
      ),
    };
    for (const [
      subschema,
      subschemaSelections,
    ] of this.plan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(
        initialGraphQLData,
        undefined,
        initialGraphQLData.fields,
        result,
        [],
      );
    }
    return initialGraphQLData.promiseAggregator.return();
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
  _buildResponse(initialGraphQLData) {
    const fieldsOrNull = initialGraphQLData.nulled
      ? null
      : initialGraphQLData.fields;
    if (this._consolidator !== undefined) {
      this._consolidator.close();
      const initialResult =
        initialGraphQLData.errors.length > 0
          ? {
              data: fieldsOrNull,
              errors: initialGraphQLData.errors,
              hasNext: true,
            }
          : { data: fieldsOrNull, hasNext: true };
      return {
        initialResult,
        subsequentResults: this._consolidator,
      };
    }
    return initialGraphQLData.errors.length > 0
      ? { data: fieldsOrNull, errors: initialGraphQLData.errors }
      : { data: fieldsOrNull };
  }
  _handleMaybeAsyncPossibleMultiPartResult(
    graphQLData,
    parent,
    fields,
    result,
    path,
  ) {
    if (!(0, isPromise_js_1.isPromise)(result)) {
      this._handlePossibleMultiPartResult(
        graphQLData,
        parent,
        fields,
        result,
        path,
      );
      return;
    }
    graphQLData.promiseAggregator.add(
      result,
      (resolved) =>
        this._handlePossibleMultiPartResult(
          graphQLData,
          parent,
          fields,
          resolved,
          path,
        ),
      (err) =>
        this._handlePossibleMultiPartResult(
          graphQLData,
          parent,
          fields,
          {
            data: null,
            errors: [
              new graphql_1.GraphQLError(err.message, { originalError: err }),
            ],
          },
          path,
        ),
    );
  }
  _handlePossibleMultiPartResult(graphQLData, parent, fields, result, path) {
    if (!('initialResult' in result)) {
      this._handleInitialResult(graphQLData, parent, fields, result, path);
      return;
    }
    const { initialResult, subsequentResults } = result;
    this._handleInitialResult(graphQLData, parent, fields, initialResult, path);
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
        (taggedResult, push) =>
          this._handleIncrementalResult(taggedResult, push),
      );
      return;
    }
    this._consolidator.add(taggedResults);
  }
  _push(incrementalResult, push) {
    push(incrementalResult).then(undefined, () => {
      /* ignore */
    });
  }
  _handleIncrementalResult(taggedResult, push) {
    const { path, incrementalResult } = taggedResult;
    if (incrementalResult.incremental === undefined) {
      this._push(incrementalResult, push);
      return;
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
      const fullPath = result.path ? [...path, ...result.path] : path;
      if (identifier === undefined) {
        const subPlans = this._getSubPlans(result.path);
        if (subPlans && Object.keys(subPlans).length > 0) {
          this._handleDeferredResult(newData, subPlans, push, fullPath);
        } else {
          newIncremental.push(result);
        }
        continue;
      }
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
      const subPlans = this._getSubPlans(fullPath);
      if (subPlans && Object.keys(subPlans).length > 0) {
        this._handleDeferredResult(newData, subPlans, push, fullPath);
      } else {
        newIncremental.push({
          ...result,
          data: newData,
          path: fullPath,
        });
      }
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
    this._push(newIncrementalResult, push);
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
  _handleDeferredResult(data, subPlans, push, path) {
    const graphQLData = {
      fields: Object.create(null),
      errors: [],
      nulled: false,
      promiseAggregator: new PromiseAggregator_js_1.PromiseAggregator(
        () => data,
      ),
    };
    this._executeSubPlans(graphQLData, data, subPlans, path);
    const newData = graphQLData.promiseAggregator.return();
    this._push(
      {
        incremental: [
          {
            data: newData,
            path,
          },
        ],
        hasNext: this._deferredResults.size > 0,
      },
      push,
    );
  }
  _getSubPlans(path) {
    let subPlans = this.plan.subPlans;
    for (const key of path) {
      if (typeof key === 'number') {
        continue;
      }
      if (subPlans[key] === undefined) {
        return undefined;
      }
      subPlans = subPlans[key].subPlans;
    }
    return subPlans;
  }
  _handleInitialResult(graphQLData, parent, fields, result, path) {
    if (result.errors != null) {
      graphQLData.errors.push(...result.errors);
    }
    const parentKey = path[path.length - 1];
    if (parent !== undefined) {
      if (parent[parentKey] === null) {
        return;
      }
    } else if (graphQLData.nulled) {
      return;
    }
    if (result.data == null) {
      if (parentKey === undefined) {
        graphQLData.nulled = true;
      } else if (parent) {
        parent[parentKey] = null;
        // TODO: null bubbling?
      }
      return;
    }
    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(fields, key, value);
    }
    this._executeSubPlans(graphQLData, result.data, this.plan.subPlans, path);
  }
  _executeSubPlans(graphQLData, fields, subPlans, path) {
    for (const [key, subPlan] of Object.entries(subPlans)) {
      if (fields[key]) {
        this._executePossibleListSubPlan(
          graphQLData,
          fields,
          fields[key],
          subPlan,
          [...path, key],
        );
      }
    }
  }
  _executePossibleListSubPlan(graphQLData, parent, fieldsOrList, plan, path) {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._executePossibleListSubPlan(
          graphQLData,
          fieldsOrList,
          fieldsOrList[i],
          plan,
          [...path, i],
        );
      }
      return;
    }
    this._executeSubPlan(graphQLData, parent, fieldsOrList, plan, path);
  }
  _executeSubPlan(graphQLData, parent, fields, plan, path) {
    for (const [
      subschema,
      subschemaSelections,
    ] of plan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncPossibleMultiPartResult(
        graphQLData,
        parent,
        fields,
        result,
        path,
      );
    }
    this._executeSubPlans(graphQLData, fields, plan.subPlans, path);
  }
  _deepMerge(fields, key, value) {
    if (
      !(0, isObjectLike_js_1.isObjectLike)(fields[key]) ||
      !(0, isObjectLike_js_1.isObjectLike)(value) ||
      Array.isArray(value)
    ) {
      fields[key] = value;
      return;
    }
    for (const [subKey, subValue] of Object.entries(value)) {
      const subFields = fields[key];
      this._deepMerge(subFields, subKey, subValue);
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
