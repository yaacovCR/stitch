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
  constructor(operationContext, parentType, selections, subschema) {
    this.operationContext = operationContext;
    this.parentType = parentType;
    this.visitedFragments = new Set();
    this.subschema = subschema;
    this.subFieldPlans = Object.create(null);
    const { ownSelections, otherSelections } = this._processSelections(
      this.parentType,
      selections,
    );
    this.ownSelections = ownSelections;
    this.otherSelections = otherSelections;
    let possibleTypes;
    if ((0, graphql_1.isAbstractType)(parentType)) {
      possibleTypes =
        this.operationContext.superSchema.mergedSchema.getPossibleTypes(
          parentType,
        );
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
      const fieldPlan = (0, FieldPlan_js_1.createFieldPlan)(
        this.operationContext,
        type,
        fieldNodes,
      );
      if (
        fieldPlan.selectionMap.size > 0 ||
        Object.values(fieldPlan.subFieldPlans).length > 0
      ) {
        this.fieldPlans.set(type, fieldPlan);
      }
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
    const fieldDef = this._getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const subFieldPlan = new SubFieldPlan(
      this.operationContext,
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      this.subschema,
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
  _getFieldDef(parentType, fieldName) {
    if (fieldName === '__typename') {
      return graphql_1.TypeNameMetaFieldDef;
    }
    (0, graphql_1.isObjectType)(parentType) ||
      (0, graphql_1.isInterfaceType)(parentType) ||
      (0, invariant_js_1.invariant)(
        false,
        `Invalid parent type ${(0, inspect_js_1.inspect)(parentType)}.`,
      );
    const fields = parentType.getFields();
    const field = fields[fieldName];
    if (field !== undefined) {
      return field;
    }
    if (
      parentType ===
      this.operationContext.superSchema.mergedSchema.getQueryType()
    ) {
      switch (fieldName) {
        case graphql_1.SchemaMetaFieldDef.name:
          return graphql_1.SchemaMetaFieldDef;
        case graphql_1.TypeMetaFieldDef.name:
          return graphql_1.TypeMetaFieldDef;
      }
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
