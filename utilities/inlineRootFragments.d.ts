import type { FragmentDefinitionNode, SelectionNode } from 'graphql';
import type { ObjMap } from '../types/ObjMap';
export declare function inlineRootFragments(
  selections: ReadonlyArray<SelectionNode>,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments?: Set<string>,
): Array<SelectionNode>;
