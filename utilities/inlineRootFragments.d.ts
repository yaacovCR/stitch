import type { FragmentDefinitionNode, SelectionNode } from 'graphql';
import type { ObjMap } from '../types/ObjMap';
export declare const inlineRootFragments: (
  a1: readonly SelectionNode[],
  a2: ObjMap<FragmentDefinitionNode>,
) => SelectionNode[];
