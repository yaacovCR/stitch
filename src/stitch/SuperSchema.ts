import type {
  DirectiveLocation,
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  GraphQLArgument,
  GraphQLArgumentConfig,
  GraphQLCompositeType,
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
  OperationDefinitionNode,
  TypeNode,
  VariableDefinitionNode,
} from 'graphql';
import {
  coerceInputValue,
  execute,
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
  isCompositeType,
  isInputType,
  isListType,
  isNonNullType,
  isSpecifiedScalarType,
  isUnionType,
  Kind,
  OperationTypeNode,
  print,
  valueFromAST,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap';
import type { PromiseOrValue } from '../types/PromiseOrValue';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inspect } from '../utilities/inspect.js';
import { printPathArray } from '../utilities/printPathArray.js';

export interface OperationContext {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  fragments: Array<FragmentDefinitionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
}

export interface ExecutionContext {
  operationContext: OperationContext;
  rawVariableValues: { readonly [variable: string]: unknown } | undefined;
  coercedVariableValues: { [variable: string]: unknown };
}

type CoercedVariableValues =
  | { errors: ReadonlyArray<GraphQLError>; coerced?: never }
  | { coerced: { [variable: string]: unknown }; errors?: never };

const operations = [
  OperationTypeNode.QUERY,
  OperationTypeNode.MUTATION,
  OperationTypeNode.SUBSCRIPTION,
];

export type Executor = (args: {
  document: DocumentNode;
  variables?: { readonly [variable: string]: unknown } | undefined;
}) => PromiseOrValue<ExecutionResult>;

export type Subscriber = (args: {
  document: DocumentNode;
  variables?: { readonly [variable: string]: unknown } | undefined;
}) => PromiseOrValue<ExecutionResult | SimpleAsyncGenerator<ExecutionResult>>;

export interface Subschema {
  schema: GraphQLSchema;
  executor: Executor;
  subscriber?: Subscriber;
}

/**
 * @internal
 */
export class SuperSchema {
  subschemas: ReadonlyArray<Subschema>;
  subschemaIds: Map<Subschema, string>;
  subschemaSetsByTypeAndField: ObjMap<ObjMap<Set<Subschema>>>;
  mergedRootTypes: ObjMap<GraphQLObjectType>;
  mergedTypes: ObjMap<GraphQLNamedType>;
  mergedDirectives: ObjMap<GraphQLDirective>;
  mergedSchema: GraphQLSchema;

  constructor(subschemas: ReadonlyArray<Subschema>) {
    this.subschemaIds = new Map();
    this.subschemaSetsByTypeAndField = Object.create(null);
    this.mergedRootTypes = Object.create(null);
    this.mergedTypes = Object.create(null);
    this.mergedDirectives = Object.create(null);

    this._createMergedElements(subschemas);

    this.mergedSchema = new GraphQLSchema({
      query: this.mergedRootTypes[OperationTypeNode.QUERY],
      mutation: this.mergedRootTypes[OperationTypeNode.MUTATION],
      subscription: this.mergedRootTypes[OperationTypeNode.SUBSCRIPTION],
      types: Object.values(this.mergedTypes),
      directives: Object.values(this.mergedDirectives),
    });

    const queryType = this.mergedSchema.getQueryType();
    if (!queryType) {
      this.subschemas = subschemas;
      return;
    }

    const introspectionSubschema: Subschema = {
      schema: this.mergedSchema,
      executor: (args) =>
        execute({
          ...args,
          schema: this.mergedSchema,
        }),
    };
    for (const [name, type] of Object.entries(this.mergedSchema.getTypeMap())) {
      if (!name.startsWith('__')) {
        continue;
      }
      if (isCompositeType(type)) {
        this._addToSubschemaSets(introspectionSubschema, name, type);
      }
    }
    const subSchemaSetsByField =
      this.subschemaSetsByTypeAndField[queryType.name];
    subSchemaSetsByField.__schema = new Set([introspectionSubschema]);
    subSchemaSetsByField.__type = new Set([introspectionSubschema]);
    this.subschemas = [introspectionSubschema, ...subschemas];
  }

