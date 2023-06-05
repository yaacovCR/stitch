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
import type { Subschema, SuperSchema } from './SuperSchema';
interface SelectionMetadata {
  selectionMap: AccumulatorMap<Subschema, SelectionNode>;
}
/**
 * @internal
 */
export declare class Plan {
  superSchema: SuperSchema;
  parentType: GraphQLCompositeType;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  selectionMap: Map<Subschema, Array<SelectionNode>>;
  subPlans: ObjMap<Plan>;
  constructor(
    superSchema: SuperSchema,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
  );
  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): SelectionMetadata;
  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    selectionMetadata: SelectionMetadata,
  ): void;
  _getSubschemaAndSelections(
    subschemas: ReadonlyArray<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): {
    subschema: Subschema;
    selections: Array<SelectionNode>;
  };
  _getFieldDef(
    parentType: GraphQLCompositeType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined;
  _addInlineFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
    selectionMetadata: SelectionMetadata,
  ): void;
  _addFragmentSelectionMap(
    fragment: InlineFragmentNode,
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
  _printSubPlans(
    subPlans: ReadonlyArray<[string, Plan]>,
    indent: number,
  ): string;
  _printSubPlan(responseKey: string, subPlan: Plan, indent: number): string;
  _printSelectionSet(selectionSet: SelectionSetNode, indent: number): string;
}
export {};
