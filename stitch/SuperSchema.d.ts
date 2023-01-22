import type {
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  OperationTypeNode,
  TypeNode,
  VariableDefinitionNode,
} from 'graphql';
import { GraphQLError, GraphQLList, GraphQLNonNull } from 'graphql';
import type { ObjMap } from '../types/ObjMap';
type CoercedVariableValues =
  | {
      errors: ReadonlyArray<GraphQLError>;
      coerced?: never;
    }
  | {
      coerced: {
        [variable: string]: unknown;
      };
      errors?: never;
    };
/**
 * @internal
 */
export declare class SuperSchema {
  schemas: ReadonlyArray<GraphQLSchema>;
  rootTypes: ObjMap<GraphQLObjectType | null | undefined>;
  typeMap: ObjMap<GraphQLNamedType>;
  constructor(schemas: ReadonlyArray<GraphQLSchema>);
  getRootType(operation: OperationTypeNode): GraphQLObjectType | undefined;
  getType(name: string): GraphQLNamedType | undefined;
  /**
   * Prepares an object map of variableValues of the correct type based on the
   * provided variable definitions and arbitrary input. If the input cannot be
   * parsed to match the variable definitions, a GraphQLError will be thrown.
   *
   * Note: The returned value is a plain Object with a prototype, since it is
   * exposed to user code. Care should be taken to not pull values from the
   * Object prototype.
   */
  getVariableValues(
    varDefNodes: ReadonlyArray<VariableDefinitionNode>,
    inputs: {
      readonly [variable: string]: unknown;
    },
    options?: {
      maxErrors?: number;
    },
  ): CoercedVariableValues;
  /**
   * Given a Schema and an AST node describing a type, return a GraphQLType
   * definition which applies to that type. For example, if provided the parsed
   * AST node for `[User]`, a GraphQLList instance will be returned, containing
   * the type called "User" found in the schema. If a type called "User" is not
   * found in the schema, then undefined will be returned.
   */
  _typeFromAST(typeNode: NamedTypeNode): GraphQLNamedType | undefined;
  _typeFromAST(typeNode: ListTypeNode): GraphQLList<any> | undefined;
  _typeFromAST(typeNode: NonNullTypeNode): GraphQLNonNull<any> | undefined;
  _typeFromAST(typeNode: TypeNode): GraphQLType | undefined;
  _coerceVariableValues(
    varDefNodes: ReadonlyArray<VariableDefinitionNode>,
    inputs: {
      readonly [variable: string]: unknown;
    },
    onError: (error: GraphQLError) => void,
  ): {
    [variable: string]: unknown;
  };
}
export {};