  _createMergedElements(subschemas: ReadonlyArray<Subschema>): void {
    const originalRootTypes = new AccumulatorMap<
      OperationTypeNode,
      GraphQLObjectType
    >();
    const originalTypes = new AccumulatorMap<string, GraphQLNamedType>();
    const originalDirectives = new AccumulatorMap<string, GraphQLDirective>();

    for (const subschema of subschemas) {
      const schema = subschema.schema;

      for (const [name, type] of Object.entries(schema.getTypeMap())) {
        if (name.startsWith('__')) {
          continue;
        }

        originalTypes.add(name, type);

        if (isCompositeType(type)) {
          this._addToSubschemaSets(subschema, name, type);
        }
      }

      for (const operation of operations) {
        const rootType = schema.getRootType(operation);
        if (rootType) {
          originalRootTypes.add(operation, rootType);
        }
      }

      for (const directive of schema.getDirectives()) {
        const name = directive.name;
        originalDirectives.add(name, directive);
      }
    }

    for (const [typeName, types] of originalTypes) {
      const firstType = types[0];

      if (firstType instanceof GraphQLScalarType) {
        if (isSpecifiedScalarType(firstType)) {
          this.mergedTypes[typeName] = firstType;
          continue;
        }

        this.mergedTypes[typeName] = this._mergeScalarTypes(
          types as Array<GraphQLScalarType>,
        );
      } else if (firstType instanceof GraphQLObjectType) {
        this.mergedTypes[typeName] = this._mergeObjectTypes(
          types as Array<GraphQLObjectType>,
        );
      } else if (firstType instanceof GraphQLInterfaceType) {
        this.mergedTypes[typeName] = this._mergeInterfaceTypes(
          types as Array<GraphQLInterfaceType>,
        );
      } else if (firstType instanceof GraphQLUnionType) {
        this.mergedTypes[typeName] = this._mergeUnionTypes(
          types as Array<GraphQLUnionType>,
        );
      } else if (firstType instanceof GraphQLInputObjectType) {
        this.mergedTypes[typeName] = this._mergeInputObjectTypes(
          types as Array<GraphQLInputObjectType>,
        );
      } else if (firstType instanceof GraphQLEnumType) {
        this.mergedTypes[typeName] = this._mergeEnumTypes(
          types as Array<GraphQLEnumType>,
        );
      }
    }

    for (const [operation, rootTypes] of originalRootTypes) {
      this.mergedRootTypes[operation] = this.getType(
        rootTypes[0].name,
      ) as GraphQLObjectType;
    }

    for (const [directiveName, directives] of originalDirectives) {
      this.mergedDirectives[directiveName] = this._mergeDirectives(directives);
    }
  }

  _addToSubschemaSets(
    subschema: Subschema,
    name: string,
    type: GraphQLCompositeType,
  ): void {
    let subschemaSetsByField = this.subschemaSetsByTypeAndField[name];
    if (subschemaSetsByField === undefined) {
      subschemaSetsByField = Object.create(null);
      this.subschemaSetsByTypeAndField[name] = subschemaSetsByField;
    }

    let typenameSubschemaSet = subschemaSetsByField.__typename;
    if (typenameSubschemaSet === undefined) {
      typenameSubschemaSet = new Set();
      subschemaSetsByField.__typename = typenameSubschemaSet;
    }
    typenameSubschemaSet.add(subschema);

    if (isUnionType(type)) {
      return;
    }

    for (const fieldName of Object.keys(type.getFields())) {
      let subschemaSet = subschemaSetsByField[fieldName];
      if (subschemaSet === undefined) {
        subschemaSet = new Set();
        subschemaSetsByField[fieldName] = subschemaSet;
      }
      subschemaSet.add(subschema);
    }
  }

  _mergeScalarTypes(
    originalTypes: ReadonlyArray<GraphQLScalarType>,
  ): GraphQLScalarType {
    const firstType = originalTypes[0];
    return new GraphQLScalarType({
      name: firstType.name,
      description: firstType.description,
    });
  }

  _mergeObjectTypes(
    originalTypes: ReadonlyArray<GraphQLObjectType>,
  ): GraphQLObjectType {
    const firstType = originalTypes[0];
    return new GraphQLObjectType({
      name: firstType.name,
      description: firstType.description,
      fields: () => this._getMergedFieldMap(originalTypes),
      interfaces: () => this._getMergedInterfaces(originalTypes),
    });
  }

  _mergeInterfaceTypes(
    originalTypes: ReadonlyArray<GraphQLInterfaceType>,
  ): GraphQLInterfaceType {
    const firstType = originalTypes[0];
    return new GraphQLInterfaceType({
      name: firstType.name,
      description: firstType.description,
      fields: () => this._getMergedFieldMap(originalTypes),
      interfaces: () => this._getMergedInterfaces(originalTypes),
    });
  }

  _mergeUnionTypes(
    originalTypes: ReadonlyArray<GraphQLUnionType>,
  ): GraphQLUnionType {
    const firstType = originalTypes[0];
    return new GraphQLUnionType({
      name: firstType.name,
      description: firstType.description,
      types: () => this._getMergedMemberTypes(originalTypes),
    });
  }

  _mergeInputObjectTypes(
    originalTypes: ReadonlyArray<GraphQLInputObjectType>,
  ): GraphQLInputObjectType {
    const firstType = originalTypes[0];
    return new GraphQLInputObjectType({
      name: firstType.name,
      description: firstType.description,
      fields: () => this._getMergedInputFieldMap(originalTypes),
    });
  }

