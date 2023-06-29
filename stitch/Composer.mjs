import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';
import { isPromise } from '../predicates/isPromise.mjs';
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { PromiseAggregator } from '../utilities/PromiseAggregator.mjs';
/**
 * @internal
 */
export class Composer {
  constructor(subschemaPlanResults, superSchema, rawVariableValues) {
    this.subschemaPlanResults = subschemaPlanResults;
    this.superSchema = superSchema;
    this.rawVariableValues = rawVariableValues;
    this.fields = Object.create(null);
    this.errors = [];
    this.nulled = false;
    this.promiseAggregator = new PromiseAggregator();
  }
  compose() {
    for (const subschemaPlanResult of this.subschemaPlanResults) {
      const { subschemaPlan, initialResult } = subschemaPlanResult;
      this._handleMaybeAsyncResult(
        undefined,
        this.fields,
        subschemaPlan,
        initialResult,
      );
    }
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
      ],
    };
  }
  _buildResponse() {
    const fieldsOrNull = this.nulled ? null : this.fields;
    return this.errors.length > 0
      ? { data: fieldsOrNull, errors: this.errors }
      : { data: fieldsOrNull };
  }
  _handleMaybeAsyncResult(pointer, fields, subschemaPlan, initialResult) {
    if (!isPromise(initialResult)) {
      this._handleResult(pointer, fields, subschemaPlan, initialResult);
      return;
    }
    const promise = initialResult.then(
      (resolved) =>
        this._handleResult(pointer, fields, subschemaPlan, resolved),
      (err) =>
        this._handleResult(pointer, fields, subschemaPlan, {
          data: null,
          errors: [new GraphQLError(err.message, { originalError: err })],
        }),
    );
    this.promiseAggregator.add(promise);
  }
  _handleResult(pointer, fields, subschemaPlan, result) {
    if (result.errors != null) {
      this.errors.push(...result.errors);
    }
    if (pointer !== undefined) {
      if (pointer.parent[pointer.responseKey] === null) {
        return;
      }
    } else if (this.nulled) {
      return;
    }
    if (result.data == null) {
      if (pointer === undefined) {
        this.nulled = true;
      } else {
        pointer.parent[pointer.responseKey] = null;
        // TODO: null bubbling?
      }
      return;
    }
    for (const [key, value] of Object.entries(result.data)) {
      fields[key] = value;
    }
    if (subschemaPlan.stitchPlans !== undefined) {
      const stitchMap = new AccumulatorMap();
      this._walkStitchPlans(stitchMap, result.data, subschemaPlan.stitchPlans);
      this._performStitches(stitchMap);
    }
  }
  _walkStitchPlans(stitchMap, fields, stitchPlans) {
    for (const [key, stitchPlan] of Object.entries(stitchPlans)) {
      if (fields[key] !== undefined) {
        this._collectSubFetches(
          stitchMap,
          fields,
          key,
          fields[key],
          stitchPlan,
        );
      }
    }
  }
  _performStitches(stitchMap) {
    for (const [subschema, stitches] of stitchMap) {
      for (const stitch of stitches) {
        // TODO: batch subStitches by accessors
        // TODO: batch subStitches by subschema?
        const subschemaPlan = stitch.subschemaPlan;
        const initialResult = subschema.executor({
          document: this._createDocument(stitch.subschemaPlan.fieldNodes),
          variables: this.rawVariableValues,
        });
        this._handleMaybeAsyncResult(
          stitch.pointer,
          stitch.target,
          subschemaPlan,
          initialResult,
        );
      }
    }
  }
  _collectSubFetches(stitchMap, parent, responseKey, fieldsOrList, stitchPlan) {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._collectSubFetches(
          stitchMap,
          fieldsOrList,
          i,
          fieldsOrList[i],
          stitchPlan,
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
    const fieldPlan = stitchPlan.get(type);
    fieldPlan !== undefined ||
      invariant(false, `Missing field plan for type '${typeName}'.`);
    for (const subschemaPlan of fieldPlan.subschemaPlans) {
      stitchMap.add(subschemaPlan.toSubschema, {
        subschemaPlan,
        pointer: {
          parent: parent,
          responseKey,
        },
        target: fieldsOrList,
      });
    }
    this._walkStitchPlans(stitchMap, fieldsOrList, fieldPlan.stitchPlans);
  }
}
