import type { ConstValueNode, DirectiveLocation, DocumentNode, ExecutionResult, GraphQLAbstractType, GraphQLArgument, GraphQLArgumentConfig, GraphQLCompositeType, GraphQLEnumValue, GraphQLEnumValueConfig, GraphQLEnumValueConfigMap, GraphQLField, GraphQLFieldConfig, GraphQLFieldConfigMap, GraphQLInputField, GraphQLInputFieldConfig, GraphQLInputFieldConfigMap, GraphQLInputType, GraphQLNamedType, GraphQLOutputType, GraphQLType, ListTypeNode, NamedTypeNode, NonNullTypeNode, TypeNode, VariableDefinitionNode } from 'graphql';
import { GraphQLDirective, GraphQLEnumType, GraphQLError, GraphQLInputObjectType, GraphQLInterfaceType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLScalarType, GraphQLSchema, GraphQLUnionType, OperationTypeNode } from 'graphql';
import type { ObjMap, ReadOnlyObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';
export type Executor = (args: {
    document: DocumentNode;
    variables?: {
        readonly [variable: string]: unknown;
    } | undefined;
}) => PromiseOrValue<ExecutionResult>;
export type Subscriber = (args: {
    document: DocumentNode;
    variables?: {
        readonly [variable: string]: unknown;
    } | undefined;
}) => PromiseOrValue<ExecutionResult | SimpleAsyncGenerator<ExecutionResult>>;
export interface Subschema {
    schema: GraphQLSchema;
    executor: Executor;
    subscriber?: Subscriber;
}
export interface VariableValues {
    readonly sources: ReadOnlyObjMap<VariableValueSource>;
    readonly coerced: ReadOnlyObjMap<unknown>;
}
interface VariableValueSource {
    readonly signature: GraphQLVariableSignature;
    readonly value?: unknown;
}
export interface GraphQLVariableSignature {
    name: string;
    type: GraphQLInputType;
    defaultValue?: never;
    default: {
        literal: ConstValueNode;
    } | undefined;
}
type VariableValuesOrErrors = {
    variableValues: VariableValues;
    errors?: never;
} | {
    errors: ReadonlyArray<GraphQLError>;
    variableValues?: never;
};
/**
 * @internal
 */
export declare class SuperSchema {
    subschemas: ReadonlyArray<Subschema>;
    subschemaIds: Map<Subschema, string>;
    subschemaSetsByTypeAndField: ObjMap<ObjMap<Set<Subschema>>>;
    mergedRootTypes: ObjMap<GraphQLObjectType>;
    mergedTypes: ObjMap<GraphQLNamedType>;
    mergedDirectives: ObjMap<GraphQLDirective>;
    mergedSchema: GraphQLSchema;
    constructor(subschemas: ReadonlyArray<Subschema>);
    _createMergedElements(subschemas: ReadonlyArray<Subschema>): void;
    _addToSubschemaSets(subschema: Subschema, name: string, type: GraphQLCompositeType): void;
    _mergeScalarTypes(originalTypes: ReadonlyArray<GraphQLScalarType>): GraphQLScalarType;
    _mergeObjectTypes(originalTypes: ReadonlyArray<GraphQLObjectType>): GraphQLObjectType;
    _mergeInterfaceTypes(originalTypes: ReadonlyArray<GraphQLInterfaceType>): GraphQLInterfaceType;
    _mergeUnionTypes(originalTypes: ReadonlyArray<GraphQLUnionType>): GraphQLUnionType;
    _mergeInputObjectTypes(originalTypes: ReadonlyArray<GraphQLInputObjectType>): GraphQLInputObjectType;
    _mergeEnumTypes(originalTypes: ReadonlyArray<GraphQLEnumType>): GraphQLEnumType;
    _mergeDirectives(originalDirectives: ReadonlyArray<GraphQLDirective>): GraphQLDirective;
    _getMergedFieldMap(originalTypes: ReadonlyArray<GraphQLObjectType | GraphQLInterfaceType>): GraphQLFieldConfigMap<unknown, unknown>;
    _fieldToFieldConfig(field: GraphQLField<unknown, unknown>): GraphQLFieldConfig<unknown, unknown>;
    _argToArgConfig(arg: GraphQLArgument): GraphQLArgumentConfig;
    _getMergedInterfaces(originalTypes: ReadonlyArray<GraphQLObjectType | GraphQLInterfaceType>): Array<GraphQLInterfaceType>;
    _getMergedMemberTypes(originalTypes: ReadonlyArray<GraphQLUnionType>): Array<GraphQLObjectType>;
    _getMergedInputFieldMap(originalTypes: ReadonlyArray<GraphQLInputObjectType>): GraphQLInputFieldConfigMap;
    _inputFieldToInputFieldConfig(inputField: GraphQLInputField): GraphQLInputFieldConfig;
    _mergeEnumValueMaps(originalTypes: ReadonlyArray<GraphQLEnumType>): GraphQLEnumValueConfigMap;
    _enumValueToEnumValueConfig(value: GraphQLEnumValue): GraphQLEnumValueConfig;
    _mergeDirectiveLocations(originalDirectives: ReadonlyArray<GraphQLDirective>): Array<DirectiveLocation>;
    _getMergedType(type: GraphQLOutputType): GraphQLOutputType;
    _getMergedType(type: GraphQLInputType): GraphQLInputType;
    _getMergedType(type: GraphQLType): GraphQLType;
    getFieldDef(parentType: GraphQLCompositeType, fieldName: string): GraphQLField | undefined;
    getPossibleTypes(abstractType: GraphQLAbstractType): ReadonlyArray<GraphQLObjectType>;
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
    getVariableValues(varDefNodes: ReadonlyArray<VariableDefinitionNode>, inputs: {
        readonly [variable: string]: unknown;
    }, options?: {
        maxErrors?: number;
    }): VariableValuesOrErrors;
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
    _coerceVariableValues(varDefNodes: ReadonlyArray<VariableDefinitionNode>, inputs: {
        readonly [variable: string]: unknown;
    }, onError: (error: GraphQLError) => void, hideSuggestions?: boolean): VariableValues;
    _getVariableSignature(varDefNode: VariableDefinitionNode): GraphQLVariableSignature | GraphQLError;
    getSubschemaId(subschema: Subschema): string;
}
export {};
