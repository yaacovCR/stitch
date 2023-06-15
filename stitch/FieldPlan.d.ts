import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
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
  selectionMap: Map<Subschema, Array<SelectionNode>>;
  subFieldPlans: ObjMap<FieldPlan>;
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
  _getSubschemaAndSelections(
    subschemas: Set<Subschema>,
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
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
  _addFragmentSelectionMap(
    fragmentSelectionMap: Map<Subschema, Array<SelectionNode>>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
  print(indent?: number): string;
  _printMap(indent: number): string;
  _printSubschemaSelections(
    subschema: Subschema,
    selections: ReadonlyArray<SelectionNode>,
    indent: number,
  ): string;
  _printSubFieldPlans(
    subFieldPlans: ReadonlyArray<[string, FieldPlan]>,
    indent: number,
  ): string;
  _printSubFieldPlan(
    responseKey: string,
    subFieldPlan: FieldPlan,
    indent: number,
  ): string;
  _printSelectionSet(selectionSet: SelectionSetNode, indent: number): string;
}
