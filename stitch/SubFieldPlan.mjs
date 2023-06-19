import {
  getNamedType,
  isAbstractType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';
import { collectSubFields } from '../utilities/collectSubFields.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { createFieldPlan } from './FieldPlan.mjs';
/**
 * @internal
 */
export class SubFieldPlan {
  constructor(operationContext, parentType, selections, subschema) {
    this.operationContext = operationContext;
    this.parentType = parentType;
    this.visitedFragments = new Set();
    this.subschema = subschema;
    this.subFieldPlans = Object.create(null);
    const { ownSelections, otherSelections } = this._processSelections(
      this.parentType,
      selections,
    );
    this.ownSelections = ownSelections;
    this.otherSelections = otherSelections;
    let possibleTypes;
    if (isAbstractType(parentType)) {
      possibleTypes =
        this.operationContext.superSchema.mergedSchema.getPossibleTypes(
          parentType,
        );
    } else {
      possibleTypes = [parentType];
    }
    this.fieldPlans = new Map();
    for (const type of possibleTypes) {
      const fieldNodes = collectSubFields(
        this.operationContext,
        type,
        otherSelections,
      );
      const fieldPlan = createFieldPlan(
        this.operationContext,
        type,
        fieldNodes,
      );
      if (
        fieldPlan.selectionMap.size > 0 ||
        Object.values(fieldPlan.subFieldPlans).length > 0
      ) {
        this.fieldPlans.set(type, fieldPlan);
      }
    }
  }
  _processSelections(parentType, selections) {
    const ownSelections = [];
    const otherSelections = [];
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, ownSelections, otherSelections);
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
            ownSelections,
            otherSelections,
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
            ownSelections,
            otherSelections,
          );
          break;
        }
      }
    }
    return {
      ownSelections,
      otherSelections,
    };
  }
  _addField(parentType, field, ownSelections, otherSelections) {
    const subschemaSetsByField =
      this.operationContext.superSchema.subschemaSetsByTypeAndField[
        parentType.name
      ];
    const subschemaSet = subschemaSetsByField[field.name.value];
    if (subschemaSet === undefined) {
      return;
    }
    if (!field.selectionSet) {
      if (subschemaSet.has(this.subschema)) {
        ownSelections.push(field);
      } else {
        otherSelections.push(field);
      }
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this._getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const subFieldPlan = new SubFieldPlan(
      this.operationContext,
      getNamedType(fieldType),
      field.selectionSet.selections,
      this.subschema,
    );
    if (subFieldPlan.ownSelections.length) {
      ownSelections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subFieldPlan.ownSelections,
        },
      });
    }
    if (subFieldPlan.otherSelections.length) {
      otherSelections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subFieldPlan.otherSelections,
        },
      });
    }
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
  _addFragment(parentType, node, selections, ownSelections, otherSelections) {
    const {
      ownSelections: fragmentOwnSelections,
      otherSelections: fragmentOtherSelections,
    } = this._processSelections(parentType, selections);
    if (fragmentOwnSelections.length > 0) {
      const splitFragment = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentOwnSelections,
        },
      };
      ownSelections.push(splitFragment);
    }
    if (fragmentOtherSelections.length > 0) {
      const splitFragment = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentOtherSelections,
        },
      };
      otherSelections.push(splitFragment);
    }
  }
}
