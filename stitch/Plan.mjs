import {
  getNamedType,
  Kind,
  print,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';
import { inlineRootFragments } from '../utilities/inlineRootFragments.mjs';
import { invariant } from '../utilities/invariant.mjs';
/**
 * @internal
 */
export class Plan {
  constructor(superSchema, parentType, selections, fragmentMap) {
    this.superSchema = superSchema;
    this.parentType = parentType;
    this.fragmentMap = fragmentMap;
    this.subPlans = Object.create(null);
    const inlinedSelections = inlineRootFragments(selections, fragmentMap);
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
        case Kind.FIELD: {
          this._addField(parentType, selection, map);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;
          this._addInlineFragment(refinedType, selection, map);
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          // Not reached
          false ||
            invariant(
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
      getNamedType(fieldType),
      field.selectionSet.selections,
      this.fragmentMap,
    );
    const filteredSelections = fieldPlan.map.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
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
        case SchemaMetaFieldDef.name:
          return SchemaMetaFieldDef;
        case TypeMetaFieldDef.name:
          return TypeMetaFieldDef;
        case TypeNameMetaFieldDef.name:
          return TypeNameMetaFieldDef;
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
          kind: Kind.SELECTION_SET,
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
    const entries = [];
    if (this.map.size > 0) {
      entries.push(this._printMap(indent));
    }
    const subPlans = Array.from(Object.entries(this.subPlans));
    if (subPlans.length > 0) {
      entries.push(this._printSubPlans(subPlans, indent));
    }
    return entries.join('\n');
  }
  _printMap(indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = `${spaces}Map:\n`;
    result += Array.from(this.map.entries())
      .map(([subschema, selections]) =>
        this._printSubschemaSelections(subschema, selections, indent + 2),
      )
      .join('\n');
    return result;
  }
  _printSubschemaSelections(subschema, selections, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = '';
    result += `${spaces}Subschema ${this.superSchema.getSubschemaId(
      subschema,
    )}:\n`;
    result += `${spaces}  `;
    result += this._printSelectionSet(
      {
        kind: Kind.SELECTION_SET,
        selections,
      },
      indent + 2,
    );
    return result;
  }
  _printSubPlans(subPlans, indent) {
    return subPlans
      .map(([responseKey, subPlan]) =>
        this._printSubPlan(responseKey, subPlan, indent),
      )
      .join('\n');
  }
  _printSubPlan(responseKey, subPlan, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let subPlanEntry = '';
    subPlanEntry += `${spaces}SubPlan for '${responseKey}':\n`;
    subPlanEntry += subPlan.print(indent + 2);
    return subPlanEntry;
  }
  _printSelectionSet(selectionSet, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    return print(selectionSet).split('\n').join(`\n${spaces}`);
  }
}