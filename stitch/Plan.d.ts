import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
  ValueNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import type { Subschema, SuperSchema } from './SuperSchema';
interface SelectionMetadata {
  selectionMap: AccumulatorMap<Subschema, SelectionNode>;
  deferredSubschemas: Set<Subschema>;
}
/**
 * @internal
 */
export declare class Plan {
  superSchema: SuperSchema;
  parentType: GraphQLCompositeType;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  selectionMap: Map<Subschema, Array<SelectionNode>>;
  deferredSubschemas: Set<Subschema>;
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
  _addModifiedFragmentSelectionMap(
    fragment: InlineFragmentNode,
    fragmentSelectionMap: Map<Subschema, Array<SelectionNode>>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
    toSelections: (
      originalSelections: ReadonlyArray<SelectionNode>,
    ) => Array<SelectionNode>,
  ): void;
  _addIdentifier(
    selections: ReadonlyArray<SelectionNode>,
    identifier: string,
    includeIf: ValueNode | undefined,
  ): Array<SelectionNode>;
  print(indent?: number): string;
  _printMap(indent: number): string;
  _printDeferredSubschemas(indent: number): string;
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
