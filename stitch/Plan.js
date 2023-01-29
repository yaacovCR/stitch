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
    );
    this.map = splitSelections;
  }
  _splitSelections(parentType, selections) {
    const map = new Map();
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, map);
          break;
        }
        case graphql_1.Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;
          this._addInlineFragment(refinedType, selection, map);
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
  _addField(parentType, field, map) {
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
    const fieldPlan = new Plan(
      this.superSchema,
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      this.fragmentMap,
    );
    const filteredSelections = fieldPlan.map.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: filteredSelections,
        },
      });
      fieldPlan.map.delete(subschema);
    }
    if (
      fieldPlan.map.size > 0 ||
      Object.values(fieldPlan.subPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;
      this.subPlans[responseKey] = fieldPlan;
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
  _addInlineFragment(parentType, fragment, map) {
    const splitSelections = this._splitSelections(
      parentType,
      fragment.selectionSet.selections,
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
  print(indent = 0) {
    let result = '';
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    const mapEntries = Array.from(this.map.entries()).map(
      ([subschema, selections]) => {
        let mapEntry = '';
        mapEntry += `${spaces}Subschema ${this.superSchema.getSubschemaId(
          subschema,
        )}:\n`;
        mapEntry += this._printSelectionSet(
          {
            kind: graphql_1.Kind.SELECTION_SET,
            selections,
          },
          indent,
        );
        return mapEntry;
      },
    );
    if (mapEntries.length > 0) {
      result += `${spaces}Map:\n`;
    }
    const subPlanEntries = Array.from(Object.entries(this.subPlans)).map(
      ([responseKey, plan]) => {
        let subPlanEntry = '';
        subPlanEntry += `${spaces}SubPlan for '${responseKey}':\n`;
        subPlanEntry += plan.print(indent + 2);
        return subPlanEntry;
      },
    );
    result += [...mapEntries, ...subPlanEntries].join('\n');
    return result;
  }
  _printSelectionSet(selectionSet, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    return (0, graphql_1.print)(selectionSet)
      .split('\n')
      .map((line) => `${spaces}${line}`)
      .join('\n');
  }
}
exports.Plan = Plan;
