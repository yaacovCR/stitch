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
import { hasOwnProperty } from '../utilities/hasOwnProperty.mjs';
import { inlineRootFragments } from '../utilities/inlineRootFragments.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { printPathArray } from '../utilities/printPathArray.mjs';
const operations = [
  OperationTypeNode.QUERY,
  OperationTypeNode.MUTATION,
  OperationTypeNode.SUBSCRIPTION,
];
/**
 * @internal
 */
export class SuperSchema {
  constructor(schemas) {
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
      const introspectionSubschema = {
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
  _createMergedElements() {
    const originalRootTypes = Object.create(null);
    const originalTypes = Object.create(null);
    const originalDirectives = Object.create(null);
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
        this.mergedTypes[typeName] = this._mergeScalarTypes(types);
      } else if (firstType instanceof GraphQLObjectType) {
        const rootType = mergedRootTypes.find((type) => type.name === typeName);
        if (rootType) {
          this.mergedTypes[typeName] = rootType;
          continue;
        }
        this.mergedTypes[typeName] = this._mergeObjectTypes(types);
      } else if (firstType instanceof GraphQLInterfaceType) {
        this.mergedTypes[typeName] = this._mergeInterfaceTypes(types);
      } else if (firstType instanceof GraphQLUnionType) {
        this.mergedTypes[typeName] = this._mergeUnionTypes(types);
      } else if (firstType instanceof GraphQLInputObjectType) {
        this.mergedTypes[typeName] = this._mergeInputObjectTypes(types);
      } else if (firstType instanceof GraphQLEnumType) {
        this.mergedTypes[typeName] = this._mergeEnumTypes(types);
      }
    }
    for (const [directiveName, directives] of Object.entries(
      originalDirectives,
    )) {
      this.mergedDirectives[directiveName] = this._mergeDirectives(directives);
    }
  }
  _addToSubschemaSets(subschema, name, type) {
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
  _mergeScalarTypes(originalTypes) {
    const firstType = originalTypes[0];
    return new GraphQLScalarType({
      name: firstType.name,
      description: firstType.description,
    });
  }
  _mergeObjectTypes(originalTypes) {
    const firstType = originalTypes[0];
    return new GraphQLObjectType({
      name: firstType.name,
      description: firstType.description,
      fields: () => this._getMergedFieldMap(originalTypes),
      interfaces: () => this._getMergedInterfaces(originalTypes),
    });
  }
  _mergeInterfaceTypes(originalTypes) {
    const firstType = originalTypes[0];
    return new GraphQLInterfaceType({
      name: firstType.name,
      description: firstType.description,
      fields: () => this._getMergedFieldMap(originalTypes),
      interfaces: () => this._getMergedInterfaces(originalTypes),
    });
  }
  _mergeUnionTypes(originalTypes) {
    const firstType = originalTypes[0];
    return new GraphQLUnionType({
      name: firstType.name,
      description: firstType.description,
      types: () => this._getMergedMemberTypes(originalTypes),
    });
  }
  _mergeInputObjectTypes(originalTypes) {
    const firstType = originalTypes[0];
    return new GraphQLInputObjectType({
      name: firstType.name,
      description: firstType.description,
      fields: () => this._getMergedInputFieldMap(originalTypes),
    });
  }
  _mergeEnumTypes(originalTypes) {
    const firstType = originalTypes[0];
    return new GraphQLEnumType({
      name: firstType.name,
      description: firstType.description,
      values: this._mergeEnumValueMaps(originalTypes),
    });
  }
  _mergeDirectives(originalDirectives) {
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
  _getMergedFieldMap(originalTypes) {
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
  _fieldToFieldConfig(field) {
    const args = Object.create(null);
    const fieldConfig = {
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
  _argToArgConfig(arg) {
    return {
      description: arg.description,
      type: this._getMergedType(arg.type),
      defaultValue: arg.defaultValue,
      deprecationReason: arg.deprecationReason,
    };
  }
  _getMergedInterfaces(originalTypes) {
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
  _getMergedMemberTypes(originalTypes) {
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
  _getMergedInputFieldMap(originalTypes) {
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
  _inputFieldToInputFieldConfig(inputField) {
    return {
      description: inputField.description,
      type: this._getMergedType(inputField.type),
      deprecationReason: inputField.deprecationReason,
    };
  }
  _mergeEnumValueMaps(originalTypes) {
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
  _enumValueToEnumValueConfig(value) {
    return {
      description: value.description,
      value: value.value,
      deprecationReason: value.deprecationReason,
    };
  }
  _mergeDirectiveLocations(originalDirectives) {
    const locations = new Set();
    for (const directive of originalDirectives) {
      for (const location of directive.locations) {
        if (!locations.has(location)) {
          locations.add(location);
        }
      }
    }
    return Array.from(locations.values());
  }
  _getMergedType(type) {
    if (isListType(type)) {
      return new GraphQLList(this._getMergedType(type.ofType));
    }
    if (isNonNullType(type)) {
      return new GraphQLNonNull(this._getMergedType(type.ofType));
    }
    return this.mergedTypes[type.name];
  }
  getRootType(operation) {
    return this.mergedRootTypes[operation];
  }
  getType(name) {
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
  getVariableValues(varDefNodes, inputs, options) {
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
  _typeFromAST(typeNode) {
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
  _coerceVariableValues(varDefNodes, inputs, onError) {
    const coercedValues = {};
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
  generatePlan(operationContext) {
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
    const subPlans = Object.create(null);
    const splitSelections = this._splitSelectionSet(
      rootType,
      inlinedSelectionSet,
      fragmentMap,
      subPlans,
      [],
    );
    const map = new Map();
    for (const [subschema, selections] of splitSelections) {
      const document = {
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
  _splitSelectionSet(parentType, selectionSet, fragmentMap, subPlans, path) {
    const map = new Map();
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, fragmentMap, map, subPlans, [
            ...path,
            selection.name.value,
          ]);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName ? this.getType(typeName) : parentType;
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
  _addField(parentType, field, fragmentMap, map, subPlans, path) {
    const subschemaSetsByField =
      this.subschemaSetsByTypeAndField[parentType.name];
    const subschemas = subschemaSetsByField[field.name.value];
    if (subschemas) {
      let subschemaAndSelections;
      for (const subschema of subschemas) {
        const selections = map.get(subschema);
        if (selections) {
          subschemaAndSelections = { subschema, selections };
          break;
        }
      }
      if (!subschemaAndSelections) {
        const subschema = subschemas.values().next().value;
        const selections = [];
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
          getNamedType(fieldType),
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
  _getFieldDef(parentType, fieldName) {
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
  _addInlineFragment(parentType, fragment, fragmentMap, map, subPlans, path) {
    const splitSelections = this._splitSelectionSet(
      parentType,
      fragment.selectionSet,
      fragmentMap,
      subPlans,
      path,
    );
    for (const [fragmentSubschema, fragmentSelections] of splitSelections) {
      const splitFragment = {
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
