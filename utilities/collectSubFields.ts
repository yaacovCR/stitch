import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLObjectType,
  GraphQLSchema,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import { isAbstractType, Kind, typeFromAST } from 'graphql';
import type { OperationContext } from '../stitch/SuperSchema';
import { appendToArray, emptyArray } from './appendToArray.ts';
export type FieldGroup = ReadonlyArray<FieldNode>;
export function collectSubFields(
  operationContext: OperationContext,
  runtimeType: GraphQLObjectType,
  selections: ReadonlyArray<SelectionNode>,
  fieldNodes = emptyArray as ReadonlyArray<FieldNode>,
  visitedFragmentNames = new Set<string>(),
): ReadonlyArray<FieldNode> {
  let newFieldNodes: ReadonlyArray<FieldNode> = fieldNodes;
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
function doesFragmentConditionMatch(
  schema: GraphQLSchema,
  fragment: FragmentDefinitionNode | InlineFragmentNode,
  type: GraphQLObjectType,
): boolean {
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
