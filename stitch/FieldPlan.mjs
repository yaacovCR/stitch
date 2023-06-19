import { getNamedType, isCompositeType, Kind } from 'graphql';
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { memoize3 } from '../utilities/memoize3.mjs';
import { SubFieldPlan } from './SubFieldPlan.mjs';
export const createFieldPlan = memoize3(
  (operationContext, parentType, selections) =>
    new FieldPlan(operationContext, parentType, selections),
);
/**
 * @internal
 */
export class FieldPlan {
  constructor(operationContext, parentType, selections) {
    this.operationContext = operationContext;
    this.superSchema = operationContext.superSchema;
    this.subFieldPlans = Object.create(null);
    this.visitedFragments = new Set();
    const selectionMap = this._processSelections(parentType, selections);
    this.selectionMap = selectionMap;
  }
  _processSelections(parentType, selections) {
    const selectionMap = new AccumulatorMap();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, selectionMap);
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
            selection.selectionSet.selections,
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
    const subFieldPlan = new SubFieldPlan(
      this.operationContext,
      getNamedType(fieldType),
      field.selectionSet.selections,
      subschema,
    );
    if (subFieldPlan.ownSelections.length) {
      selectionMap.add(subschema, {
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
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
