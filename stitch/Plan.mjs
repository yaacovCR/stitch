import {
  getNamedType,
  Kind,
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
      [],
    );
    this.map = splitSelections;
  }
  _splitSelections(parentType, selections, path) {
    const map = new Map();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, map, [
            ...path,
            selection.name.value,
          ]);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;
          this._addInlineFragment(refinedType, selection, map, path);
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
      getNamedType(fieldType),
      field.selectionSet.selections,
      this.fragmentMap,
    );
    const filteredSelections = subPlan.map.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
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
        case SchemaMetaFieldDef.name:
          return SchemaMetaFieldDef;
        case TypeMetaFieldDef.name:
          return TypeMetaFieldDef;
        case TypeNameMetaFieldDef.name:
          return TypeNameMetaFieldDef;
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
}
