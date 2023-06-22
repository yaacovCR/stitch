import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';
import { isObjectLike } from '../predicates/isObjectLike.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { PromiseAggregator } from '../utilities/PromiseAggregator.mjs';
/**
 * @internal
 */
export class Composer {
  constructor(superSchema, results, fieldPlan, fragments, rawVariableValues) {
    this.superSchema = superSchema;
    this.results = results;
    this.fieldPlan = fieldPlan;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator();
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
      kind: Kind.DOCUMENT,
      definitions: [
        {
          kind: Kind.OPERATION_DEFINITION,
          operation: OperationTypeNode.QUERY,
          selectionSet: {
            kind: Kind.SELECTION_SET,
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
    if (!isPromise(result)) {
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
            errors: [new GraphQLError(err.message, { originalError: err })],
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
      const subQueriesBySchema = new AccumulatorMap();
      this._walkStitchTrees(
        subQueriesBySchema,
        result.data,
        this.fieldPlan.stitchTrees,
        path,
      );
      for (const [subschema, subQueries] of subQueriesBySchema) {
        for (const subQuery of subQueries) {
          // TODO: send one document per subschema
          const subResult = subschema.executor({
            document: this._createDocument(subQuery.subschemaSelections),
            variables: this.rawVariableValues,
          });
          this._handleMaybeAsyncResult(
            subQuery.parent,
            subQuery.target,
            // TODO: add multilayer plan support
            undefined,
            subResult,
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
      invariant(
        false,
        `Missing entry '__stitching__typename' in response ${inspect(
          fieldsOrList,
        )}.`,
      );
    const type = this.superSchema.getType(typeName);
    isObjectType(type) ||
      invariant(false, `Expected Object type, received '${typeName}'.`);
    const fieldPlan = stitchTree.fieldPlans.get(type);
    fieldPlan !== undefined ||
      invariant(false, `Missing field plan for type '${typeName}'.`);
    for (const [
      subschema,
      subschemaSelections,
    ] of fieldPlan.selectionMap.entries()) {
      subQueriesBySchema.add(subschema, {
        subschemaSelections,
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
      !isObjectLike(fields[key]) ||
      !isObjectLike(value) ||
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
