import {
  getNamedType,
  GraphQLError,
  isAbstractType,
  isCompositeType,
  Kind,
  typeFromAST,
  TypeNameMetaFieldDef,
} from 'graphql';
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { appendToArray, emptyArray } from '../utilities/appendToArray.mjs';
import { applySkipIncludeDirectives } from '../utilities/applySkipIncludeDirectives.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { memoize2 } from '../utilities/memoize2.mjs';
import { memoize3 } from '../utilities/memoize3.mjs';
const emptyObject = {};
export const createPlanner = memoize2(
  (superSchema, operation) => new Planner(superSchema, operation),
);
/**
 * @internal
 */
export class Planner {
  constructor(superSchema, operation) {
    this._createFieldPlan = memoize2(
      this._createFieldPlanFromSubschemasImpl.bind(this),
    );
    this._createFieldPlanFromSubschemas = memoize3(
      (parentType, fieldNodes, fromSubschemas) =>
        this._createFieldPlanFromSubschemasImpl(
          parentType,
          fieldNodes,
          fromSubschemas,
        ),
    );
    this._collectSubFields = memoize2(this._collectSubFieldsImpl.bind(this));
    this.superSchema = superSchema;
    this.operation = operation;
    this.variableDefinitions = operation.variableDefinitions ?? [];
  }
  createRootFieldPlan(variableValues = emptyObject) {
    const rootType = this.superSchema.getRootType(this.operation.operation);
    if (rootType === undefined) {
      return new GraphQLError(
        `Schema is not configured to execute ${this.operation.operation} operation.`,
        { nodes: this.operation },
      );
    }
    const filteredOperation = applySkipIncludeDirectives(
      this.operation,
      variableValues,
    );
    const fieldNodes = this._collectSubFields(
      rootType,
      filteredOperation.selectionSet.selections,
    );
    return this._createFieldPlan(rootType, fieldNodes);
  }
  _collectSubFieldsImpl(
    runtimeType,
    selections,
    fieldNodes = emptyArray,
    visitedFragmentNames = new Set(),
  ) {
    let newFieldNodes = fieldNodes;
    const schema = this.superSchema.mergedSchema;
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          newFieldNodes = appendToArray(newFieldNodes, selection);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          if (
            !this._doesFragmentConditionMatch(schema, selection, runtimeType)
          ) {
            continue;
          }
          newFieldNodes = this._collectSubFieldsImpl(
            runtimeType,
            selection.selectionSet.selections,
            newFieldNodes,
            visitedFragmentNames,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          throw new Error('Unexpected fragment spread in selection set.');
        }
      }
    }
    return newFieldNodes;
  }
  /**
   * Determines if a fragment is applicable to the given type.
   */
  _doesFragmentConditionMatch(schema, fragment, type) {
    const typeConditionNode = fragment.typeCondition;
    if (!typeConditionNode) {
      return true;
    }
    const conditionalType = typeFromAST(schema, typeConditionNode);
    if (conditionalType === type) {
      return true;
    }
    if (isAbstractType(conditionalType)) {
      return schema.isSubType(conditionalType, type);
    }
    return false;
  }
  _createFieldPlanFromSubschemasImpl(
    parentType,
    fieldNodes,
    fromSubschemas = emptyArray,
  ) {
    const fieldPlan = {
      selectionMap: new AccumulatorMap(),
      stitchTrees: Object.create(null),
      superSchema: this.superSchema,
    };
    for (const fieldNode of fieldNodes) {
      this._addFieldToFieldPlan(
        fieldPlan,
        fromSubschemas,
        parentType,
        fieldNode,
      );
    }
    return fieldPlan;
  }
  _addFieldToFieldPlan(fieldPlan, fromSubschemas, parentType, field) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (subschemaSets === undefined) {
      return;
    }
    const selectionMap = fieldPlan.selectionMap;
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
    const fieldType = getNamedType(fieldDef.type);
    const selectionSplit = this._createSelectionSplit(
      fieldType,
      field.selectionSet.selections,
      subschema,
      fromSubschemas,
    );
    if (selectionSplit.ownSelections.length) {
      selectionMap.add(subschema, {
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: selectionSplit.ownSelections,
        },
      });
    }
    const stitchTree = this._createStitchTree(
      fieldType,
      selectionSplit.otherSelections,
      subschema,
      fromSubschemas,
    );
    if (stitchTree.fieldPlans.size > 0) {
      const responseKey = field.alias?.value ?? field.name.value;
      fieldPlan.stitchTrees[responseKey] = stitchTree;
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
  _createStitchTree(parentType, otherSelections, subschema, fromSubschemas) {
    const fieldPlans = new Map();
    let possibleTypes;
    if (isAbstractType(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }
    for (const type of possibleTypes) {
      const fieldNodes = this._collectSubFields(type, otherSelections);
      const fieldPlan = this._createFieldPlanFromSubschemas(
        type,
        fieldNodes,
        appendToArray(fromSubschemas, subschema),
      );
      if (
        fieldPlan.selectionMap.size > 0 ||
        Object.values(fieldPlan.stitchTrees).length > 0
      ) {
        fieldPlans.set(type, fieldPlan);
      }
    }
    return {
      fieldPlans,
      fromSubschemas,
    };
  }
  _createSelectionSplit(parentType, selections, subschema, fromSubschemas) {
    const selectionSplit = {
      ownSelections: emptyArray,
      otherSelections: emptyArray,
    };
    this._processSelectionsForSelectionSplit(
      selectionSplit,
      subschema,
      fromSubschemas,
      parentType,
      selections,
    );
    if (
      fromSubschemas.length === 0 &&
      selectionSplit.otherSelections.length > 0
    ) {
      selectionSplit.ownSelections = appendToArray(
        selectionSplit.ownSelections,
        {
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: TypeNameMetaFieldDef.name,
          },
          alias: {
            kind: Kind.NAME,
            value: '__stitching__typename',
          },
        },
      );
    }
    return selectionSplit;
  }
  _processSelectionsForSelectionSplit(
    selectionSplit,
    subschema,
    fromSubschemas,
    parentType,
    selections,
  ) {
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addFieldToSelectionSplit(
            selectionSplit,
            subschema,
            fromSubschemas,
            parentType,
            selection,
          );
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.superSchema.getType(typeName)
              : parentType;
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
          this._addFragmentToSelectionSplit(
            selectionSplit,
            subschema,
            fromSubschemas,
            refinedType,
            selection,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          throw new Error('Unexpected fragment spread in selection set.');
        }
      }
    }
  }
  _addFieldToSelectionSplit(
    selectionSplit,
    subschema,
    fromSubschemas,
    parentType,
    field,
  ) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSet = subschemaSetsByField[field.name.value];
    if (subschemaSet === undefined) {
      return;
    }
    if (!field.selectionSet) {
      if (subschemaSet.has(subschema)) {
        selectionSplit.ownSelections = appendToArray(
          selectionSplit.ownSelections,
          field,
        );
      } else {
        selectionSplit.otherSelections = appendToArray(
          selectionSplit.otherSelections,
          field,
        );
      }
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const fieldType = fieldDef.type;
    const subSelectionSplit = this._createSelectionSplit(
      getNamedType(fieldType),
      field.selectionSet.selections,
      subschema,
      fromSubschemas,
    );
    if (subSelectionSplit.ownSelections.length) {
      selectionSplit.ownSelections = appendToArray(
        selectionSplit.ownSelections,
        {
          ...field,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: subSelectionSplit.ownSelections,
          },
        },
      );
    }
    if (subSelectionSplit.otherSelections.length) {
      selectionSplit.otherSelections = appendToArray(
        selectionSplit.otherSelections,
        {
          ...field,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: subSelectionSplit.otherSelections,
          },
        },
      );
    }
  }
  _addFragmentToSelectionSplit(
    selectionSplit,
    subschema,
    fromSubschemas,
    parentType,
    fragment,
  ) {
    const fragmentSelectionSplit = {
      ownSelections: emptyArray,
      otherSelections: emptyArray,
    };
    this._processSelectionsForSelectionSplit(
      fragmentSelectionSplit,
      subschema,
      fromSubschemas,
      parentType,
      fragment.selectionSet.selections,
    );
    if (fragmentSelectionSplit.ownSelections.length > 0) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelectionSplit.ownSelections,
        },
      };
      selectionSplit.ownSelections = appendToArray(
        selectionSplit.ownSelections,
        splitFragment,
      );
    }
    if (fragmentSelectionSplit.otherSelections.length > 0) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelectionSplit.otherSelections,
        },
      };
      selectionSplit.otherSelections = appendToArray(
        selectionSplit.otherSelections,
        splitFragment,
      );
    }
  }
}
