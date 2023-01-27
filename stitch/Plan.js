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
  constructor(superSchema, operationContext) {
    this.superSchema = superSchema;
    this.operationContext = operationContext;
    this.fragmentMap = operationContext.fragmentMap;
    this.map = new Map();
    const { operation, fragments, fragmentMap } = this.operationContext;
    const rootType = this.superSchema.getRootType(operation.operation);
    rootType !== undefined ||
      (0, invariant_js_1.invariant)(
        false,
        `Schema is not configured to execute ${operation.operation}`,
      );
    const inlinedSelectionSet = (0,
    inlineRootFragments_js_1.inlineRootFragments)(
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
        kind: graphql_1.Kind.DOCUMENT,
        definitions: [
          {
            ...operation,
            selectionSet: {
              kind: graphql_1.Kind.SELECTION_SET,
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
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, map, subPlans, [
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
          this._addInlineFragment(refinedType, selection, map, subPlans, path);
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
  _addField(parentType, field, map, subPlans, path) {
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
    const inlinedSelectionSet = (0,
    inlineRootFragments_js_1.inlineRootFragments)(
      field.selectionSet,
      this.fragmentMap,
    );
    const fieldName = field.name.value;
    const fieldDef = this._getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const splitSelections = this._splitSelectionSet(
      (0, graphql_1.getNamedType)(fieldType),
      inlinedSelectionSet,
      subPlans,
      path,
    );
    const filteredSelections = splitSelections.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
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
