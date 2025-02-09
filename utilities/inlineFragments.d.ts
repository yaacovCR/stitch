import type { FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
/**
 * Function that converts all Fragment Spread Nodes to Inline Fragment Nodes.
 */
export declare const inlineFragments: <T extends OperationDefinitionNode | FragmentDefinitionNode>(a1: T, a2: readonly FragmentDefinitionNode[]) => T;
