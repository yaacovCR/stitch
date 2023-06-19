'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.FieldPlan = exports.createFieldPlan = void 0;
const graphql_1 = require('graphql');
const AccumulatorMap_js_1 = require('../utilities/AccumulatorMap.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
const memoize3_js_1 = require('../utilities/memoize3.js');
const SubFieldPlan_js_1 = require('./SubFieldPlan.js');
exports.createFieldPlan = (0, memoize3_js_1.memoize3)(
  (operationContext, parentType, selections) =>
    new FieldPlan(operationContext, parentType, selections),
);
/**
 * @internal
 */
class FieldPlan {
  constructor(operationContext, parentType, selections) {
    this.operationContext = operationContext;
    this.superSchema = operationContext.superSchema;
    this.subFieldPlans = Object.create(null);
    this.visitedFragments = new Set();
    const selectionMap = this._processSelections(parentType, selections);
    this.selectionMap = selectionMap;
  }
  _processSelections(parentType, selections) {
    const selectionMap = new AccumulatorMap_js_1.AccumulatorMap();
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, selectionMap);
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
            selectionMap,
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
            selectionMap,
          );
          break;
        }
      }
    }
    return selectionMap;
  }
  _addField(parentType, field, selectionMap) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (subschemaSets === undefined) {
      return;
    }
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
    const fieldType = fieldDef.type;
    const subFieldPlan = new SubFieldPlan_js_1.SubFieldPlan(
      this.operationContext,
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      subschema,
    );
    if (subFieldPlan.ownSelections.length) {
      selectionMap.add(subschema, {
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: subFieldPlan.ownSelections,
        },
      });
    }
    if (
      subFieldPlan.fieldPlans.size > 0 ||
      Object.values(subFieldPlan.subFieldPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;
      this.subFieldPlans[responseKey] = subFieldPlan;
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
  _addFragment(parentType, node, selections, selectionMap) {
    const fragmentSelectionMap = this._processSelections(
      parentType,
      selections,
    );
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment = {
        ...node,
        kind: graphql_1.Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
}
exports.FieldPlan = FieldPlan;
