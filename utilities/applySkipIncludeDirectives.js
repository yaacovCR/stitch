'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.applySkipIncludeDirectives = void 0;
const graphql_1 = require('graphql');
const appendToArray_js_1 = require('./appendToArray.js');
const memoize2_js_1 = require('./memoize2.js');
const updateNode_js_1 = require('./updateNode.js');
const visitWithMemo_js_1 = require('./visitWithMemo.js');
/**
 * Function that applies the @skip and @include directives to a given OperationDefinitionNode or FragmentDefinitionNode.
 */
exports.applySkipIncludeDirectives = (0, memoize2_js_1.memoize2)(
  _applySkipIncludeDirectives,
);
function _applySkipIncludeDirectives(node, variableValues) {
  return (0, visitWithMemo_js_1.visitWithMemo)(
    node,
    {
      [graphql_1.Kind.FIELD]: (fieldNode) =>
        applyDirectivesToSelection(fieldNode, variableValues),
      [graphql_1.Kind.FRAGMENT_SPREAD]: (spreadNode) =>
        applyDirectivesToSelection(spreadNode, variableValues),
      [graphql_1.Kind.INLINE_FRAGMENT]: (spreadNode) =>
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
function applyDirectivesToSelection(node, variableValues) {
  const directives = node.directives;
  if (directives === undefined) {
    return node;
  }
  let newDirectives = appendToArray_js_1.emptyArray;
  for (const directive of directives) {
    const directiveName = directive.name.value;
    if (directiveName === 'skip') {
      const directiveValues = (0, graphql_1.getArgumentValues)(
        graphql_1.GraphQLSkipDirective,
        directive,
        variableValues,
      );
      if (directiveValues.if === true) {
        return null;
      }
    } else if (directiveName === 'include') {
      const directiveValues = (0, graphql_1.getArgumentValues)(
        graphql_1.GraphQLIncludeDirective,
        directive,
        variableValues,
      );
      if (directiveValues.if === false) {
        return null;
      }
    }
    newDirectives = (0, appendToArray_js_1.appendToArray)(
      newDirectives,
      directive,
    );
  }
  return (0, updateNode_js_1.updateNode)(node, 'directives', newDirectives);
}