  _mergeEnumTypes(
    originalTypes: ReadonlyArray<GraphQLEnumType>,
  ): GraphQLEnumType {
    const firstType = originalTypes[0];
    return new GraphQLEnumType({
      name: firstType.name,
      description: firstType.description,
      values: this._mergeEnumValueMaps(originalTypes),
    });
  }

  _mergeDirectives(
    originalDirectives: ReadonlyArray<GraphQLDirective>,
  ): GraphQLDirective {
    const firstDirective = originalDirectives[0];

    const args = Object.create(null);

    const mergedDirective = new GraphQLDirective({
      name: firstDirective.name,
      description: firstDirective.description,
      locations: this._mergeDirectiveLocations(originalDirectives),
      args,
      isRepeatable: originalDirectives.some(
        (directive) => directive.isRepeatable,
      ),
    });

    for (const arg of mergedDirective.args) {
      args[arg.name] = this._argToArgConfig(arg);
    }

    return mergedDirective;
  }

  _getMergedFieldMap(
    originalTypes: ReadonlyArray<GraphQLObjectType | GraphQLInterfaceType>,
  ): GraphQLFieldConfigMap<unknown, unknown> {
    const fields = Object.create(null);
    for (const type of originalTypes) {
      for (const [fieldName, field] of Object.entries(type.getFields())) {
        if (fields[fieldName] !== undefined) {
          continue;
        }
        fields[fieldName] = this._fieldToFieldConfig(field);
      }
    }
    return fields;
  }

  _fieldToFieldConfig(
    field: GraphQLField<unknown, unknown>,
  ): GraphQLFieldConfig<unknown, unknown> {
    const args = Object.create(null);

    const fieldConfig: GraphQLFieldConfig<unknown, unknown> = {
      description: field.description,
      type: this._getMergedType(field.type),
      args,
      deprecationReason: field.deprecationReason,
    };

    for (const arg of field.args) {
      args[arg.name] = this._argToArgConfig(arg);
    }

    return fieldConfig;
  }

  _argToArgConfig(arg: GraphQLArgument): GraphQLArgumentConfig {
    return {
      description: arg.description,
      type: this._getMergedType(arg.type),
      defaultValue: arg.defaultValue,
      deprecationReason: arg.deprecationReason,
    };
  }

  _getMergedInterfaces(
    originalTypes: ReadonlyArray<GraphQLObjectType | GraphQLInterfaceType>,
  ): Array<GraphQLInterfaceType> {
    const interfaceMap = Object.create(null);
    for (const type of originalTypes) {
      for (const interfaceType of type.getInterfaces()) {
        if (interfaceMap[interfaceType.name] !== undefined) {
          continue;
        }
        interfaceMap[interfaceType.name] = this._getMergedType(interfaceType);
      }
    }
    return Object.values(interfaceMap);
  }

  _getMergedMemberTypes(
    originalTypes: ReadonlyArray<GraphQLUnionType>,
  ): Array<GraphQLObjectType> {
    const memberMap = Object.create(null);
    for (const unionType of originalTypes) {
      for (const memberType of unionType.getTypes()) {
        if (memberMap[memberType.name] !== undefined) {
          continue;
        }
        memberMap[memberType.name] = this._getMergedType(memberType);
      }
    }
    return Object.values(memberMap);
  }

  _getMergedInputFieldMap(
    originalTypes: ReadonlyArray<GraphQLInputObjectType>,
  ): GraphQLInputFieldConfigMap {
    const fields = Object.create(null);
    for (const type of originalTypes) {
      for (const [fieldName, field] of Object.entries(type.getFields())) {
        if (fields[fieldName] !== undefined) {
          continue;
        }
        fields[fieldName] = this._inputFieldToInputFieldConfig(field);
      }
    }
    return fields;
  }

  _inputFieldToInputFieldConfig(
    inputField: GraphQLInputField,
  ): GraphQLInputFieldConfig {
    return {
      description: inputField.description,
      type: this._getMergedType(inputField.type),
      deprecationReason: inputField.deprecationReason,
    };
  }

  _mergeEnumValueMaps(
    originalTypes: ReadonlyArray<GraphQLEnumType>,
  ): GraphQLEnumValueConfigMap {
    const values = Object.create(null);
    for (const type of originalTypes) {
      for (const value of type.getValues()) {
        const valueName = value.name;
        if (values[valueName] !== undefined) {
          continue;
        }
        values[valueName] = this._enumValueToEnumValueConfig(value);
      }
    }
    return values;
  }

  _enumValueToEnumValueConfig(value: GraphQLEnumValue): GraphQLEnumValueConfig {
    return {
      description: value.description,
      value: value.value,
      deprecationReason: value.deprecationReason,
    };
  }

