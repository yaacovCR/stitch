import type { SelectionSetNode } from 'graphql';
import { Kind, parse } from 'graphql';

export function parseSelectionSet(source: string): SelectionSetNode {
  const document = parse(source, { noLocation: true });
  const firstDefinition = document.definitions[0];
  if (firstDefinition.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('Must provide valid selection set.');
  }
  return firstDefinition.selectionSet;
}
