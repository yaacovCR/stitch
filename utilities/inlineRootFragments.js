'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inlineRootFragments = void 0;
const graphql_1 = require('graphql');
function inlineRootFragments(
  selections,
  fragmentMap,
  visitedFragments = new Set(),
) {
  const newSelections = [];
  for (const selection of selections) {
    switch (selection.kind) {
      case graphql_1.Kind.FIELD:
        newSelections.push(selection);
        break;
      case graphql_1.Kind.INLINE_FRAGMENT:
        newSelections.push({
          ...selection,
          selectionSet: {
            kind: graphql_1.Kind.SELECTION_SET,
            selections: inlineRootFragments(
              selection.selectionSet.selections,
              fragmentMap,
              visitedFragments,
            ),
          },
        });
        break;
      case graphql_1.Kind.FRAGMENT_SPREAD: {
        if (visitedFragments.has(selection.name.value)) {
          continue;
        }
        visitedFragments.add(selection.name.value);
        const fragment = fragmentMap[selection.name.value];
        if (fragment !== undefined) {
          newSelections.push({
            kind: graphql_1.Kind.INLINE_FRAGMENT,
            directives: selection.directives,
            typeCondition: fragment.typeCondition,
            selectionSet: {
              kind: graphql_1.Kind.SELECTION_SET,
              selections: inlineRootFragments(
                fragment.selectionSet.selections,
                fragmentMap,
                visitedFragments,
              ),
            },
          });
        }
      }
    }
  }
  return newSelections;
}
exports.inlineRootFragments = inlineRootFragments;
