import type {
  DirectiveLocation,
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FieldNode,
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
  InlineFragmentNode,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
  TypeNode,
  VariableDefinitionNode,
} from 'graphql';
import {
  coerceInputValue,
  execute,
  getNamedType,
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
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  valueFromAST,
} from 'graphql';
import type { ObjMap } from '../types/ObjMap';
import type { PromiseOrValue } from '../types/PromiseOrValue';
import { hasOwnProperty } from '../utilities/hasOwnProperty.ts';
import { inlineRootFragments } from '../utilities/inlineRootFragments.ts';
import { inspect } from '../utilities/inspect.ts';
import { invariant } from '../utilities/invariant.ts';
import { printPathArray } from '../utilities/printPathArray.ts';
export interface OperationContext {
  superSchema: SuperSchema;
  operation: OperationDefinitionNode;
  fragments: Array<FragmentDefinitionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>;
}
export interface ExecutionContext {
  operationContext: OperationContext;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  coercedVariableValues: {
    [variable: string]: unknown;
  };
}
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
const operations = [
  OperationTypeNode.QUERY,
  OperationTypeNode.MUTATION,
  OperationTypeNode.SUBSCRIPTION,
];
export type Executor = (args: {
  document: DocumentNode;
  variables?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
}) => PromiseOrValue<ExecutionResult | ExperimentalIncrementalExecutionResults>;
export type Subscriber = (args: {
  document: DocumentNode;
  variables?:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
}) => PromiseOrValue<ExecutionResult | AsyncIterableIterator<ExecutionResult>>;
export interface Subschema {
  schema: GraphQLSchema;
  executor: Executor;
  subscriber?: Subscriber;
}
export interface SubPlan {
  type: GraphQLOutputType;
  selectionsBySubschema: Map<Subschema, Array<SelectionNode>>;
}
export interface SubschemaPlan {
  document: DocumentNode;
  subPlans: ObjMap<SubPlan>;
}
/**
 * @internal
 */
