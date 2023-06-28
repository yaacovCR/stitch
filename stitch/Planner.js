'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Planner = exports.createPlanner = void 0;
const graphql_1 = require('graphql');
const AccumulatorMap_js_1 = require('../utilities/AccumulatorMap.js');
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
      this._createFieldPlanFromSubschemasImpl.bind(this),
    );
    this._createFieldPlanFromSubschemas = (0, memoize3_js_1.memoize3)(
      (parentType, fieldNodes, fromSubschemas) =>
        this._createFieldPlanFromSubschemasImpl(
          parentType,
          fieldNodes,
          fromSubschemas,
        ),
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
  _createFieldPlanFromSubschemasImpl(
    parentType,
    fieldNodes,
    fromSubschemas = appendToArray_js_1.emptyArray,
  ) {
    const fieldPlan = {
      selectionMap: new AccumulatorMap_js_1.AccumulatorMap(),
      stitchTrees: Object.create(null),
      superSchema: this.superSchema,
    };
    for (const fieldNode of fieldNodes) {
      this._addFieldToFieldPlan(
        fieldPlan,
        fromSubschemas,
        parentType,
        fieldNode,
      );
    }
    return fieldPlan;
  }
  _addFieldToFieldPlan(fieldPlan, fromSubschemas, parentType, field) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (subschemaSets === undefined) {
      return;
    }
    const selectionMap = fieldPlan.selectionMap;
    const subschema = this._getSubschema(subschemaSets, selectionMap);
    if (!field.selectionSet) {
      selectionMap.add(subschema, field);
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = (0, graphql_1.getNamedType)(fieldDef.type);
    const selectionSplit = this._createSelectionSplit(
      fieldType,
      field.selectionSet.selections,
      subschema,
      fromSubschemas,
    );
    if (selectionSplit.ownSelections.length) {
      selectionMap.add(subschema, {
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: selectionSplit.ownSelections,
        },
      });
    }
    const stitchTree = this._createStitchTree(
      fieldType,
      selectionSplit.otherSelections,
      subschema,
      fromSubschemas,
    );
    if (stitchTree.fieldPlans.size > 0) {
      const responseKey = field.alias?.value ?? field.name.value;
      fieldPlan.stitchTrees[responseKey] = stitchTree;
    }
  }
  _getSubschema(subschemas, selectionMap) {
    let selections;
    for (const subschema of subschemas) {
      selections = selectionMap.get(subschema);
      if (selections) {
        return subschema;
      }
    }
    return subschemas.values().next().value;
  }
  _createStitchTree(parentType, otherSelections, subschema, fromSubschemas) {
    const fieldPlans = new Map();
    let possibleTypes;
    if ((0, graphql_1.isAbstractType)(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }
    for (const type of possibleTypes) {
      const fieldNodes = this._collectSubFields(type, otherSelections);
      const fieldPlan = this._createFieldPlanFromSubschemas(
        type,
        fieldNodes,
        (0, appendToArray_js_1.appendToArray)(fromSubschemas, subschema),
      );
      if (
        fieldPlan.selectionMap.size > 0 ||
        Object.values(fieldPlan.stitchTrees).length > 0
      ) {
        fieldPlans.set(type, fieldPlan);
      }
    }
    return {
      fieldPlans,
      fromSubschemas,
    };
  }
  _createSelectionSplit(parentType, selections, subschema, fromSubschemas) {
    const selectionSplit = {
      ownSelections: appendToArray_js_1.emptyArray,
      otherSelections: appendToArray_js_1.emptyArray,
    };
    this._processSelectionsForSelectionSplit(
      selectionSplit,
      subschema,
      fromSubschemas,
      parentType,
      selections,
    );
    if (
      fromSubschemas.length === 0 &&
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
    fromSubschemas,
    parentType,
    selections,
  ) {
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addFieldToSelectionSplit(
            selectionSplit,
            subschema,
            fromSubschemas,
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
            fromSubschemas,
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
    fromSubschemas,
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
      fromSubschemas,
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
    fromSubschemas,
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
      fromSubschemas,
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
