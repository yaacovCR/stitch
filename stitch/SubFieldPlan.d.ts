import type {
  FieldNode,
  FragmentSpreadNode,
  GraphQLCompositeType,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { FieldPlan } from './FieldPlan.js';
import type {
  OperationContext,
  Subschema,
  SuperSchema,
} from './SuperSchema.js';
/**
 * @internal
 */
export declare class SubFieldPlan {
  operationContext: OperationContext;
  superSchema: SuperSchema;
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
  _addFragment(
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    ownSelections: Array<SelectionNode>,
    otherSelections: Array<SelectionNode>,
  ): void;
}
