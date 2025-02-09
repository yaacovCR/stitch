import { getArgumentValues, GraphQLIncludeDirective, GraphQLSkipDirective, Kind, } from 'graphql';
import { appendToArray, emptyArray } from "./appendToArray.mjs";
import { memoize2 } from "./memoize2.mjs";
import { updateNode } from "./updateNode.mjs";
import { visitWithMemo } from "./visitWithMemo.mjs";
/**
 * Function that applies the @skip and @include directives to a given OperationDefinitionNode or FragmentDefinitionNode.
 */
export const applySkipIncludeDirectives = memoize2(_applySkipIncludeDirectives);
function _applySkipIncludeDirectives(node, variableValues) {
    return visitWithMemo(node, {
        [Kind.FIELD]: (fieldNode) => applyDirectivesToSelection(fieldNode, variableValues),
        [Kind.FRAGMENT_SPREAD]: (spreadNode) => applyDirectivesToSelection(spreadNode, variableValues),
        [Kind.INLINE_FRAGMENT]: (spreadNode) => applyDirectivesToSelection(spreadNode, variableValues),
    }, {
        OperationDefinition: ['selectionSet'],
        SelectionSet: ['selections'],
        Field: ['selectionSet'],
        InlineFragment: ['selectionSet'],
        FragmentDefinition: ['selectionSet'],
    });
}
function applyDirectivesToSelection(node, variableValues) {
    const directives = node.directives;
    if (directives === undefined) {
        return node;
    }
    let newDirectives = emptyArray;
    for (const directive of directives) {
        const directiveName = directive.name.value;
        if (directiveName === 'skip') {
            const directiveValues = getArgumentValues(GraphQLSkipDirective, directive, variableValues);
            if (directiveValues.if === true) {
                return null;
            }
        }
        else if (directiveName === 'include') {
            const directiveValues = getArgumentValues(GraphQLIncludeDirective, directive, variableValues);
            if (directiveValues.if === false) {
                return null;
            }
        }
        newDirectives = appendToArray(newDirectives, directive);
    }
    return updateNode(node, 'directives', newDirectives);
}
