'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.FieldPlan = exports.createFieldPlan = void 0;
const graphql_1 = require('graphql');
const AccumulatorMap_js_1 = require('../utilities/AccumulatorMap.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
const memoize3_js_1 = require('../utilities/memoize3.js');
exports.createFieldPlan = (0, memoize3_js_1.memoize3)(
  (operationContext, parentType, selections) =>
    new FieldPlan(operationContext, parentType, selections),
);
/**
 * @internal
 */
class FieldPlan {
  constructor(operationContext, parentType, selections, subschema) {
    this.operationContext = operationContext;
    this.parentType = parentType;
    this.subFieldPlans = Object.create(null);
    this.visitedFragments = new Set();
    this.subschema = subschema;
    const { ownSelections, selectionMap } = this._processSelections(
      this.parentType,
      selections,
    );
    this.ownSelections = ownSelections;
    this.selectionMap = selectionMap;
  }
  _processSelections(parentType, selections) {
    const ownSelections = [];
    const selectionMap = new AccumulatorMap_js_1.AccumulatorMap();
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, ownSelections, selectionMap);
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
            ownSelections,
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
          this._addFragment(refinedType, fragment, ownSelections, selectionMap);
          break;
        }
      }
    }
    return {
      ownSelections,
      selectionMap,
    };
  }
  _addField(parentType, field, ownSelections, selectionMap) {
    const subschemaSetsByField =
      this.operationContext.superSchema.subschemaSetsByTypeAndField[
        parentType.name
      ];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (subschemaSets === undefined) {
      return;
    }
    const { subschema, selections } = this._getSubschemaAndSelections(
      subschemaSets,
      ownSelections,
      selectionMap,
    );
    if (!field.selectionSet) {
      selections.push(field);
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this._getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const subFieldPlan = new FieldPlan(
      this.operationContext,
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      subschema,
    );
    if (subFieldPlan.ownSelections.length) {
      selections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: subFieldPlan.ownSelections,
        },
      });
    }
    if (
      subFieldPlan.selectionMap.size > 0 ||
      Object.values(subFieldPlan.subFieldPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;
      this.subFieldPlans[responseKey] = subFieldPlan;
    }
  }
  _getSubschemaAndSelections(subschemas, ownSelections, selectionMap) {
    if (this.subschema !== undefined && subschemas.has(this.subschema)) {
      return { subschema: this.subschema, selections: ownSelections };
    }
    let selections;
    for (const subschema of subschemas) {
      selections = selectionMap.get(subschema);
      if (selections) {
        return { subschema, selections };
      }
    }
    selections = [];
    const subschema = subschemas.values().next().value;
    selectionMap.set(subschema, selections);
    return { subschema, selections };
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
  _addFragment(parentType, fragment, ownSelections, selectionMap) {
    const {
      ownSelections: fragmentOwnSelections,
      selectionMap: fragmentSelectionMap,
    } = this._processSelections(parentType, fragment.selectionSet.selections);
    if (fragmentOwnSelections.length > 0) {
      const splitFragment = {
        kind: graphql_1.Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentOwnSelections,
        },
      };
      ownSelections.push(splitFragment);
    }
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment = {
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
