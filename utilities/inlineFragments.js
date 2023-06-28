'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inlineFragments = void 0;
const graphql_1 = require('graphql');
const appendToArray_js_1 = require('./appendToArray.js');
const memoize2_js_1 = require('./memoize2.js');
const updateNode_js_1 = require('./updateNode.js');
const visitWithMemo_js_1 = require('./visitWithMemo.js');
/**
 * Function that converts all Fragment Spread Nodes to Inline Fragment Nodes.
 */
exports.inlineFragments = (0, memoize2_js_1.memoize2)(_inlineFragments);
function _inlineFragments(node, fragments) {
  const fragmentMap = Object.create(null);
  for (const fragment of fragments) {
    fragmentMap[fragment.name.value] = fragment;
  }
  return (0, visitWithMemo_js_1.visitWithMemo)(
    node,
    {
      [graphql_1.Kind.SELECTION_SET]: (selectionSetNode) =>
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
  return (0, updateNode_js_1.updateNode)(
    selectionSet,
    'selections',
    processSelections(selectionSet.selections, fragmentMap, visitedFragments),
  );
}
function processSelections(fragmentSelections, fragmentMap, visitedFragments) {
  let newSelections = appendToArray_js_1.emptyArray;
  for (const selection of fragmentSelections) {
    const newSelection = processSelection(
      selection,
      fragmentMap,
      visitedFragments,
    );
    if (newSelection !== null) {
      newSelections = (0, appendToArray_js_1.appendToArray)(
        newSelections,
        newSelection,
      );
    }
  }
  return newSelections;
}
function processSelection(selection, fragmentMap, visitedFragments) {
  if (
    selection.kind === graphql_1.Kind.FIELD ||
    selection.kind === graphql_1.Kind.INLINE_FRAGMENT
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
  let newNode = (0, updateNode_js_1.updateNode)(
    spreadNode,
    'kind',
    graphql_1.Kind.INLINE_FRAGMENT,
  );
  newNode = (0, updateNode_js_1.updateNode)(newNode, 'name', null);
  newNode = (0, updateNode_js_1.updateNode)(
    newNode,
    'typeCondition',
    fragment.typeCondition,
  );
  newNode = (0, updateNode_js_1.updateNode)(
    newNode,
    'selectionSet',
    processSelectionSet(fragment.selectionSet, fragmentMap, visitedFragments),
  );
  return newNode;
}
