import { Kind } from 'graphql';
export function inlineRootFragments(
  selectionSet,
  fragmentMap,
  visitedFragments = new Set(),
) {
  const selections = [];
  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD:
        selections.push(selection);
        break;
      case Kind.INLINE_FRAGMENT:
        selections.push({
          ...selection,
          selectionSet: inlineRootFragments(
            selection.selectionSet,
            fragmentMap,
            visitedFragments,
          ),
        });
        break;
      case Kind.FRAGMENT_SPREAD: {
        if (visitedFragments.has(selection.name.value)) {
          continue;
        }
        visitedFragments.add(selection.name.value);
        const fragment = fragmentMap[selection.name.value];
        if (fragment) {
          selections.push({
            kind: Kind.INLINE_FRAGMENT,
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
    kind: Kind.SELECTION_SET,
    selections,
  };
}
