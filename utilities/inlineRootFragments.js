'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inlineRootFragments = void 0;
const graphql_1 = require('graphql');
function inlineRootFragments(
  selectionSet,
  fragmentMap,
  visitedFragments = new Set(),
) {
  const selections = [];
  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case graphql_1.Kind.FIELD:
        selections.push(selection);
        break;
      case graphql_1.Kind.INLINE_FRAGMENT:
        selections.push({
          ...selection,
          selectionSet: inlineRootFragments(
            selection.selectionSet,
            fragmentMap,
            visitedFragments,
          ),
        });
        break;
      case graphql_1.Kind.FRAGMENT_SPREAD: {
        if (visitedFragments.has(selection.name.value)) {
          continue;
        }
        visitedFragments.add(selection.name.value);
        const fragment = fragmentMap[selection.name.value];
        if (fragment) {
          selections.push({
            kind: graphql_1.Kind.INLINE_FRAGMENT,
            directives: selection.directives,
            typeCondition: fragment.typeCondition,
            selectionSet: inlineRootFragments(
              fragment.selectionSet,
              fragmentMap,
              visitedFragments,
            ),
          });
        }
      }
    }
  }
  return {
    kind: graphql_1.Kind.SELECTION_SET,
    selections,
  };
}
exports.inlineRootFragments = inlineRootFragments;
