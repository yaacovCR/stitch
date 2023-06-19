import type {
  FieldNode,
  FragmentSpreadNode,
  GraphQLCompositeType,
  GraphQLField,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { SubFieldPlan } from './SubFieldPlan.js';
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
  selectionMap: Map<Subschema, Array<SelectionNode>>;
  subFieldPlans: ObjMap<SubFieldPlan>;
  visitedFragments: Set<string>;
  constructor(
    operationContext: OperationContext,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  );
  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): AccumulatorMap<Subschema, SelectionNode>;
  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
  _getSubschema(
    subschemas: Set<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): Subschema;
  _getFieldDef(
    parentType: GraphQLCompositeType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined;
  _addFragment(
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
}