  _mergeDirectiveLocations(
    originalDirectives: ReadonlyArray<GraphQLDirective>,
  ): Array<DirectiveLocation> {
    const locations = new Set<DirectiveLocation>();
    for (const directive of originalDirectives) {
      for (const location of directive.locations) {
        if (!locations.has(location)) {
          locations.add(location);
        }
      }
    }
    return Array.from(locations.values());
  }

  _getMergedType(type: GraphQLOutputType): GraphQLOutputType;
  _getMergedType(type: GraphQLInputType): GraphQLInputType;
  _getMergedType(type: GraphQLType): GraphQLType;
  _getMergedType(type: GraphQLType): GraphQLType {
    if (isListType(type)) {
      return new GraphQLList(this._getMergedType(type.ofType));
    }
    if (isNonNullType(type)) {
      return new GraphQLNonNull(this._getMergedType(type.ofType));
    }
    return this.mergedTypes[type.name];
  }

  getRootType(operation: OperationTypeNode): GraphQLObjectType | undefined {
    return this.mergedRootTypes[operation];
  }

  getType(name: string): GraphQLNamedType | undefined {
    return this.mergedTypes[name];
  }

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
    inputs: { readonly [variable: string]: unknown },
    options?: { maxErrors?: number },
  ): CoercedVariableValues {
    const errors = [];
    const maxErrors = options?.maxErrors;
    try {
      const coerced = this._coerceVariableValues(
        varDefNodes,
        inputs,
        (error) => {
          if (maxErrors != null && errors.length >= maxErrors) {
            throw new GraphQLError(
              'Too many errors processing variables, error limit reached. Execution aborted.',
            );
          }
          errors.push(error);
        },
      );

      if (errors.length === 0) {
        return { coerced };
      }
    } catch (error) {
      errors.push(error);
    }

    return { errors };
  }

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
  _typeFromAST(typeNode: TypeNode): GraphQLType | undefined {
    switch (typeNode.kind) {
      case Kind.LIST_TYPE: {
        const innerType = this._typeFromAST(typeNode.type);
        return innerType && new GraphQLList(innerType);
      }
      case Kind.NON_NULL_TYPE: {
        const innerType = this._typeFromAST(typeNode.type);
        return innerType && new GraphQLNonNull(innerType);
      }
      case Kind.NAMED_TYPE:
        return this.mergedTypes[typeNode.name.value];
    }
  }

  _coerceVariableValues(
    varDefNodes: ReadonlyArray<VariableDefinitionNode>,
    inputs: { readonly [variable: string]: unknown },
    onError: (error: GraphQLError) => void,
  ): { [variable: string]: unknown } {
    const coercedValues: { [variable: string]: unknown } = {};
    for (const varDefNode of varDefNodes) {
      const varName = varDefNode.variable.name.value;
      const varType = this._typeFromAST(varDefNode.type);
      if (!isInputType(varType)) {
        // Must use input types for variables. This should be caught during
        // validation, however is checked again here for safety.
        const varTypeStr = print(varDefNode.type);
        onError(
          new GraphQLError(
            `Variable "$${varName}" expected value of type "${varTypeStr}" which cannot be used as an input type.`,
            { nodes: varDefNode.type },
          ),
        );
        continue;
      }

      if (!Object.hasOwn(inputs, varName)) {
        if (varDefNode.defaultValue) {
          coercedValues[varName] = valueFromAST(
            varDefNode.defaultValue,
            varType,
          );
        } else if (isNonNullType(varType)) {
          const varTypeStr = inspect(varType);
          onError(
            new GraphQLError(
              `Variable "$${varName}" of required type "${varTypeStr}" was not provided.`,
              { nodes: varDefNode },
            ),
          );
        }
        continue;
      }

      const value = inputs[varName];
      if (value === null && isNonNullType(varType)) {
        const varTypeStr = inspect(varType);
        onError(
          new GraphQLError(
            `Variable "$${varName}" of non-null type "${varTypeStr}" must not be null.`,
            { nodes: varDefNode },
          ),
        );
        continue;
      }

      coercedValues[varName] = coerceInputValue(
        value,
        varType,
        (path, invalidValue, error) => {
          let prefix =
            `Variable "$${varName}" got invalid value ` + inspect(invalidValue);
          if (path.length > 0) {
            prefix += ` at "${varName}${printPathArray(path)}"`;
          }
          onError(
            new GraphQLError(prefix + '; ' + error.message, {
              nodes: varDefNode,
              originalError: error.originalError,
            }),
          );
        },
      );
    }

    return coercedValues;
  }

  getSubschemaId(subschema: Subschema): string {
    let subschemaId = this.subschemaIds.get(subschema);
    if (subschemaId === undefined) {
      subschemaId = this.subschemaIds.size.toString();
      this.subschemaIds.set(subschema, subschemaId);
    }
    return subschemaId;
  }
}
