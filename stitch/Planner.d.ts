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
import { GraphQLError } from 'graphql';
import type { ObjMap } from 'graphql/jsutils/ObjMap.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';
export interface FieldPlan {
  superSchema: SuperSchema;
  selectionMap: ReadonlyMap<Subschema, Array<SelectionNode>>;
  stitchTrees: ObjMap<StitchTree>;
}
interface SelectionSplit {
  ownSelections: ReadonlyArray<SelectionNode>;
  otherSelections: ReadonlyArray<SelectionNode>;
}
export interface StitchTree {
  fieldPlans: Map<GraphQLObjectType, FieldPlan>;
  fromSubschemas: ReadonlyArray<Subschema>;
}
export interface MutableFieldPlan {
  selectionMap: AccumulatorMap<Subschema, SelectionNode>;
  stitchTrees: ObjMap<StitchTree>;
  superSchema: SuperSchema;
}
export declare const createPlanner: (
  a1: SuperSchema,
  a2: OperationDefinitionNode,
) => Planner;
/**
 * @internal
 */
export declare class Planner {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
  _createFieldPlan: (
    a1: GraphQLCompositeType,
    a2: readonly FieldNode[],
  ) => FieldPlan;
  _createFieldPlanFromSubschemas: (
    a1: GraphQLCompositeType,
    a2: readonly FieldNode[],
    a3: readonly Subschema[],
  ) => FieldPlan;
  _collectSubFields: (
    a1: GraphQLObjectType<any, any>,
    a2: readonly SelectionNode[],
  ) => readonly FieldNode[];
  constructor(superSchema: SuperSchema, operation: OperationDefinitionNode);
  createRootFieldPlan(variableValues?: {
    [key: string]: unknown;
  }): FieldPlan | GraphQLError;
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
    fieldNodes: ReadonlyArray<FieldNode>,
    fromSubschemas?: ReadonlyArray<Subschema>,
  ): FieldPlan;
  _addFieldToFieldPlan(
    fieldPlan: MutableFieldPlan,
    fromSubschemas: ReadonlyArray<Subschema>,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void;
  _getSubschema(
    subschemas: Set<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): Subschema;
  _createStitchTree(
    parentType: GraphQLCompositeType,
    otherSelections: ReadonlyArray<SelectionNode>,
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
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): void;
  _addFieldToSelectionSplit(
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void;
  _addFragmentToSelectionSplit(
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschemas: ReadonlyArray<Subschema>,
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
  ): void;
}
export {};
