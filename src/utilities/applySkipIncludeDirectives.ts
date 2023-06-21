import type {
  ASTNode,
  DirectiveNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  OperationDefinitionNode,
} from 'graphql';
import {
  getArgumentValues,
  GraphQLIncludeDirective,
  GraphQLSkipDirective,
  Kind,
} from 'graphql';

import { appendToArray, emptyArray } from './appendToArray.js';
import { memoize2 } from './memoize2.js';
import { updateNode } from './updateNode.js';
import { visitWithMemo } from './visitWithMemo.js';

/**
 * Function that applies the @skip and @include directives to a given OperationDefinitionNode or FragmentDefinitionNode.
 */
export const applySkipIncludeDirectives = memoize2(_applySkipIncludeDirectives);

function _applySkipIncludeDirectives<
  T extends OperationDefinitionNode | FragmentDefinitionNode,
>(node: T, variableValues: { [key: string]: unknown }): T {
  return visitWithMemo(
    node,
    {
      [Kind.FIELD]: (fieldNode) =>
        applyDirectivesToSelection(fieldNode, variableValues),
      [Kind.FRAGMENT_SPREAD]: (spreadNode) =>
        applyDirectivesToSelection(spreadNode, variableValues),
      [Kind.INLINE_FRAGMENT]: (spreadNode) =>
        applyDirectivesToSelection(spreadNode, variableValues),
    },
    {
      OperationDefinition: ['selectionSet'],
      SelectionSet: ['selections'],
      Field: ['selectionSet'],
      InlineFragment: ['selectionSet'],
      FragmentDefinition: ['selectionSet'],
    },
  );
}

function applyDirectivesToSelection(
  node: FieldNode | FragmentSpreadNode | InlineFragmentNode,
  variableValues: { [key: string]: unknown },
): ASTNode | null {
  const directives: ReadonlyArray<DirectiveNode> | undefined = node.directives;

  if (directives === undefined) {
    return node;
  }

  let newDirectives = emptyArray as ReadonlyArray<DirectiveNode>;

  for (const directive of directives) {
    const directiveName = directive.name.value;
    if (directiveName === 'skip') {
      const directiveValues = getArgumentValues(
        GraphQLSkipDirective,
        directive,
        variableValues,
      );
      if (directiveValues.if === true) {
        return null;
      }
    } else if (directiveName === 'include') {
      const directiveValues = getArgumentValues(
        GraphQLIncludeDirective,
        directive,
        variableValues,
      );
      if (directiveValues.if === false) {
        return null;
      }
    }
    newDirectives = appendToArray(newDirectives, directive);
  }

  return updateNode(node, 'directives', newDirectives);
}
