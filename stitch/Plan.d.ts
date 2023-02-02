import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap';
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
    map: Map<Subschema, Array<SelectionNode>>,
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
