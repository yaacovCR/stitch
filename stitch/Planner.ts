import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLObjectType,
  GraphQLSchema,
  InlineFragmentNode,
  OperationDefinitionNode,
  SelectionNode,
  VariableDefinitionNode,
} from 'graphql';
import {
  getNamedType,
  GraphQLError,
  isAbstractType,
  isCompositeType,
  Kind,
  typeFromAST,
  TypeNameMetaFieldDef,
} from 'graphql';
import type { ObjMap } from 'graphql/jsutils/ObjMap.js';
import { appendToArray, emptyArray } from '../utilities/appendToArray.js';
import { applySkipIncludeDirectives } from '../utilities/applySkipIncludeDirectives.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';
import { memoize2 } from '../utilities/memoize2.js';
import { memoize3 } from '../utilities/memoize3.js';
import type { Subschema, SuperSchema } from './SuperSchema.ts';
export interface RootPlan {
  superSchema: SuperSchema;
  subschemaPlans: ReadonlyArray<SubschemaPlan>;
}
export interface SubschemaPlan {
  toSubschema: Subschema;
  fromSubschema: Subschema | undefined;
  fieldNodes: Array<FieldNode>;
  fieldTree: ObjMap<Map<GraphQLObjectType, FieldPlan>>;
}
export interface FieldPlan {
  superSchema: SuperSchema;
  subschemaPlans: ReadonlyArray<SubschemaPlan>;
  fieldTree: ObjMap<Map<GraphQLObjectType, FieldPlan>>;
}
interface MutableFieldPlan {
  superSchema: SuperSchema;
  subschemaPlans: Map<Subschema, SubschemaPlan>;
  fieldTree: ObjMap<Map<GraphQLObjectType, FieldPlan>>;
}
interface SelectionSplit {
  ownSelections: ReadonlyArray<SelectionNode>;
  otherSelections: ReadonlyArray<SelectionNode>;
}
const emptyObject = {};
export const createPlanner = memoize2(
  (superSchema: SuperSchema, operation: OperationDefinitionNode) =>
    new Planner(superSchema, operation),
);
/**
 * @internal
 */
