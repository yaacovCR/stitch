import type {
  FragmentDefinitionNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import { Kind } from 'graphql';
import type { ObjMap } from '../types/ObjMap.ts';
import { appendToArray, emptyArray } from './appendToArray.ts';
import { memoize2 } from './memoize2.ts';
import { updateNode } from './updateNode.ts';
import { visitWithMemo } from './visitWithMemo.ts';
/**
 * Function that converts all Fragment Spread Nodes to Inline Fragment Nodes.
 */
export const inlineFragments = memoize2(_inlineFragments);
function _inlineFragments<
  T extends OperationDefinitionNode | FragmentDefinitionNode,
>(node: T, fragments: ReadonlyArray<FragmentDefinitionNode>): T {
  const fragmentMap: ObjMap<FragmentDefinitionNode> = Object.create(null);
  for (const fragment of fragments) {
    fragmentMap[fragment.name.value] = fragment;
  }
  return visitWithMemo(
    node,
    {
      [Kind.SELECTION_SET]: (selectionSetNode) =>
        processSelectionSet(selectionSetNode, fragmentMap),
    },
    {
      OperationDefinition: ['selectionSet'],
      SelectionSet: ['selections'],
      Field: ['selectionSet'],
      InlineFragment: ['selectionSet'],
    },
  );
}
function processSelectionSet(
  selectionSet: SelectionSetNode,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments = new Set<string>(),
): SelectionSetNode {
  return updateNode(
    selectionSet,
    'selections',
    processSelections(selectionSet.selections, fragmentMap, visitedFragments),
  );
}
function processSelections(
  fragmentSelections: ReadonlyArray<SelectionNode>,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments: Set<string>,
): ReadonlyArray<SelectionNode> {
  let newSelections = emptyArray as ReadonlyArray<SelectionNode>;
  for (const selection of fragmentSelections) {
    const newSelection = processSelection(
      selection,
      fragmentMap,
      visitedFragments,
    );
    if (newSelection !== null) {
      newSelections = appendToArray(newSelections, newSelection);
    }
  }
  return newSelections;
}
function processSelection(
  selection: SelectionNode,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments: Set<string>,
): SelectionNode | null {
  if (
    selection.kind === Kind.FIELD ||
    selection.kind === Kind.INLINE_FRAGMENT
  ) {
    return selection;
  }
  return toInlineFragment(selection, fragmentMap, visitedFragments);
}
function toInlineFragment(
  spreadNode: FragmentSpreadNode,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments: Set<string>,
): InlineFragmentNode | null {
  const fragmentName = spreadNode.name.value;
  const fragment = fragmentMap[fragmentName];
  if (fragment === undefined) {
    return null;
  }
  if (visitedFragments.has(fragmentName)) {
    return null;
  }
  visitedFragments.add(fragmentName);
  let newNode = updateNode(spreadNode, 'kind', Kind.INLINE_FRAGMENT);
  newNode = updateNode(newNode, 'name', null);
  newNode = updateNode(newNode, 'typeCondition', fragment.typeCondition);
  newNode = updateNode(
    newNode,
    'selectionSet',
    processSelectionSet(fragment.selectionSet, fragmentMap, visitedFragments),
  );
  return newNode as unknown as InlineFragmentNode;
}
