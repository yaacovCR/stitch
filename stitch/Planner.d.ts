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
import { GraphQLError } from 'graphql';
import type { ObjMap } from 'graphql/jsutils/ObjMap.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';
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
export declare class Planner {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  fragments: Array<FragmentDefinitionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
  rootFieldPlan: FieldPlan | undefined;
  _createFieldPlan: (
    a1: GraphQLCompositeType,
    a2: readonly SelectionNode[],
  ) => FieldPlan;
  _createFieldPlanFromSubschemas: (
    a1: GraphQLCompositeType,
    a2: readonly SelectionNode[],
    a3: readonly Subschema[],
  ) => FieldPlan;
  _collectSubFields: (
    a1: GraphQLObjectType<any, any>,
    a2: readonly SelectionNode[],
  ) => readonly FieldNode[];
  constructor(
    superSchema: SuperSchema,
    operation: OperationDefinitionNode,
    fragments: Array<FragmentDefinitionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
    variableDefinitions: ReadonlyArray<VariableDefinitionNode>,
  );
  createRootFieldPlan(): FieldPlan | GraphQLError;
  _collectSubFieldsImpl(
    runtimeType: GraphQLObjectType,
    selections: ReadonlyArray<SelectionNode>,
    fieldNodes?: readonly FieldNode[],
    visitedFragmentNames?: Set<string>,
  ): ReadonlyArray<FieldNode>;
  /**
   * Determines if a fragment is applicable to the given type.
   */
  _doesFragmentConditionMatch(
    schema: GraphQLSchema,
    fragment: FragmentDefinitionNode | InlineFragmentNode,
    type: GraphQLObjectType,
  ): boolean;
  _createFieldPlanFromSubschemasImpl(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fromSubschemas?: ReadonlyArray<Subschema>,
  ): FieldPlan;
  _processSelectionsForFieldPlan(
    fieldPlan: MutableFieldPlan,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void;
  _addFieldToFieldPlan(
    fieldPlan: MutableFieldPlan,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void;
  _getSubschema(
    subschemas: Set<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): Subschema;
  _addFragmentToFieldPlan(
    fieldPlan: MutableFieldPlan,
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void;
  _createStitchTree(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
  ): StitchTree;
  _createSelectionSplit(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
  ): SelectionSplit;
  _processSelectionsForSelectionSplit(
    selectionSplit: SelectionSplit,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void;
  _addFieldToSelectionSplit(
    selectionSplit: SelectionSplit,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void;
  _addFragmentToSelectionSplit(
    selectionSplit: SelectionSplit,
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    visitedFragments: Set<string>,
  ): void;
}
export {};
