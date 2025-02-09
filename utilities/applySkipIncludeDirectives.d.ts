import type { FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
import type { VariableValues } from '../stitch/SuperSchema.js';
/**
 * Function that applies the @skip and @include directives to a given OperationDefinitionNode or FragmentDefinitionNode.
 */
export declare const applySkipIncludeDirectives: <T extends OperationDefinitionNode | FragmentDefinitionNode>(a1: T, a2: VariableValues) => T;
