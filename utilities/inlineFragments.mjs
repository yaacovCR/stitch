import { Kind } from 'graphql';
import { appendToArray, emptyArray } from './appendToArray.mjs';
import { memoize2 } from './memoize2.mjs';
import { updateNode } from './updateNode.mjs';
import { visitWithMemo } from './visitWithMemo.mjs';
/**
 * Function that converts all Fragment Spread Nodes to Inline Fragment Nodes.
 */
export const inlineFragments = memoize2(_inlineFragments);
function _inlineFragments(node, fragments) {
  const fragmentMap = Object.create(null);
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
  selectionSet,
  fragmentMap,
  visitedFragments = new Set(),
) {
  return updateNode(
    selectionSet,
    'selections',
    processSelections(selectionSet.selections, fragmentMap, visitedFragments),
  );
}
function processSelections(fragmentSelections, fragmentMap, visitedFragments) {
  let newSelections = emptyArray;
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
function processSelection(selection, fragmentMap, visitedFragments) {
  if (
    selection.kind === Kind.FIELD ||
    selection.kind === Kind.INLINE_FRAGMENT
  ) {
    return selection;
  }
  return toInlineFragment(selection, fragmentMap, visitedFragments);
}
function toInlineFragment(spreadNode, fragmentMap, visitedFragments) {
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
  return newNode;
}
