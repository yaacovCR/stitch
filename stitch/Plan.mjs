import {
  getNamedType,
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
} from 'graphql';
import { inlineRootFragments } from '../utilities/inlineRootFragments.mjs';
import { invariant } from '../utilities/invariant.mjs';
/**
 * @internal
 */
export class Plan {
  constructor(superSchema, operationContext) {
    this.superSchema = superSchema;
    this.operationContext = operationContext;
    this.fragmentMap = operationContext.fragmentMap;
    this.map = new Map();
    const { operation, fragments, fragmentMap } = this.operationContext;
    const rootType = this.superSchema.getRootType(operation.operation);
    rootType !== undefined ||
      invariant(
        false,
        `Schema is not configured to execute ${operation.operation}`,
      );
    const inlinedSelectionSet = inlineRootFragments(
      operation.selectionSet,
      fragmentMap,
    );
    const subPlans = Object.create(null);
    const splitSelections = this._splitSelectionSet(
      rootType,
      inlinedSelectionSet,
      subPlans,
      [],
    );
    for (const [subschema, selections] of splitSelections) {
      const document = {
        kind: Kind.DOCUMENT,
        definitions: [
          {
            ...operation,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections,
            },
          },
          ...fragments,
        ],
      };
      this.map.set(subschema, {
        document,
        subPlans,
      });
    }
  }
  _splitSelectionSet(parentType, selectionSet, subPlans, path) {
    const map = new Map();
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, map, subPlans, [
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
          this._addInlineFragment(refinedType, selection, map, subPlans, path);
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
  _addField(parentType, field, map, subPlans, path) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemas = subschemaSetsByField[field.name.value];
    if (subschemas) {
      let subschemaAndSelections;
      for (const subschema of subschemas) {
        const selections = map.get(subschema);
        if (selections) {
          subschemaAndSelections = { subschema, selections };
          break;
        }
      }
      if (!subschemaAndSelections) {
        const subschema = subschemas.values().next().value;
        const selections = [];
        map.set(subschema, selections);
        subschemaAndSelections = { subschema, selections };
      }
      const { subschema, selections } = subschemaAndSelections;
      if (!field.selectionSet) {
        selections.push(field);
        return;
      }
      const inlinedSelectionSet = inlineRootFragments(
        field.selectionSet,
        this.fragmentMap,
      );
      const fieldName = field.name.value;
      const fieldDef = this._getFieldDef(parentType, fieldName);
      if (fieldDef) {
        const fieldType = fieldDef.type;
        const splitSelections = this._splitSelectionSet(
          getNamedType(fieldType),
          inlinedSelectionSet,
          subPlans,
          path,
        );
        const filteredSelections = splitSelections.get(subschema);
        if (filteredSelections) {
          selections.push({
            ...field,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: filteredSelections,
            },
          });
        }
        splitSelections.delete(subschema);
        if (splitSelections.size > 0) {
          subPlans[path.join('.')] = {
            type: fieldType,
            selectionsBySubschema: splitSelections,
          };
        }
      }
    }
  }
  _getFieldDef(parentType, fieldName) {
    if (
      fieldName === SchemaMetaFieldDef.name &&
      parentType === this.superSchema.mergedSchema.getQueryType()
    ) {
      return SchemaMetaFieldDef;
    }
    if (
      fieldName === TypeMetaFieldDef.name &&
      parentType === this.superSchema.mergedSchema.getQueryType()
    ) {
      return TypeMetaFieldDef;
    }
    const fields = parentType.getFields();
    return fields[fieldName];
  }
  _addInlineFragment(parentType, fragment, map, subPlans, path) {
    const splitSelections = this._splitSelectionSet(
      parentType,
      fragment.selectionSet,
      subPlans,
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
