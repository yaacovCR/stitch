'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Composer = void 0;
const graphql_1 = require('graphql');
const isObjectLike_js_1 = require('../predicates/isObjectLike.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const PromiseAggregator_js_1 = require('../utilities/PromiseAggregator.js');
/**
 * @internal
 */
class Composer {
  constructor(results, fieldPlan, fragments, rawVariableValues) {
    this.results = results;
    this.fieldPlan = fieldPlan;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator_js_1.PromiseAggregator();
  }
  compose() {
    this.results.map((result) =>
      this._handleMaybeAsyncResult(
        undefined,
        this.fields,
        this.fieldPlan,
        result,
        [],
      ),
    );
    if (this.promiseAggregator.isEmpty()) {
      return this._buildResponse();
    }
    return this.promiseAggregator.resolved().then(() => this._buildResponse());
  }
  _createDocument(selections) {
    return {
      kind: graphql_1.Kind.DOCUMENT,
      definitions: [
        {
          kind: graphql_1.Kind.OPERATION_DEFINITION,
          operation: graphql_1.OperationTypeNode.QUERY,
          selectionSet: {
            kind: graphql_1.Kind.SELECTION_SET,
            selections,
          },
        },
        ...this.fragments,
      ],
    };
  }
  _buildResponse() {
    const fieldsOrNull = this.nulled ? null : this.fields;
    return this.errors.length > 0
      ? { data: fieldsOrNull, errors: this.errors }
      : { data: fieldsOrNull };
  }
  _handleMaybeAsyncResult(parent, fields, fieldPlan, result, path) {
    if (!(0, isPromise_js_1.isPromise)(result)) {
      this._handleResult(parent, fields, fieldPlan, result, path);
      return;
    }
    const promise = result.then(
      (resolved) =>
        this._handleResult(parent, fields, fieldPlan, resolved, path),
      (err) =>
        this._handleResult(
          parent,
          fields,
          fieldPlan,
          {
            data: null,
            errors: [
              new graphql_1.GraphQLError(err.message, { originalError: err }),
            ],
          },
          path,
        ),
    );
    this.promiseAggregator.add(promise);
  }
  _handleResult(parent, fields, fieldPlan, result, path) {
    if (result.errors != null) {
      this.errors.push(...result.errors);
    }
    const parentKey = path[path.length - 1];
    if (parent !== undefined) {
      if (parent[parentKey] === null) {
        return;
      }
    } else if (this.nulled) {
      return;
    }
    if (result.data == null) {
      if (parentKey === undefined) {
        this.nulled = true;
      } else if (parent) {
        parent[parentKey] = null;
        // TODO: null bubbling?
      }
      return;
    }
    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(fields, key, value);
    }
    if (fieldPlan !== undefined) {
      this._executeSubFieldPlans(
        result.data,
        this.fieldPlan.subFieldPlans,
        path,
      );
    }
  }
  _executeSubFieldPlans(fields, subFieldPlans, path) {
    for (const [key, subFieldPlan] of Object.entries(subFieldPlans)) {
      if (fields[key] !== undefined) {
        this._executePossibleListSubFieldPlan(
          fields,
          fields[key],
          subFieldPlan,
          [...path, key],
        );
      }
    }
  }
  _executePossibleListSubFieldPlan(parent, fieldsOrList, fieldPlan, path) {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._executePossibleListSubFieldPlan(
          fieldsOrList,
          fieldsOrList[i],
          fieldPlan,
          [...path, i],
        );
      }
      return;
    }
    this._executeSubFieldPlan(parent, fieldsOrList, fieldPlan, path);
  }
  _executeSubFieldPlan(parent, fields, fieldPlan, path) {
    for (const [
      subschema,
      subschemaSelections,
    ] of fieldPlan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncResult(parent, fields, undefined, result, path);
    }
    this._executeSubFieldPlans(fields, fieldPlan.subFieldPlans, path);
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
}
exports.Composer = Composer;
