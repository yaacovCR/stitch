import { isAbstractType, Kind, typeFromAST } from 'graphql';
import { appendToArray, emptyArray } from './appendToArray.mjs';
export function collectSubFields(
  operationContext,
  runtimeType,
  selections,
  fieldNodes = emptyArray,
  visitedFragmentNames = new Set(),
) {
  let newFieldNodes = fieldNodes;
  const schema = operationContext.superSchema.mergedSchema;
  const fragmentMap = operationContext.fragmentMap;
  for (const selection of selections) {
    switch (selection.kind) {
      case Kind.FIELD: {
        newFieldNodes = appendToArray(fieldNodes, selection);
        break;
      }
      case Kind.INLINE_FRAGMENT: {
        if (
          !doesFragmentConditionMatch(
            operationContext.superSchema.mergedSchema,
            selection,
            runtimeType,
          )
        ) {
          continue;
        }
        newFieldNodes = collectSubFields(
          operationContext,
          runtimeType,
          selection.selectionSet.selections,
          fieldNodes,
          visitedFragmentNames,
        );
        break;
      }
      case Kind.FRAGMENT_SPREAD: {
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
        newFieldNodes = collectSubFields(
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
  return newFieldNodes;
}
/**
 * Determines if a fragment is applicable to the given type.
 */
function doesFragmentConditionMatch(schema, fragment, type) {
  const typeConditionNode = fragment.typeCondition;
  if (!typeConditionNode) {
    return true;
  }
  const conditionalType = typeFromAST(schema, typeConditionNode);
  if (conditionalType === type) {
    return true;
  }
  if (isAbstractType(conditionalType)) {
    return schema.isSubType(conditionalType, type);
  }
  return false;
}
