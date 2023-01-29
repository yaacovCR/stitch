'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Plan = void 0;
const graphql_1 = require('graphql');
const inlineRootFragments_js_1 = require('../utilities/inlineRootFragments.js');
const invariant_js_1 = require('../utilities/invariant.js');
/**
 * @internal
 */
class Plan {
  constructor(superSchema, parentType, selections, fragmentMap) {
    this.superSchema = superSchema;
    this.parentType = parentType;
    this.fragmentMap = fragmentMap;
    this.subPlans = Object.create(null);
    const inlinedSelections = (0, inlineRootFragments_js_1.inlineRootFragments)(
      selections,
      fragmentMap,
    );
    const splitSelections = this._splitSelections(
      parentType,
      inlinedSelections,
      [],
    );
    this.map = splitSelections;
  }
  _splitSelections(parentType, selections, path) {
    const map = new Map();
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, map, [
            ...path,
            selection.name.value,
          ]);
          break;
        }
        case graphql_1.Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;
          this._addInlineFragment(refinedType, selection, map, path);
          break;
        }
        case graphql_1.Kind.FRAGMENT_SPREAD: {
          // Not reached
          false ||
            (0, invariant_js_1.invariant)(
              false,
              'Fragment spreads should be inlined prior to selections being split!',
            );
        }
      }
    }
    return map;
  }
  _addField(parentType, field, map, path) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (!subschemaSets) {
      return;
    }
    const { subschema, selections } = this._getSubschemaAndSelections(
      Array.from(subschemaSets),
      map,
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
    const subPlan = new Plan(
      this.superSchema,
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      this.fragmentMap,
    );
    const filteredSelections = subPlan.map.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: filteredSelections,
        },
      });
      subPlan.map.delete(subschema);
    }
    for (const [fieldPath, fieldSubPlan] of Object.entries(subPlan.subPlans)) {
      this.subPlans[[...path, fieldPath].join('.')] = fieldSubPlan;
    }
    if (subPlan.map.size > 0) {
      this.subPlans[path.join('.')] = subPlan;
    }
  }
  _getSubschemaAndSelections(subschemas, map) {
    let selections;
    for (const subschema of subschemas) {
      selections = map.get(subschema);
      if (selections) {
        return { subschema, selections };
      }
    }
    selections = [];
    const subschema = subschemas[0];
    map.set(subschema, selections);
    return { subschema, selections };
  }
  _getFieldDef(parentType, fieldName) {
    const fields = parentType.getFields();
    const field = fields[fieldName];
    if (field) {
      return field;
    }
    if (parentType === this.superSchema.mergedSchema.getQueryType()) {
      switch (fieldName) {
        case graphql_1.SchemaMetaFieldDef.name:
          return graphql_1.SchemaMetaFieldDef;
        case graphql_1.TypeMetaFieldDef.name:
          return graphql_1.TypeMetaFieldDef;
        case graphql_1.TypeNameMetaFieldDef.name:
          return graphql_1.TypeNameMetaFieldDef;
      }
    }
  }
  _addInlineFragment(parentType, fragment, map, path) {
    const splitSelections = this._splitSelections(
      parentType,
      fragment.selectionSet.selections,
      path,
    );
    for (const [fragmentSubschema, fragmentSelections] of splitSelections) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      const selections = map.get(fragmentSubschema);
      if (selections) {
        selections.push(splitFragment);
      } else {
        map.set(fragmentSubschema, [splitFragment]);
      }
    }
  }
}
exports.Plan = Plan;
