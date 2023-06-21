import type { FieldNode, GraphQLObjectType, SelectionNode } from 'graphql';
import type { OperationContext } from '../stitch/SuperSchema';
export type FieldGroup = ReadonlyArray<FieldNode>;
export declare function collectSubFields(
  operationContext: OperationContext,
  runtimeType: GraphQLObjectType,
  selections: ReadonlyArray<SelectionNode>,
  fieldNodes?: readonly FieldNode[],
  visitedFragmentNames?: Set<string>,
): ReadonlyArray<FieldNode>;
