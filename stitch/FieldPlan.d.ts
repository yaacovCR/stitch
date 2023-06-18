import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import type { OperationContext, Subschema } from './SuperSchema.js';
export declare const createFieldPlan: (
  a1: OperationContext,
  a2: GraphQLCompositeType,
  a3: readonly SelectionNode[],
) => FieldPlan;
/**
 * @internal
 */
export declare class FieldPlan {
  operationContext: OperationContext;
  parentType: GraphQLCompositeType;
  ownSelections: ReadonlyArray<SelectionNode>;
  selectionMap: Map<Subschema, Array<SelectionNode>>;
  subFieldPlans: ObjMap<FieldPlan>;
  visitedFragments: Set<string>;
  subschema: Subschema | undefined;
  constructor(
    operationContext: OperationContext,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema?: Subschema | undefined,
  );
  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): {
    ownSelections: Array<SelectionNode>;
    selectionMap: AccumulatorMap<Subschema, SelectionNode>;
  };
  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    ownSelections: Array<SelectionNode>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
  _getSubschemaAndSelections(
    subschemas: Set<Subschema>,
    ownSelections: Array<SelectionNode>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): {
    subschema: Subschema;
    selections: Array<SelectionNode>;
  };
  _getFieldDef(
    parentType: GraphQLCompositeType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined;
  _addFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode | FragmentDefinitionNode,
    ownSelections: Array<SelectionNode>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
}