export class Planner {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
  _createRootPlan = memoize2(this._createRootPlanImpl.bind(this));
  _createFieldPlan = memoize3(this._createFieldPlanImpl.bind(this));
  _collectSubFields = memoize2(this._collectSubFieldsImpl.bind(this));
  constructor(superSchema: SuperSchema, operation: OperationDefinitionNode) {
    this.superSchema = superSchema;
    this.operation = operation;
    this.variableDefinitions = operation.variableDefinitions ?? [];
  }
  createRootPlan(
    variableValues: {
      [key: string]: unknown;
    } = emptyObject,
  ): RootPlan | GraphQLError {
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
    return this._createRootPlan(rootType, fieldNodes);
  }
  _collectSubFieldsImpl(
    runtimeType: GraphQLObjectType,
    selections: ReadonlyArray<SelectionNode>,
    fieldNodes = emptyArray as ReadonlyArray<FieldNode>,
    visitedFragmentNames = new Set<string>(),
  ): ReadonlyArray<FieldNode> {
    let newFieldNodes: ReadonlyArray<FieldNode> = fieldNodes;
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
  _doesFragmentConditionMatch(
    schema: GraphQLSchema,
    fragment: FragmentDefinitionNode | InlineFragmentNode,
    type: GraphQLObjectType,
  ): boolean {
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
  _createRootPlanImpl(
    parentType: GraphQLCompositeType,
    fieldNodes: ReadonlyArray<FieldNode>,
  ): FieldPlan {
    const fieldPlan: MutableFieldPlan = {
      superSchema: this.superSchema,
      subschemaPlans: new Map<Subschema, SubschemaPlan>(),
      fieldTree: Object.create(null),
    };
    for (const fieldNode of fieldNodes) {
      this._addFieldToFieldPlan(fieldPlan, undefined, parentType, fieldNode);
    }
    return {
      superSchema: fieldPlan.superSchema,
      subschemaPlans: [...fieldPlan.subschemaPlans.values()],
      fieldTree: fieldPlan.fieldTree,
    };
  }
  _createFieldPlanImpl(
    parentType: GraphQLCompositeType,
    fieldNodes: ReadonlyArray<FieldNode>,
    fromSubschema: Subschema,
  ): FieldPlan {
    const fieldPlan: MutableFieldPlan = {
      superSchema: this.superSchema,
      subschemaPlans: new Map<Subschema, SubschemaPlan>(),
      fieldTree: Object.create(null),
    };
    for (const fieldNode of fieldNodes) {
      this._addFieldToFieldPlan(
        fieldPlan,
        fromSubschema,
        parentType,
        fieldNode,
      );
    }
    return {
      superSchema: fieldPlan.superSchema,
      subschemaPlans: [...fieldPlan.subschemaPlans.values()],
      fieldTree: fieldPlan.fieldTree,
    };
  }
  _addFieldToFieldPlan(
    fieldPlan: MutableFieldPlan,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemas = subschemaSetsByField[field.name.value];
    if (subschemas === undefined) {
      return;
    }
    const subschemaPlans = fieldPlan.subschemaPlans;
    if (!field.selectionSet) {
      const { subschemaPlan } = this._getSubschemaAndPlan(
        subschemas,
        subschemaPlans,
        fromSubschema,
      );
      subschemaPlan.fieldNodes = appendToArray(subschemaPlan.fieldNodes, field);
      return;
    }
    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);
    if (!fieldDef) {
      return;
    }
    const namedFieldType = getNamedType(fieldDef.type) as GraphQLObjectType;
    const subschema = this._getSubschema(subschemas, subschemaPlans);
    const selectionSplit = this._createSelectionSplit(
      namedFieldType,
      field.selectionSet.selections,
      subschema,
      fromSubschema,
    );
    const fieldPlansByType = this._createStitchPlan(
      namedFieldType,
      selectionSplit.otherSelections,
      subschema,
    );
    if (selectionSplit.ownSelections.length) {
      const subschemaPlan = this._getSubschemaPlan(
        subschema,
        subschemaPlans,
        fromSubschema,
      );
      const splitField: FieldNode = {
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: selectionSplit.ownSelections,
        },
      };
      subschemaPlan.fieldNodes = appendToArray(
        subschemaPlan.fieldNodes,
        splitField,
      );
      if (fieldPlansByType.size > 0) {
        const responseKey = field.alias?.value ?? field.name.value;
        if (subschema === fromSubschema) {
          fieldPlan.fieldTree[responseKey] = fieldPlansByType;
        } else {
          subschemaPlan.fieldTree[responseKey] = fieldPlansByType;
        }
      }
    } else if (fieldPlansByType.size > 0) {
      const responseKey = field.alias?.value ?? field.name.value;
      if (subschema === fromSubschema) {
        fieldPlan.fieldTree[responseKey] = fieldPlansByType;
      } else {
        const { subschemaPlan } = this._getSubschemaAndPlan(
          subschemas,
          subschemaPlans,
          fromSubschema,
        );
        subschemaPlan.fieldTree[responseKey] = fieldPlansByType;
      }
    }
  }
  _getSubschemaAndPlan(
    subschemas: Set<Subschema>,
    subschemaPlans: Map<Subschema, SubschemaPlan>,
    fromSubschema: Subschema | undefined,
  ): {
    subschema: Subschema;
    subschemaPlan: SubschemaPlan;
  } {
    for (const subschema of subschemas) {
      const subschemaPlan = subschemaPlans.get(subschema);
      if (subschemaPlan) {
        return { subschema, subschemaPlan };
      }
    }
    const subschema = subschemas.values().next().value as Subschema;
    const subschemaPlan: SubschemaPlan = {
      toSubschema: subschema,
      fromSubschema: fromSubschema as Subschema,
      fieldNodes: emptyArray as Array<FieldNode>,
      fieldTree: Object.create(null),
    };
    subschemaPlans.set(subschema, subschemaPlan);
    return { subschema, subschemaPlan };
  }
  _getSubschema(
    subschemas: Set<Subschema>,
    subschemaPlans: Map<Subschema, SubschemaPlan>,
  ): Subschema {
    for (const subschema of subschemas) {
      const subschemaPlan = subschemaPlans.get(subschema);
      if (subschemaPlan) {
        return subschema;
      }
    }
    return subschemas.values().next().value as Subschema;
  }
  _getSubschemaPlan(
    subschema: Subschema,
    subschemaPlans: Map<Subschema, SubschemaPlan>,
    fromSubschema: Subschema | undefined,
  ): SubschemaPlan {
    let subschemaPlan = subschemaPlans.get(subschema);
    if (subschemaPlan !== undefined) {
      return subschemaPlan;
    }
    subschemaPlan = {
      toSubschema: subschema,
      fromSubschema: fromSubschema as Subschema,
      fieldNodes: emptyArray as Array<FieldNode>,
      fieldTree: Object.create(null),
    };
    subschemaPlans.set(subschema, subschemaPlan);
    return subschemaPlan;
  }
  _createStitchPlan(
    parentType: GraphQLCompositeType,
    otherSelections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
  ): Map<GraphQLObjectType, FieldPlan> {
    const fieldPlansByType = new Map<GraphQLObjectType, FieldPlan>();
    let possibleTypes: ReadonlyArray<GraphQLObjectType>;
    if (isAbstractType(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }
    for (const type of possibleTypes) {
      const fieldNodes = this._collectSubFields(type, otherSelections);
      const fieldPlan = this._createFieldPlan(type, fieldNodes, subschema);
      if (
        fieldPlan.subschemaPlans.length > 0 ||
        Object.values(fieldPlan.fieldTree).length > 0
      ) {
        fieldPlansByType.set(type, fieldPlan);
      }
    }
    return fieldPlansByType;
  }
  _createSelectionSplit(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
  ): SelectionSplit {
    const selectionSplit: SelectionSplit = {
      ownSelections: emptyArray as ReadonlyArray<SelectionNode>,
      otherSelections: emptyArray as ReadonlyArray<SelectionNode>,
    };
    this._processSelectionsForSelectionSplit(
      selectionSplit,
      subschema,
      fromSubschema,
      parentType,
      selections,
    );
    if (
      fromSubschema === undefined &&
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
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): void {
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addFieldToSelectionSplit(
            selectionSplit,
            subschema,
            fromSubschema,
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
            fromSubschema,
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
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void {
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
    const subSelectionSplit: SelectionSplit = this._createSelectionSplit(
      getNamedType(fieldType) as GraphQLCompositeType,
      field.selectionSet.selections,
      subschema,
      fromSubschema,
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
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
  ): void {
    const fragmentSelectionSplit: SelectionSplit = {
      ownSelections: emptyArray as ReadonlyArray<SelectionNode>,
      otherSelections: emptyArray as ReadonlyArray<SelectionNode>,
    };
    this._processSelectionsForSelectionSplit(
      fragmentSelectionSplit,
      subschema,
      fromSubschema,
      parentType,
      fragment.selectionSet.selections,
    );
    if (fragmentSelectionSplit.ownSelections.length > 0) {
      const splitFragment: InlineFragmentNode = {
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
      const splitFragment: InlineFragmentNode = {
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
