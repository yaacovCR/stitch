import type {
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
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
import { AccumulatorMap } from '../utilities/AccumulatorMap.ts';
import { appendToArray, emptyArray } from '../utilities/appendToArray.ts';
import { inspect } from '../utilities/inspect.ts';
import { invariant } from '../utilities/invariant.ts';
import { memoize2 } from '../utilities/memoize2.ts';
import { memoize3 } from '../utilities/memoize3.ts';
import type { Subschema, SuperSchema } from './SuperSchema.ts';
export interface FieldPlan {
  selectionMap: ReadonlyMap<Subschema, Array<SelectionNode>>;
  stitchTrees: ObjMap<StitchTree>;
  fromSubschemas: ReadonlyArray<Subschema>;
  superSchema: SuperSchema;
}
interface SelectionSplit {
  subschema: Subschema;
  fromSubschemas: ReadonlyArray<Subschema>;
  ownSelections: ReadonlyArray<SelectionNode>;
  otherSelections: ReadonlyArray<SelectionNode>;
}
export interface StitchTree {
  ownSelections: ReadonlyArray<SelectionNode>;
  fieldPlans: Map<GraphQLObjectType, FieldPlan>;
  fromSubschemas: ReadonlyArray<Subschema>;
}
export interface MutableFieldPlan {
  selectionMap: AccumulatorMap<Subschema, SelectionNode>;
  stitchTrees: ObjMap<StitchTree>;
  fromSubschemas: ReadonlyArray<Subschema>;
  superSchema: SuperSchema;
}
/**
 * @internal
 */
export class Planner {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  fragments: Array<FragmentDefinitionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
  rootFieldPlan: FieldPlan | undefined;
  _createFieldPlan = memoize2(
    this._createFieldPlanFromSubschemasImpl.bind(this),
  );
  _createFieldPlanFromSubschemas = memoize3(
    (
      parentType: GraphQLCompositeType,
      selections: ReadonlyArray<SelectionNode>,
      fromSubschemas: ReadonlyArray<Subschema>,
    ) =>
      this._createFieldPlanFromSubschemasImpl(
        parentType,
        selections,
        fromSubschemas,
      ),
  );
  _collectSubFields = memoize2(this._collectSubFieldsImpl.bind(this));
  constructor(
    superSchema: SuperSchema,
    operation: OperationDefinitionNode,
    fragments: Array<FragmentDefinitionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
    variableDefinitions: ReadonlyArray<VariableDefinitionNode>,
  ) {
    this.superSchema = superSchema;
    this.operation = operation;
    this.fragments = fragments;
    this.fragmentMap = fragmentMap;
    this.variableDefinitions = variableDefinitions;
  }
  createRootFieldPlan(): FieldPlan | GraphQLError {
    if (this.rootFieldPlan !== undefined) {
      return this.rootFieldPlan;
    }
    const rootType = this.superSchema.getRootType(this.operation.operation);
    if (rootType === undefined) {
      return new GraphQLError(
        `Schema is not configured to execute ${this.operation.operation} operation.`,
        { nodes: this.operation },
      );
    }
    this.rootFieldPlan = this._createFieldPlan(
      rootType,
      this.operation.selectionSet.selections,
    );
    return this.rootFieldPlan;
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
          newFieldNodes = appendToArray(fieldNodes, selection);
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
            fieldNodes,
            visitedFragmentNames,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          const fragName = selection.name.value;
          if (visitedFragmentNames.has(fragName)) {
            continue;
          }
          const fragment = this.fragmentMap[fragName];
          if (
            fragment == null ||
            !this._doesFragmentConditionMatch(schema, fragment, runtimeType)
          ) {
            continue;
          }
          visitedFragmentNames.add(fragName);
          newFieldNodes = this._collectSubFieldsImpl(
            runtimeType,
            fragment.selectionSet.selections,
            fieldNodes,
            visitedFragmentNames,
          );
          break;
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
  _createFieldPlanFromSubschemasImpl(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fromSubschemas: ReadonlyArray<Subschema> = emptyArray as ReadonlyArray<Subschema>,
  ): FieldPlan {
    const fieldPlan = {
      selectionMap: new AccumulatorMap<Subschema, SelectionNode>(),
      stitchTrees: Object.create(null),
      fromSubschemas,
      superSchema: this.superSchema,
    };
    this._processSelectionsForFieldPlan(
      fieldPlan,
      parentType,
      selections,
      new Set<string>(),
    );
    return fieldPlan;
  }
  _processSelectionsForFieldPlan(
    fieldPlan: MutableFieldPlan,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void {
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addFieldToFieldPlan(fieldPlan, parentType, selection);
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
          this._addFragmentToFieldPlan(
            fieldPlan,
            refinedType,
            selection,
            selection.selectionSet.selections,
            visitedFragments,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          const fragmentName = selection.name.value;
          if (visitedFragments.has(fragmentName)) {
            continue;
          }
          visitedFragments.add(fragmentName);
          const fragment = this.fragmentMap[fragmentName];
          const typeName = fragment.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.superSchema.getType(typeName)
              : parentType;
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
          this._addFragmentToFieldPlan(
            fieldPlan,
            refinedType,
            selection,
            fragment.selectionSet.selections,
            visitedFragments,
          );
          break;
        }
      }
    }
  }
  _addFieldToFieldPlan(
    fieldPlan: MutableFieldPlan,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void {
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
    const fieldType = fieldDef.type;
    const stitchTree = this._createStitchTree(
      getNamedType(fieldType) as GraphQLObjectType,
      field.selectionSet.selections,
      subschema,
      fieldPlan.fromSubschemas,
    );
    if (stitchTree.ownSelections.length) {
      selectionMap.add(subschema, {
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: stitchTree.ownSelections,
        },
      });
    }
    if (stitchTree.fieldPlans.size > 0) {
      const responseKey = field.alias?.value ?? field.name.value;
      fieldPlan.stitchTrees[responseKey] = stitchTree;
    }
  }
  _getSubschema(
    subschemas: Set<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): Subschema {
    let selections: Array<SelectionNode> | undefined;
    for (const subschema of subschemas) {
      selections = selectionMap.get(subschema);
      if (selections) {
        return subschema;
      }
    }
    return subschemas.values().next().value as Subschema;
  }
  _addFragmentToFieldPlan(
    fieldPlan: MutableFieldPlan,
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void {
    const fragmentFieldPlan = {
      selectionMap: new AccumulatorMap<Subschema, SelectionNode>(),
      stitchTrees: fieldPlan.stitchTrees,
      fromSubschemas: fieldPlan.fromSubschemas,
      superSchema: fieldPlan.superSchema,
    };
    this._processSelectionsForFieldPlan(
      fragmentFieldPlan,
      parentType,
      selections,
      visitedFragments,
    );
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentFieldPlan.selectionMap) {
      const splitFragment: InlineFragmentNode = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      fieldPlan.selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
  _createStitchTree(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
  ): StitchTree {
    const selectionSplit = this._createSelectionSplit(
      parentType,
      selections,
      subschema,
      fromSubschemas,
    );
    const fieldPlans = new Map<GraphQLObjectType, FieldPlan>();
    let possibleTypes: ReadonlyArray<GraphQLObjectType>;
    if (isAbstractType(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }
    for (const type of possibleTypes) {
      const fieldNodes = this._collectSubFields(
        type,
        selectionSplit.otherSelections,
      );
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
      ownSelections: selectionSplit.ownSelections,
      fieldPlans,
      fromSubschemas,
    };
  }
  _createSelectionSplit(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
  ): SelectionSplit {
    const selectionSplit: SelectionSplit = {
      subschema,
      ownSelections: emptyArray as ReadonlyArray<SelectionNode>,
      otherSelections: emptyArray as ReadonlyArray<SelectionNode>,
      fromSubschemas,
    };
    this._processSelectionsForSelectionSplit(
      selectionSplit,
      parentType,
      selections,
      new Set(),
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
    selectionSplit: SelectionSplit,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void {
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addFieldToSelectionSplit(selectionSplit, parentType, selection);
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
            refinedType,
            selection,
            selection.selectionSet.selections,
            visitedFragments,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          const fragmentName = selection.name.value;
          if (visitedFragments.has(fragmentName)) {
            continue;
          }
          visitedFragments.add(fragmentName);
          const fragment = this.fragmentMap[fragmentName];
          const typeName = fragment.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.superSchema.getType(typeName)
              : parentType;
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
          this._addFragmentToSelectionSplit(
            selectionSplit,
            refinedType,
            selection,
            fragment.selectionSet.selections,
            visitedFragments,
          );
          break;
        }
      }
    }
  }
  _addFieldToSelectionSplit(
    selectionSplit: SelectionSplit,
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
      if (subschemaSet.has(selectionSplit.subschema)) {
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
      selectionSplit.subschema,
      selectionSplit.fromSubschemas,
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
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void {
    const fragmentSelectionSplit: SelectionSplit = {
      subschema: selectionSplit.subschema,
      ownSelections: emptyArray as ReadonlyArray<SelectionNode>,
      otherSelections: emptyArray as ReadonlyArray<SelectionNode>,
      fromSubschemas: selectionSplit.fromSubschemas,
    };
    this._processSelectionsForSelectionSplit(
      fragmentSelectionSplit,
      parentType,
      selections,
      visitedFragments,
    );
    if (fragmentSelectionSplit.ownSelections.length > 0) {
      const splitFragment: InlineFragmentNode = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
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
        ...node,
        kind: Kind.INLINE_FRAGMENT,
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
