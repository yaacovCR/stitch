import type {
  DirectiveLocation,
  GraphQLArgument,
  GraphQLArgumentConfig,
  GraphQLEnumValue,
  GraphQLEnumValueConfig,
  GraphQLEnumValueConfigMap,
  GraphQLField,
  GraphQLFieldConfig,
  GraphQLFieldConfigMap,
  GraphQLInputField,
  GraphQLInputFieldConfig,
  GraphQLInputFieldConfigMap,
  GraphQLInputType,
  GraphQLNamedType,
  GraphQLOutputType,
  GraphQLType,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  TypeNode,
  VariableDefinitionNode,
} from 'graphql';
import {
  GraphQLDirective,
  GraphQLEnumType,
  GraphQLError,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  OperationTypeNode,
} from 'graphql';
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
  mergedRootTypes: ObjMap<GraphQLObjectType>;
  mergedTypes: ObjMap<GraphQLNamedType>;
  mergedDirectives: ObjMap<GraphQLDirective>;
  mergeSchema: GraphQLSchema;
  constructor(schemas: ReadonlyArray<GraphQLSchema>);
  _createMergedElements(): void;
  _mergeScalarTypes(
    originalTypes: ReadonlyArray<GraphQLScalarType>,
  ): GraphQLScalarType;
  _mergeObjectTypes(
    originalTypes: ReadonlyArray<GraphQLObjectType>,
  ): GraphQLObjectType;
  _mergeInterfaceTypes(
    originalTypes: ReadonlyArray<GraphQLInterfaceType>,
  ): GraphQLInterfaceType;
  _mergeUnionTypes(
    originalTypes: ReadonlyArray<GraphQLUnionType>,
  ): GraphQLUnionType;
  _mergeInputObjectTypes(
    originalTypes: ReadonlyArray<GraphQLInputObjectType>,
  ): GraphQLInputObjectType;
  _mergeEnumTypes(
    originalTypes: ReadonlyArray<GraphQLEnumType>,
  ): GraphQLEnumType;
  _mergeDirectives(
    originalDirectives: ReadonlyArray<GraphQLDirective>,
  ): GraphQLDirective;
  _getMergedFieldMap(
    originalTypes: ReadonlyArray<GraphQLObjectType | GraphQLInterfaceType>,
  ): GraphQLFieldConfigMap<unknown, unknown>;
  _fieldToFieldConfig(
    field: GraphQLField<unknown, unknown>,
  ): GraphQLFieldConfig<unknown, unknown>;
  _argToArgConfig(arg: GraphQLArgument): GraphQLArgumentConfig;
  _getMergedInterfaces(
    originalTypes: ReadonlyArray<GraphQLObjectType>,
  ): Array<GraphQLInterfaceType>;
  _getMergedMemberTypes(
    originalTypes: ReadonlyArray<GraphQLUnionType>,
  ): Array<GraphQLObjectType>;
  _getMergedInputFieldMap(
    originalTypes: ReadonlyArray<GraphQLInputObjectType>,
  ): GraphQLInputFieldConfigMap;
  _inputFieldToInputFieldConfig(
    inputField: GraphQLInputField,
  ): GraphQLInputFieldConfig;
  _mergeEnumValueMaps(
    originalTypes: ReadonlyArray<GraphQLEnumType>,
  ): GraphQLEnumValueConfigMap;
  _enumValueToEnumValueConfig(value: GraphQLEnumValue): GraphQLEnumValueConfig;
  _mergeDirectiveLocations(
    originalDirectives: ReadonlyArray<GraphQLDirective>,
  ): Array<DirectiveLocation>;
  _getMergedType(type: GraphQLOutputType): GraphQLOutputType;
  _getMergedType(type: GraphQLInputType): GraphQLInputType;
  _getMergedType(type: GraphQLType): GraphQLType;
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
