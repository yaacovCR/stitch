'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Planner = exports.createPlanner = void 0;
const graphql_1 = require('graphql');
const appendToArray_js_1 = require('../utilities/appendToArray.js');
const applySkipIncludeDirectives_js_1 = require('../utilities/applySkipIncludeDirectives.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
const memoize2_js_1 = require('../utilities/memoize2.js');
const memoize3_js_1 = require('../utilities/memoize3.js');
const emptyObject = {};
exports.createPlanner = (0, memoize2_js_1.memoize2)(
  (superSchema, operation) => new Planner(superSchema, operation),
);
/**
 * @internal
 */
class Planner {
  constructor(superSchema, operation) {
    this._createFieldPlan = (0, memoize2_js_1.memoize2)(
      this._createFieldPlanImpl.bind(this),
    );
    this._createSupplementalFieldPlan = (0, memoize3_js_1.memoize3)(
      this._createSupplementalFieldPlanImpl.bind(this),
    );
    this._collectSubFields = (0, memoize2_js_1.memoize2)(
      this._collectSubFieldsImpl.bind(this),
    );
    this.superSchema = superSchema;
    this.operation = operation;
    this.variableDefinitions = operation.variableDefinitions ?? [];
  }
  createRootFieldPlan(variableValues = emptyObject) {
    const rootType = this.superSchema.getRootType(this.operation.operation);
    if (rootType === undefined) {
      return new graphql_1.GraphQLError(
        `Schema is not configured to execute ${this.operation.operation} operation.`,
        { nodes: this.operation },
      );
    }
    const filteredOperation = (0,
    applySkipIncludeDirectives_js_1.applySkipIncludeDirectives)(
      this.operation,
      variableValues,
    );
    const fieldNodes = this._collectSubFields(
      rootType,
      filteredOperation.selectionSet.selections,
    );
    return this._createFieldPlan(rootType, fieldNodes);
  }
  _collectSubFieldsImpl(
    runtimeType,
    selections,
    fieldNodes = appendToArray_js_1.emptyArray,
    visitedFragmentNames = new Set(),
  ) {
    let newFieldNodes = fieldNodes;
    const schema = this.superSchema.mergedSchema;
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          newFieldNodes = (0, appendToArray_js_1.appendToArray)(
            newFieldNodes,
            selection,
          );
          break;
        }
        case graphql_1.Kind.INLINE_FRAGMENT: {
          if (
            !this._doesFragmentConditionMatch(schema, selection, runtimeType)
          ) {
            continue;
          }
          newFieldNodes = this._collectSubFieldsImpl(
            runtimeType,
            selection.selectionSet.selections,
            newFieldNodes,
            visitedFragmentNames,
          );
          break;
        }
        case graphql_1.Kind.FRAGMENT_SPREAD: {
          throw new Error('Unexpected fragment spread in selection set.');
        }
      }
    }
    return newFieldNodes;
  }
  /**
   * Determines if a fragment is applicable to the given type.
   */
  _doesFragmentConditionMatch(schema, fragment, type) {
    const typeConditionNode = fragment.typeCondition;
    if (!typeConditionNode) {
      return true;
    }
    const conditionalType = (0, graphql_1.typeFromAST)(
      schema,
      typeConditionNode,
    );
    if (conditionalType === type) {
      return true;
    }
    if ((0, graphql_1.isAbstractType)(conditionalType)) {
      return schema.isSubType(conditionalType, type);
    }
    return false;
  }
  _createFieldPlanImpl(parentType, fieldNodes) {
    const fieldPlan = {
      superSchema: this.superSchema,
      subschemaPlans: new Map(),
      stitchPlans: Object.create(null),
    };
    for (const fieldNode of fieldNodes) {
      this._addFieldToFieldPlan(fieldPlan, undefined, parentType, fieldNode);
    }
    return {
      superSchema: fieldPlan.superSchema,
      subschemaPlans: [...fieldPlan.subschemaPlans.values()],
      stitchPlans: fieldPlan.stitchPlans,
    };
  }
  _createSupplementalFieldPlanImpl(parentType, fieldNodes, fromSubschema) {
    const fieldPlan = {
      superSchema: this.superSchema,
      subschemaPlans: new Map(),
      stitchPlans: Object.create(null),
    };
    for (const fieldNode of fieldNodes) {
      this._addFieldToFieldPlan(
        fieldPlan,
        fromSubschema,
        parentType,
        fieldNode,
      );
    }
    return {
      superSchema: fieldPlan.superSchema,
      subschemaPlans: [...fieldPlan.subschemaPlans.values()],
      stitchPlans: fieldPlan.stitchPlans,
    };
  }
  _addFieldToFieldPlan(fieldPlan, fromSubschema, parentType, field) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemas = subschemaSetsByField[field.name.value];
    if (subschemas === undefined) {
      return;
    }
    const subschemaPlans = fieldPlan.subschemaPlans;
    if (!field.selectionSet) {
      const { subschemaPlan } = this._getSubschemaAndPlan(
        subschemas,
        subschemaPlans,
        fromSubschema,
      );
      subschemaPlan.fieldNodes = (0, appendToArray_js_1.appendToArray)(
        subschemaPlan.fieldNodes,
        field,
      );
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const namedFieldType = (0, graphql_1.getNamedType)(fieldDef.type);
    const subschema = this._getSubschema(subschemas, subschemaPlans);
    const selectionSplit = this._createSelectionSplit(
      namedFieldType,
      field.selectionSet.selections,
      subschema,
      fromSubschema,
    );
    const stitchPlan = this._createStitchPlan(
      namedFieldType,
      selectionSplit.otherSelections,
      subschema,
    );
    if (selectionSplit.ownSelections.length) {
      const subschemaPlan = this._getSubschemaPlan(
        subschema,
        subschemaPlans,
        fromSubschema,
      );
      const splitField = {
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: selectionSplit.ownSelections,
        },
      };
      subschemaPlan.fieldNodes = (0, appendToArray_js_1.appendToArray)(
        subschemaPlan.fieldNodes,
        splitField,
      );
      if (stitchPlan.size > 0) {
        const responseKey = field.alias?.value ?? field.name.value;
        if (subschema === fromSubschema) {
          fieldPlan.stitchPlans[responseKey] = stitchPlan;
        } else {
          subschemaPlan.stitchPlans[responseKey] = stitchPlan;
        }
      }
    } else if (stitchPlan.size > 0) {
      const responseKey = field.alias?.value ?? field.name.value;
      if (subschema !== undefined && subschema === fromSubschema) {
        fieldPlan.stitchPlans[responseKey] = stitchPlan;
      } else {
        const { subschemaPlan } = this._getSubschemaAndPlan(
          subschemas,
          subschemaPlans,
          fromSubschema,
        );
        subschemaPlan.stitchPlans[responseKey] = stitchPlan;
      }
    }
  }
  _getSubschemaAndPlan(subschemas, subschemaPlans, fromSubschema) {
    for (const subschema of subschemas) {
      const subschemaPlan = subschemaPlans.get(subschema);
      if (subschemaPlan) {
        return { subschema, subschemaPlan };
      }
    }
    const subschema = subschemas.values().next().value;
    const subschemaPlan = {
      toSubschema: subschema,
      fromSubschema,
      fieldNodes: appendToArray_js_1.emptyArray,
      stitchPlans: Object.create(null),
    };
    subschemaPlans.set(subschema, subschemaPlan);
    return { subschema, subschemaPlan };
  }
  _getSubschema(subschemas, subschemaPlans) {
    for (const subschema of subschemas) {
      const subschemaPlan = subschemaPlans.get(subschema);
      if (subschemaPlan) {
        return subschema;
      }
    }
    return subschemas.values().next().value;
  }
  _getSubschemaPlan(subschema, subschemaPlans, fromSubschema) {
    let subschemaPlan = subschemaPlans.get(subschema);
    if (subschemaPlan !== undefined) {
      return subschemaPlan;
    }
    subschemaPlan = {
      toSubschema: subschema,
      fromSubschema,
      fieldNodes: appendToArray_js_1.emptyArray,
      stitchPlans: Object.create(null),
    };
    subschemaPlans.set(subschema, subschemaPlan);
    return subschemaPlan;
  }
  _createStitchPlan(parentType, otherSelections, subschema) {
    const stitchPlan = new Map();
    let possibleTypes;
    if ((0, graphql_1.isAbstractType)(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }
    for (const type of possibleTypes) {
      const fieldNodes = this._collectSubFields(type, otherSelections);
      const fieldPlan = this._createSupplementalFieldPlan(
        type,
        fieldNodes,
        subschema,
      );
      if (
        fieldPlan.subschemaPlans.length > 0 ||
        Object.values(fieldPlan.stitchPlans).length > 0
      ) {
        stitchPlan.set(type, fieldPlan);
      }
    }
    return stitchPlan;
  }
  _createSelectionSplit(parentType, selections, subschema, fromSubschema) {
    const selectionSplit = {
      ownSelections: appendToArray_js_1.emptyArray,
      otherSelections: appendToArray_js_1.emptyArray,
    };
    this._processSelectionsForSelectionSplit(
      selectionSplit,
      subschema,
      fromSubschema,
      parentType,
      selections,
    );
    if (
      fromSubschema === undefined &&
      selectionSplit.otherSelections.length > 0
    ) {
      selectionSplit.ownSelections = (0, appendToArray_js_1.appendToArray)(
        selectionSplit.ownSelections,
        {
          kind: graphql_1.Kind.FIELD,
          name: {
            kind: graphql_1.Kind.NAME,
            value: graphql_1.TypeNameMetaFieldDef.name,
          },
          alias: {
            kind: graphql_1.Kind.NAME,
            value: '__stitching__typename',
          },
        },
      );
    }
    return selectionSplit;
  }
  _processSelectionsForSelectionSplit(
    selectionSplit,
    subschema,
    fromSubschema,
    parentType,
    selections,
  ) {
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addFieldToSelectionSplit(
            selectionSplit,
            subschema,
            fromSubschema,
            parentType,
            selection,
          );
          break;
        }
        case graphql_1.Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.superSchema.getType(typeName)
              : parentType;
          (0, graphql_1.isCompositeType)(refinedType) ||
            (0, invariant_js_1.invariant)(
              false,
              `Invalid type condition ${(0, inspect_js_1.inspect)(
                refinedType,
              )}`,
            );
          this._addFragmentToSelectionSplit(
            selectionSplit,
            subschema,
            fromSubschema,
            refinedType,
            selection,
          );
          break;
        }
        case graphql_1.Kind.FRAGMENT_SPREAD: {
          throw new Error('Unexpected fragment spread in selection set.');
        }
      }
    }
  }
  _addFieldToSelectionSplit(
    selectionSplit,
    subschema,
    fromSubschema,
    parentType,
    field,
  ) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSet = subschemaSetsByField[field.name.value];
    if (subschemaSet === undefined) {
      return;
    }
    if (!field.selectionSet) {
      if (subschemaSet.has(subschema)) {
        selectionSplit.ownSelections = (0, appendToArray_js_1.appendToArray)(
          selectionSplit.ownSelections,
          field,
        );
      } else {
        selectionSplit.otherSelections = (0, appendToArray_js_1.appendToArray)(
          selectionSplit.otherSelections,
          field,
        );
      }
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const subSelectionSplit = this._createSelectionSplit(
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      subschema,
      fromSubschema,
    );
    if (subSelectionSplit.ownSelections.length) {
      selectionSplit.ownSelections = (0, appendToArray_js_1.appendToArray)(
        selectionSplit.ownSelections,
        {
          ...field,
          selectionSet: {
            kind: graphql_1.Kind.SELECTION_SET,
            selections: subSelectionSplit.ownSelections,
          },
        },
      );
    }
    if (subSelectionSplit.otherSelections.length) {
      selectionSplit.otherSelections = (0, appendToArray_js_1.appendToArray)(
        selectionSplit.otherSelections,
        {
          ...field,
          selectionSet: {
            kind: graphql_1.Kind.SELECTION_SET,
            selections: subSelectionSplit.otherSelections,
          },
        },
      );
    }
  }
  _addFragmentToSelectionSplit(
    selectionSplit,
    subschema,
    fromSubschema,
    parentType,
    fragment,
  ) {
    const fragmentSelectionSplit = {
      ownSelections: appendToArray_js_1.emptyArray,
      otherSelections: appendToArray_js_1.emptyArray,
    };
    this._processSelectionsForSelectionSplit(
      fragmentSelectionSplit,
      subschema,
      fromSubschema,
      parentType,
      fragment.selectionSet.selections,
    );
    if (fragmentSelectionSplit.ownSelections.length > 0) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentSelectionSplit.ownSelections,
        },
      };
      selectionSplit.ownSelections = (0, appendToArray_js_1.appendToArray)(
        selectionSplit.ownSelections,
        splitFragment,
      );
    }
    if (fragmentSelectionSplit.otherSelections.length > 0) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentSelectionSplit.otherSelections,
        },
      };
      selectionSplit.otherSelections = (0, appendToArray_js_1.appendToArray)(
        selectionSplit.otherSelections,
        splitFragment,
      );
    }
  }
}
exports.Planner = Planner;
