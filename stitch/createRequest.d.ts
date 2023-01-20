import type {
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from 'graphql';
export declare function createRequest(
  operation: OperationDefinitionNode,
  fragments: Array<FragmentDefinitionNode>,
): DocumentNode;
