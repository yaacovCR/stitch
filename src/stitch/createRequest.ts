import type {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from 'graphql';
import { Kind } from 'graphql';

export function createRequest(
  operation: OperationDefinitionNode,
  fragments: Array<FragmentDefinitionNode>,
) {
  const document: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [operation, ...fragments],
  };

  return document;
}
