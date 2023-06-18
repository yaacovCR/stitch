import {
  getNamedType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { memoize3 } from '../utilities/memoize3.mjs';
export const createFieldPlan = memoize3(
  (operationContext, parentType, selections) =>
    new FieldPlan(operationContext, parentType, selections),
);
/**
 * @internal
 */
export class FieldPlan {
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
    const selectionMap = new AccumulatorMap();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, ownSelections, selectionMap);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.operationContext.superSchema.getType(typeName)
              : parentType;
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
          this._addFragment(
            refinedType,
            selection,
            ownSelections,
            selectionMap,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
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
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
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
      getNamedType(fieldType),
      field.selectionSet.selections,
      subschema,
    );
    if (subFieldPlan.ownSelections.length) {
      selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
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
      return TypeNameMetaFieldDef;
    }
    isObjectType(parentType) ||
      isInterfaceType(parentType) ||
      invariant(false, `Invalid parent type ${inspect(parentType)}.`);
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
        case SchemaMetaFieldDef.name:
          return SchemaMetaFieldDef;
        case TypeMetaFieldDef.name:
          return TypeMetaFieldDef;
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
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
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
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
}