export class SuperSchema {
  subschemas: ReadonlyArray<Subschema>;
  subschemaSetsByTypeAndField: ObjMap<ObjMap<Set<Subschema>>>;
  mergedRootTypes: ObjMap<GraphQLObjectType>;
  mergedTypes: ObjMap<GraphQLNamedType>;
  mergedDirectives: ObjMap<GraphQLDirective>;
  mergedSchema: GraphQLSchema;
  constructor(schemas: ReadonlyArray<Subschema>) {
    this.subschemas = schemas;
    this.subschemaSetsByTypeAndField = Object.create(null);
    this.mergedRootTypes = Object.create(null);
    this.mergedTypes = Object.create(null);
    this.mergedDirectives = Object.create(null);
    this._createMergedElements();
    this.mergedSchema = new GraphQLSchema({
      query: this.mergedRootTypes[OperationTypeNode.QUERY],
      mutation: this.mergedRootTypes[OperationTypeNode.MUTATION],
      subscription: this.mergedRootTypes[OperationTypeNode.SUBSCRIPTION],
      types: Object.values(this.mergedTypes),
      directives: Object.values(this.mergedDirectives),
    });
    const queryType = this.mergedSchema.getQueryType();
    if (queryType) {
      const introspectionSubschema: Subschema = {
        schema: this.mergedSchema,
        executor: (args) =>
          execute({
            ...args,
            schema: this.mergedSchema,
          }),
      };
      for (const [name, type] of Object.entries(
        this.mergedSchema.getTypeMap(),
      )) {
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
    }
  }
  _createMergedElements(): void {
    const originalRootTypes: ObjMap<Array<GraphQLObjectType>> =
      Object.create(null);
    const originalTypes: ObjMap<Array<GraphQLNamedType>> = Object.create(null);
    const originalDirectives: ObjMap<Array<GraphQLDirective>> =
      Object.create(null);
    for (const subschema of this.subschemas) {
      const schema = subschema.schema;
      for (const operation of operations) {
        const rootType = schema.getRootType(operation);
        if (rootType) {
          if (!originalRootTypes[operation]) {
            originalRootTypes[operation] = [rootType];
          } else {
            originalRootTypes[operation].push(rootType);
          }
        }
      }
      for (const [name, type] of Object.entries(schema.getTypeMap())) {
        if (name.startsWith('__')) {
          continue;
        }
        if (!originalTypes[name]) {
          originalTypes[name] = [type];
        } else {
          originalTypes[name].push(type);
        }
        if (isCompositeType(type)) {
          this._addToSubschemaSets(subschema, name, type);
        }
      }
      for (const directive of schema.getDirectives()) {
        const name = directive.name;
        if (!originalDirectives[name]) {
          originalDirectives[name] = [directive];
        } else {
          originalDirectives[name].push(directive);
        }
      }
    }
    for (const [operation, rootTypes] of Object.entries(originalRootTypes)) {
      this.mergedRootTypes[operation] = this._mergeObjectTypes(rootTypes);
    }
    const mergedRootTypes = Object.values(this.mergedRootTypes);
    for (const [typeName, types] of Object.entries(originalTypes)) {
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
        const rootType = mergedRootTypes.find((type) => type.name === typeName);
        if (rootType) {
          this.mergedTypes[typeName] = rootType;
          continue;
        }
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
    for (const [directiveName, directives] of Object.entries(
      originalDirectives,
    )) {
      this.mergedDirectives[directiveName] = this._mergeDirectives(directives);
    }
  }
  _addToSubschemaSets(
    subschema: Subschema,
    name: string,
    type: GraphQLCompositeType,
  ): void {
    let subschemaSetsByField = this.subschemaSetsByTypeAndField[name];
    if (!subschemaSetsByField) {
      subschemaSetsByField = Object.create(null);
      this.subschemaSetsByTypeAndField[name] = subschemaSetsByField;
    }
    let typenameSubschemaSet = subschemaSetsByField.__typename;
    if (!typenameSubschemaSet) {
      typenameSubschemaSet = new Set();
      subschemaSetsByField.__typename = typenameSubschemaSet;
    }
    typenameSubschemaSet.add(subschema);
    if (isUnionType(type)) {
      return;
    }
    for (const fieldName of Object.keys(type.getFields())) {
      let subschemaSet = subschemaSetsByField[fieldName];
      if (!subschemaSet) {
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
        if (fields[fieldName]) {
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
        if (interfaceMap[interfaceType.name]) {
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
        if (memberMap[memberType.name]) {
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
        if (fields[fieldName]) {
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
        if (values[valueName]) {
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
    inputs: {
      readonly [variable: string]: unknown;
    },
    options?: {
      maxErrors?: number;
    },
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
    inputs: {
      readonly [variable: string]: unknown;
    },
    onError: (error: GraphQLError) => void,
  ): {
    [variable: string]: unknown;
  } {
    const coercedValues: {
      [variable: string]: unknown;
    } = {};
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
      if (!hasOwnProperty(inputs, varName)) {
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
  generatePlan(
    operationContext: OperationContext,
  ): Map<Subschema, SubschemaPlan> {
    const { operation, fragments, fragmentMap } = operationContext;
    const rootType = this.getRootType(operation.operation);
    rootType !== undefined ||
      invariant(
        false,
        `Schema is not configured to execute ${operation.operation}`,
      );
    const inlinedSelectionSet = inlineRootFragments(
      operation.selectionSet,
      fragmentMap,
    );
    const subPlans: ObjMap<SubPlan> = Object.create(null);
    const splitSelections = this._splitSelectionSet(
      rootType,
      inlinedSelectionSet,
      fragmentMap,
      subPlans,
      [],
    );
    const map = new Map<Subschema, SubschemaPlan>();
    for (const [subschema, selections] of splitSelections) {
      const document: DocumentNode = {
        kind: Kind.DOCUMENT,
        definitions: [
          {
            ...operation,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections,
            },
          },
          ...fragments,
        ],
      };
      map.set(subschema, {
        document,
        subPlans,
      });
    }
    return map;
  }
  _splitSelectionSet(
    parentType: GraphQLCompositeType,
    selectionSet: SelectionSetNode,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): Map<Subschema, Array<SelectionNode>> {
    const map = new Map<Subschema, Array<SelectionNode>>();
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(
            parentType as GraphQLObjectType | GraphQLInterfaceType,
            selection,
            fragmentMap,
            map,
            subPlans,
            [...path, selection.name.value],
          );
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? (this.getType(typeName) as GraphQLCompositeType)
            : parentType;
          this._addInlineFragment(
            refinedType,
            selection,
            fragmentMap,
            map,
            subPlans,
            path,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          // Not reached
          false ||
            invariant(
              false,
              'Fragment spreads should be inlined prior to selections being split!',
            );
        }
      }
    }
    return map;
  }
  // eslint-disable-next-line max-params
  _addField(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    field: FieldNode,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
    map: Map<Subschema, Array<SelectionNode>>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): void {
    const subschemaSetsByField =
      this.subschemaSetsByTypeAndField[parentType.name];
    const subschemas = subschemaSetsByField[field.name.value];
    if (subschemas) {
      let subschemaAndSelections:
        | {
            subschema: Subschema;
            selections: Array<SelectionNode>;
          }
        | undefined;
      for (const subschema of subschemas) {
        const selections = map.get(subschema);
        if (selections) {
          subschemaAndSelections = { subschema, selections };
          break;
        }
      }
      if (!subschemaAndSelections) {
        const subschema = subschemas.values().next().value as Subschema;
        const selections: Array<SelectionNode> = [];
        map.set(subschema, selections);
        subschemaAndSelections = { subschema, selections };
      }
      const { subschema, selections } = subschemaAndSelections;
      if (!field.selectionSet) {
        selections.push(field);
        return;
      }
      const inlinedSelectionSet = inlineRootFragments(
        field.selectionSet,
        fragmentMap,
      );
      const fieldName = field.name.value;
      const fieldDef = this._getFieldDef(parentType, fieldName);
      if (fieldDef) {
        const fieldType = fieldDef.type;
        const splitSelections = this._splitSelectionSet(
          getNamedType(fieldType) as GraphQLCompositeType,
          inlinedSelectionSet,
          fragmentMap,
          subPlans,
          path,
        );
        const filteredSelections = splitSelections.get(subschema);
        if (filteredSelections) {
          selections.push({
            ...field,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: filteredSelections,
            },
          });
        }
        splitSelections.delete(subschema);
        if (splitSelections.size > 0) {
          subPlans[path.join('.')] = {
            type: fieldType,
            selectionsBySubschema: splitSelections,
          };
        }
      }
    }
  }
  _getFieldDef(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined {
    if (
      fieldName === SchemaMetaFieldDef.name &&
      parentType === this.mergedSchema.getQueryType()
    ) {
      return SchemaMetaFieldDef;
    }
    if (
      fieldName === TypeMetaFieldDef.name &&
      parentType === this.mergedSchema.getQueryType()
    ) {
      return TypeMetaFieldDef;
    }
    const fields = parentType.getFields();
    return fields[fieldName];
  }
  // eslint-disable-next-line max-params
  _addInlineFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
    map: Map<Subschema, Array<SelectionNode>>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): void {
    const splitSelections = this._splitSelectionSet(
      parentType,
      fragment.selectionSet,
      fragmentMap,
      subPlans,
      path,
    );
    for (const [fragmentSubschema, fragmentSelections] of splitSelections) {
      const splitFragment: InlineFragmentNode = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      const selections = map.get(fragmentSubschema);
      if (selections) {
        selections.push(splitFragment);
      } else {
        map.set(fragmentSubschema, [splitFragment]);
      }
    }
  }
}
