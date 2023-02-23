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
import { UniqueId } from '../utilities/UniqueId.js';
import type { Subschema, SuperSchema } from './SuperSchema';
/**
 * @internal
 */
export declare class Plan {
  superSchema: SuperSchema;
  parentType: GraphQLCompositeType;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  map: Map<Subschema, Array<SelectionNode>>;
  subPlans: ObjMap<Plan>;
  uniqueId: UniqueId;
  constructor(
    superSchema: SuperSchema,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
  );
  _splitSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): Map<Subschema, Array<SelectionNode>>;
  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    map: Map<Subschema, Array<SelectionNode>>,
  ): void;
  _getSubschemaAndSelections(
    subschemas: ReadonlyArray<Subschema>,
    map: Map<Subschema, Array<SelectionNode>>,
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
    map: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
  _addSplitFragments(
    fragment: InlineFragmentNode,
    splitSelections: Map<Subschema, Array<SelectionNode>>,
    map: AccumulatorMap<Subschema, SelectionNode>,
  ): void;
  _addModifiedSplitFragments(
    fragment: InlineFragmentNode,
    splitSelections: Map<Subschema, Array<SelectionNode>>,
    map: AccumulatorMap<Subschema, SelectionNode>,
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
