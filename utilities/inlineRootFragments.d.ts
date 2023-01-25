import type { FragmentDefinitionNode, SelectionSetNode } from 'graphql';
import type { ObjMap } from '../types/ObjMap';
export declare function inlineRootFragments(
  selectionSet: SelectionSetNode,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments?: Set<string>,
): SelectionSetNode;
