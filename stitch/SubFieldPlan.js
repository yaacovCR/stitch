'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SubFieldPlan = void 0;
const graphql_1 = require('graphql');
const collectSubFields_js_1 = require('../utilities/collectSubFields.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
const FieldPlan_js_1 = require('./FieldPlan.js');
/**
 * @internal
 */
class SubFieldPlan {
  constructor(operationContext, parentType, selections, subschema, nested) {
    this.operationContext = operationContext;
    this.superSchema = operationContext.superSchema;
    this.visitedFragments = new Set();
    this.subschema = subschema;
    this.nested = nested;
    const { ownSelections, otherSelections } = this._processSelections(
      parentType,
      selections,
    );
    this.ownSelections = ownSelections;
    this.otherSelections = otherSelections;
    let possibleTypes;
    if ((0, graphql_1.isAbstractType)(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }
    this.fieldPlans = new Map();
    for (const type of possibleTypes) {
      const fieldNodes = (0, collectSubFields_js_1.collectSubFields)(
        this.operationContext,
        type,
        otherSelections,
      );
      const fieldPlan = new FieldPlan_js_1.FieldPlan(
        this.operationContext,
        type,
        fieldNodes,
        nested + 1,
      );
      if (
        fieldPlan.selectionMap.size > 0 ||
        Object.values(fieldPlan.subFieldPlans).length > 0
      ) {
        this.fieldPlans.set(type, fieldPlan);
      }
    }
    if (this.nested < 1 && this.fieldPlans.size > 0) {
      ownSelections.push({
        kind: graphql_1.Kind.FIELD,
        name: {
          kind: graphql_1.Kind.NAME,
          value: graphql_1.TypeNameMetaFieldDef.name,
        },
        alias: {
          kind: graphql_1.Kind.NAME,
          value: '__stitching__typename',
        },
      });
    }
  }
  _processSelections(parentType, selections) {
    const ownSelections = [];
    const otherSelections = [];
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, ownSelections, otherSelections);
          break;
        }
        case graphql_1.Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.operationContext.superSchema.getType(typeName)
              : parentType;
          (0, graphql_1.isCompositeType)(refinedType) ||
            (0, invariant_js_1.invariant)(
              false,
              `Invalid type condition ${(0, inspect_js_1.inspect)(
                refinedType,
              )}`,
            );
          this._addFragment(
            refinedType,
            selection,
            selection.selectionSet.selections,
            ownSelections,
            otherSelections,
          );
          break;
        }
        case graphql_1.Kind.FRAGMENT_SPREAD: {
          const fragmentName = selection.name.value;
          if (this.visitedFragments.has(fragmentName)) {
            continue;
          }
          this.visitedFragments.add(fragmentName);
          const fragment = this.operationContext.fragmentMap[fragmentName];
          const typeName = fragment.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.operationContext.superSchema.getType(typeName)
              : parentType;
          (0, graphql_1.isCompositeType)(refinedType) ||
            (0, invariant_js_1.invariant)(
              false,
              `Invalid type condition ${(0, inspect_js_1.inspect)(
                refinedType,
              )}`,
            );
          this._addFragment(
            refinedType,
            selection,
            fragment.selectionSet.selections,
            ownSelections,
            otherSelections,
          );
          break;
        }
      }
    }
    return {
      ownSelections,
      otherSelections,
    };
  }
  _addField(parentType, field, ownSelections, otherSelections) {
    const subschemaSetsByField =
      this.operationContext.superSchema.subschemaSetsByTypeAndField[
        parentType.name
      ];
    const subschemaSet = subschemaSetsByField[field.name.value];
    if (subschemaSet === undefined) {
      return;
    }
    if (!field.selectionSet) {
      if (subschemaSet.has(this.subschema)) {
        ownSelections.push(field);
      } else {
        otherSelections.push(field);
      }
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const subFieldPlan = new SubFieldPlan(
      this.operationContext,
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      this.subschema,
      this.nested,
    );
    if (subFieldPlan.ownSelections.length) {
      ownSelections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: subFieldPlan.ownSelections,
        },
      });
    }
    if (subFieldPlan.otherSelections.length) {
      otherSelections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: subFieldPlan.otherSelections,
        },
      });
    }
  }
  _addFragment(parentType, node, selections, ownSelections, otherSelections) {
    const {
      ownSelections: fragmentOwnSelections,
      otherSelections: fragmentOtherSelections,
    } = this._processSelections(parentType, selections);
    if (fragmentOwnSelections.length > 0) {
      const splitFragment = {
        ...node,
        kind: graphql_1.Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentOwnSelections,
        },
      };
      ownSelections.push(splitFragment);
    }
    if (fragmentOtherSelections.length > 0) {
      const splitFragment = {
        ...node,
        kind: graphql_1.Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentOtherSelections,
        },
      };
      otherSelections.push(splitFragment);
    }
  }
}
exports.SubFieldPlan = SubFieldPlan;
