'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Composer = void 0;
const graphql_1 = require('graphql');
const isObjectLike_js_1 = require('../predicates/isObjectLike.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const AccumulatorMap_js_1 = require('../utilities/AccumulatorMap.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
const PromiseAggregator_js_1 = require('../utilities/PromiseAggregator.js');
/**
 * @internal
 */
class Composer {
  constructor(stitches, superSchema, rawVariableValues) {
    this.stitches = stitches;
    this.superSchema = superSchema;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator_js_1.PromiseAggregator();
  }
  compose() {
    for (const stitch of this.stitches) {
      this._handleMaybeAsyncResult(undefined, this.fields, stitch, []);
    }
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
      ],
    };
  }
  _buildResponse() {
    const fieldsOrNull = this.nulled ? null : this.fields;
    return this.errors.length > 0
      ? { data: fieldsOrNull, errors: this.errors }
      : { data: fieldsOrNull };
  }
  _handleMaybeAsyncResult(parent, fields, stitch, path) {
    const initialResult = stitch.initialResult;
    if (!(0, isPromise_js_1.isPromise)(initialResult)) {
      this._handleResult(parent, fields, stitch, initialResult, path);
      return;
    }
    const promise = initialResult.then(
      (resolved) => this._handleResult(parent, fields, stitch, resolved, path),
      (err) =>
        this._handleResult(
          parent,
          fields,
          stitch,
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
  _handleResult(parent, fields, stitch, result, path) {
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
    if (stitch?.stitchTrees !== undefined) {
      const subQueriesBySchema = new AccumulatorMap_js_1.AccumulatorMap();
      this._walkStitchTrees(
        subQueriesBySchema,
        result.data,
        stitch.stitchTrees,
        path,
      );
      for (const [subschema, subQueries] of subQueriesBySchema) {
        for (const subQuery of subQueries) {
          // TODO: send one document per subschema
          const subResult = subschema.executor({
            document: this._createDocument(subQuery.fieldNodes),
            variables: this.rawVariableValues,
          });
          this._handleMaybeAsyncResult(
            subQuery.parent,
            subQuery.target,
            // TODO: add multilayer plan support
            {
              subschema,
              stitchTrees: undefined,
              initialResult: subResult,
            },
            subQuery.path,
          );
        }
      }
    }
  }
  _walkStitchTrees(subQueriesBySchema, fields, stitchTrees, path) {
    for (const [key, stitchTree] of Object.entries(stitchTrees)) {
      if (fields[key] !== undefined) {
        this._addPossibleListStitches(
          subQueriesBySchema,
          fields,
          fields[key],
          stitchTree,
          [...path, key],
        );
      }
    }
  }
  _addPossibleListStitches(
    subQueriesBySchema,
    parent,
    fieldsOrList,
    stitchTree,
    path,
  ) {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._addPossibleListStitches(
          subQueriesBySchema,
          fieldsOrList,
          fieldsOrList[i],
          stitchTree,
          [...path, i],
        );
      }
      return;
    }
    const typeName = fieldsOrList.__stitching__typename;
    typeName != null ||
      (0, invariant_js_1.invariant)(
        false,
        `Missing entry '__stitching__typename' in response ${(0,
        inspect_js_1.inspect)(fieldsOrList)}.`,
      );
    const type = this.superSchema.getType(typeName);
    (0, graphql_1.isObjectType)(type) ||
      (0, invariant_js_1.invariant)(
        false,
        `Expected Object type, received '${typeName}'.`,
      );
    const fieldPlan = stitchTree.fieldPlans.get(type);
    fieldPlan !== undefined ||
      (0, invariant_js_1.invariant)(
        false,
        `Missing field plan for type '${typeName}'.`,
      );
    for (const [subschema, subschemaPlan] of fieldPlan.subschemaPlans) {
      subQueriesBySchema.add(subschema, {
        fieldNodes: subschemaPlan.fieldNodes,
        parent: parent,
        target: fieldsOrList,
        path,
      });
    }
    this._walkStitchTrees(
      subQueriesBySchema,
      fieldsOrList,
      fieldPlan.stitchTrees,
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
}
exports.Composer = Composer;
