import type { FragmentDefinitionNode, SelectionNode } from 'graphql';
import { Kind } from 'graphql';
import type { ObjMap } from '../types/ObjMap';
import { memoize2 } from './memoize2.ts';
function _inlineRootFragments(
  selections: ReadonlyArray<SelectionNode>,
  fragmentMap: ObjMap<FragmentDefinitionNode>,
  visitedFragments = new Set<string>(),
): Array<SelectionNode> {
  const newSelections: Array<SelectionNode> = [];
  for (const selection of selections) {
    switch (selection.kind) {
      case Kind.FIELD:
        newSelections.push(selection);
        break;
      case Kind.INLINE_FRAGMENT:
        newSelections.push({
          ...selection,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: _inlineRootFragments(
              selection.selectionSet.selections,
              fragmentMap,
              visitedFragments,
            ),
          },
        });
        break;
      case Kind.FRAGMENT_SPREAD: {
        if (visitedFragments.has(selection.name.value)) {
          continue;
        }
        visitedFragments.add(selection.name.value);
        const fragment = fragmentMap[selection.name.value];
        if (fragment !== undefined) {
          newSelections.push({
            kind: Kind.INLINE_FRAGMENT,
            directives: selection.directives,
            typeCondition: fragment.typeCondition,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: _inlineRootFragments(
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
export const inlineRootFragments = memoize2(_inlineRootFragments);
