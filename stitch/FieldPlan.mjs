import {
  getNamedType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Kind,
  print,
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
  constructor(operationContext, parentType, selections) {
    this.operationContext = operationContext;
    this.parentType = parentType;
    this.subFieldPlans = Object.create(null);
    this.visitedFragments = new Set();
    this.selectionMap = this._processSelections(this.parentType, selections);
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
          this._addFragment(refinedType, selection, selectionMap);
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
          this._addFragment(refinedType, fragment, selectionMap);
          break;
        }
      }
    }
    return selectionMap;
  }
  _addField(parentType, field, selectionMap) {
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
    );
    const filteredSelections = subFieldPlan.selectionMap.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: filteredSelections,
        },
      });
      subFieldPlan.selectionMap.delete(subschema);
    }
    if (
      subFieldPlan.selectionMap.size > 0 ||
      Object.values(subFieldPlan.subFieldPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;
      this.subFieldPlans[responseKey] = subFieldPlan;
    }
  }
  _getSubschemaAndSelections(subschemas, selectionMap) {
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
  _addFragment(parentType, fragment, selectionMap) {
    const fragmentSelectionMap = this._processSelections(
      parentType,
      fragment.selectionSet.selections,
    );
    this._addFragmentSelectionMap(fragmentSelectionMap, selectionMap);
  }
  _addFragmentSelectionMap(fragmentSelectionMap, selectionMap) {
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
  print(indent = 0) {
    const entries = [];
    if (this.selectionMap.size > 0) {
      entries.push(this._printMap(indent));
    }
    const subFieldPlans = Array.from(Object.entries(this.subFieldPlans));
    if (subFieldPlans.length > 0) {
      entries.push(this._printSubFieldPlans(subFieldPlans, indent));
    }
    return entries.join('\n');
  }
  _printMap(indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = `${spaces}Map:\n`;
    result += Array.from(this.selectionMap.entries())
      .map(([subschema, selections]) =>
        this._printSubschemaSelections(subschema, selections, indent + 2),
      )
      .join('\n');
    return result;
  }
  _printSubschemaSelections(subschema, selections, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = '';
    result += `${spaces}Subschema ${this.operationContext.superSchema.getSubschemaId(
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
  _printSubFieldPlans(subFieldPlans, indent) {
    return subFieldPlans
      .map(([responseKey, subFieldPlan]) =>
        this._printSubFieldPlan(responseKey, subFieldPlan, indent),
      )
      .join('\n');
  }
  _printSubFieldPlan(responseKey, subFieldPlan, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let subFieldPlanEntry = '';
    subFieldPlanEntry += `${spaces}SubFieldPlan for '${responseKey}':\n`;
    subFieldPlanEntry += subFieldPlan.print(indent + 2);
    return subFieldPlanEntry;
  }
  _printSelectionSet(selectionSet, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    return print(selectionSet).split('\n').join(`\n${spaces}`);
  }
}
