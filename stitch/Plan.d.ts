import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap';
import type { OperationContext, Subschema, SuperSchema } from './SuperSchema';
export interface SubPlan {
  type: GraphQLOutputType;
  selectionsBySubschema: Map<Subschema, Array<SelectionNode>>;
}
export interface SubschemaPlan {
  document: DocumentNode;
  subPlans: ObjMap<SubPlan>;
}
/**
 * @internal
 */
export declare class Plan {
  superSchema: SuperSchema;
  operationContext: OperationContext;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  map: Map<Subschema, SubschemaPlan>;
  constructor(superSchema: SuperSchema, operationContext: OperationContext);
  _splitSelectionSet(
    parentType: GraphQLCompositeType,
    selectionSet: SelectionSetNode,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): Map<Subschema, Array<SelectionNode>>;
  _addField(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    field: FieldNode,
    map: Map<Subschema, Array<SelectionNode>>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): void;
  _getFieldDef(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined;
  _addInlineFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
    map: Map<Subschema, Array<SelectionNode>>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): void;
}
