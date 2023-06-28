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
import type { Subschema, SuperSchema } from './SuperSchema.js';
export interface FieldPlan {
  superSchema: SuperSchema;
  subschemaPlans: Map<Subschema, SubschemaPlan>;
  stitchTrees: ObjMap<StitchTree>;
}
export interface SubschemaPlan {
  fromSubschema: Subschema | undefined;
  fieldNodes: Array<FieldNode>;
  stitchTrees: ObjMap<StitchTree>;
}
interface SelectionSplit {
  ownSelections: ReadonlyArray<SelectionNode>;
  otherSelections: ReadonlyArray<SelectionNode>;
}
export interface StitchTree {
  fieldPlans: Map<GraphQLObjectType, FieldPlan>;
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
  _createSupplementalFieldPlan: (
    a1: GraphQLCompositeType,
    a2: readonly FieldNode[],
    a3: Subschema,
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
  _createFieldPlanImpl(
    parentType: GraphQLCompositeType,
    fieldNodes: ReadonlyArray<FieldNode>,
  ): FieldPlan;
  _createSupplementalFieldPlanImpl(
    parentType: GraphQLCompositeType,
    fieldNodes: ReadonlyArray<FieldNode>,
    fromSubschema: Subschema,
  ): FieldPlan;
  _addFieldToFieldPlan(
    fieldPlan: FieldPlan,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void;
  _getSubschemaAndPlan(
    subschemas: Set<Subschema>,
    subschemaPlans: Map<Subschema, SubschemaPlan>,
    fromSubschema: Subschema | undefined,
  ): {
    subschema: Subschema;
    subschemaPlan: SubschemaPlan;
  };
  _getSubschema(
    subschemas: Set<Subschema>,
    subschemaPlans: Map<Subschema, SubschemaPlan>,
  ): Subschema;
  _getSubschemaPlan(
    subschema: Subschema,
    subschemaPlans: Map<Subschema, SubschemaPlan>,
    fromSubschema: Subschema | undefined,
  ): SubschemaPlan;
  _createStitchTree(
    parentType: GraphQLCompositeType,
    otherSelections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
  ): StitchTree;
  _createSelectionSplit(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
  ): SelectionSplit;
  _processSelectionsForSelectionSplit(
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): void;
  _addFieldToSelectionSplit(
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    field: FieldNode,
  ): void;
  _addFragmentToSelectionSplit(
    selectionSplit: SelectionSplit,
    subschema: Subschema,
    fromSubschema: Subschema | undefined,
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
  ): void;
}
export {};
