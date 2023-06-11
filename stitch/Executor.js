'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Executor = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
const isObjectLike_js_1 = require('../predicates/isObjectLike.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const PromiseAggregator_js_1 = require('../utilities/PromiseAggregator.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
/**
 * @internal
 */
class Executor {
  constructor(fieldPlan, operation, fragments, rawVariableValues) {
    this.fieldPlan = fieldPlan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
  }
  execute() {
    const initialGraphQLData = {
      fields: Object.create(null),
      errors: [],
      nulled: false,
      promiseAggregator: new PromiseAggregator_js_1.PromiseAggregator(),
    };
    for (const [
      subschema,
      subschemaSelections,
    ] of this.fieldPlan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncResult(
        initialGraphQLData,
        undefined,
        initialGraphQLData.fields,
        result,
        [],
      );
    }
    if (initialGraphQLData.promiseAggregator.isEmpty()) {
      return this._buildResponse(initialGraphQLData);
    }
    return initialGraphQLData.promiseAggregator
      .resolved()
      .then(() => this._buildResponse(initialGraphQLData));
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
    const iteration = this.fieldPlan.selectionMap.entries().next();
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
    return initialGraphQLData.errors.length > 0
      ? { data: fieldsOrNull, errors: initialGraphQLData.errors }
      : { data: fieldsOrNull };
  }
  _handleMaybeAsyncResult(graphQLData, parent, fields, result, path) {
    if (!(0, isPromise_js_1.isPromise)(result)) {
      this._handleInitialResult(graphQLData, parent, fields, result, path);
      return;
    }
    const promise = result.then(
      (resolved) =>
        this._handleInitialResult(graphQLData, parent, fields, resolved, path),
      (err) =>
        this._handleInitialResult(
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
    graphQLData.promiseAggregator.add(promise);
  }
  _getSubFieldPlans(path) {
    let subFieldPlans = this.fieldPlan.subFieldPlans;
    for (const key of path) {
      if (typeof key === 'number') {
        continue;
      }
      if (subFieldPlans[key] === undefined) {
        return undefined;
      }
      subFieldPlans = subFieldPlans[key].subFieldPlans;
    }
    return subFieldPlans;
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
    this._executeSubFieldPlans(
      graphQLData,
      result.data,
      this.fieldPlan.subFieldPlans,
      path,
    );
  }
  _executeSubFieldPlans(graphQLData, fields, subFieldPlans, path) {
    for (const [key, subFieldPlan] of Object.entries(subFieldPlans)) {
      if (fields[key] !== undefined) {
        this._executePossibleListSubFieldPlan(
          graphQLData,
          fields,
          fields[key],
          subFieldPlan,
          [...path, key],
        );
      }
    }
  }
  _executePossibleListSubFieldPlan(
    graphQLData,
    parent,
    fieldsOrList,
    fieldPlan,
    path,
  ) {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._executePossibleListSubFieldPlan(
          graphQLData,
          fieldsOrList,
          fieldsOrList[i],
          fieldPlan,
          [...path, i],
        );
      }
      return;
    }
    this._executeSubFieldPlan(
      graphQLData,
      parent,
      fieldsOrList,
      fieldPlan,
      path,
    );
  }
  _executeSubFieldPlan(graphQLData, parent, fields, fieldPlan, path) {
    for (const [
      subschema,
      subschemaSelections,
    ] of fieldPlan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncResult(graphQLData, parent, fields, result, path);
    }
    this._executeSubFieldPlans(
      graphQLData,
      fields,
      fieldPlan.subFieldPlans,
      path,
    );
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
