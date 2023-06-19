import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { FieldPlan } from './FieldPlan.js';
import type { OperationContext, Subschema } from './SuperSchema.js';
/**
 * @internal
 */
export declare class SubFieldPlan {
  operationContext: OperationContext;
  parentType: GraphQLCompositeType;
  ownSelections: ReadonlyArray<SelectionNode>;
  otherSelections: ReadonlyArray<SelectionNode>;
  fieldPlans: Map<GraphQLObjectType, FieldPlan>;
  visitedFragments: Set<string>;
  subschema: Subschema;
  subFieldPlans: ObjMap<SubFieldPlan>;
  constructor(
    operationContext: OperationContext,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
  );
  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): {
    ownSelections: Array<SelectionNode>;
    otherSelections: Array<SelectionNode>;
  };
  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    ownSelections: Array<SelectionNode>,
    otherSelections: Array<SelectionNode>,
  ): void;
  _getFieldDef(
    parentType: GraphQLCompositeType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined;
  _addFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode | FragmentDefinitionNode,
    ownSelections: Array<SelectionNode>,
    otherSelections: Array<SelectionNode>,
  ): void;
}
