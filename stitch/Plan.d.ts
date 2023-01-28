import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap';
import type { Subschema, SuperSchema } from './SuperSchema';
export interface SubPlan {
  type: GraphQLOutputType;
  selectionsBySubschema: Map<Subschema, Array<SelectionNode>>;
}
/**
 * @internal
 */
export declare class Plan {
  superSchema: SuperSchema;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  map: Map<Subschema, Array<SelectionNode>>;
  subPlans: ObjMap<SubPlan>;
  constructor(
    superSchema: SuperSchema,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
  );
  _splitSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    path: Array<string>,
  ): Map<Subschema, Array<SelectionNode>>;
  _addField(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    field: FieldNode,
    map: Map<Subschema, Array<SelectionNode>>,
    path: Array<string>,
  ): void;
  _getSubschemaAndSelections(
    subschemas: ReadonlyArray<Subschema>,
    map: Map<Subschema, Array<SelectionNode>>,
  ): {
    subschema: Subschema;
    selections: Array<SelectionNode>;
  };
  _getFieldDef(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined;
  _addInlineFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
    map: Map<Subschema, Array<SelectionNode>>,
    path: Array<string>,
  ): void;
}
