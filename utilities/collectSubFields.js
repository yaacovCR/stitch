'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.collectSubFields = void 0;
const graphql_1 = require('graphql');
const appendToArray_js_1 = require('./appendToArray.js');
function collectSubFields(
  operationContext,
  runtimeType,
  selections,
  fieldNodes = appendToArray_js_1.emptyArray,
  visitedFragmentNames = new Set(),
) {
  const schema = operationContext.superSchema.mergedSchema;
  const fragmentMap = operationContext.fragmentMap;
  for (const selection of selections) {
    switch (selection.kind) {
      case graphql_1.Kind.FIELD: {
        // eslint-disable-next-line no-param-reassign
        fieldNodes = (0, appendToArray_js_1.appendToArray)(
          fieldNodes,
          selection,
        );
        break;
      }
      case graphql_1.Kind.INLINE_FRAGMENT: {
        if (
          !doesFragmentConditionMatch(
            operationContext.superSchema.mergedSchema,
            selection,
            runtimeType,
          )
        ) {
          continue;
        }
        collectSubFields(
          operationContext,
          runtimeType,
          selections,
          fieldNodes,
          visitedFragmentNames,
        );
        break;
      }
      case graphql_1.Kind.FRAGMENT_SPREAD: {
        const fragName = selection.name.value;
        if (visitedFragmentNames.has(fragName)) {
          continue;
        }
        const fragment = fragmentMap[fragName];
        if (
          fragment == null ||
          !doesFragmentConditionMatch(schema, fragment, runtimeType)
        ) {
          continue;
        }
        visitedFragmentNames.add(fragName);
        collectSubFields(
          operationContext,
          runtimeType,
          fragment.selectionSet.selections,
          fieldNodes,
          visitedFragmentNames,
        );
        break;
      }
    }
  }
  return fieldNodes;
}
exports.collectSubFields = collectSubFields;
/**
 * Determines if a fragment is applicable to the given type.
 */
function doesFragmentConditionMatch(schema, fragment, type) {
  const typeConditionNode = fragment.typeCondition;
  if (!typeConditionNode) {
    return true;
  }
  const conditionalType = (0, graphql_1.typeFromAST)(schema, typeConditionNode);
  if (conditionalType === type) {
    return true;
  }
  if ((0, graphql_1.isAbstractType)(conditionalType)) {
    return schema.isSubType(conditionalType, type);
  }
  return false;
}
