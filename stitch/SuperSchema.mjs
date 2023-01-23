import {
  coerceInputValue,
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
  isInputType,
  isListType,
  isNonNullType,
  isSpecifiedScalarType,
  Kind,
  OperationTypeNode,
  print,
  valueFromAST,
} from 'graphql';
import { hasOwnProperty } from '../utilities/hasOwnProperty.mjs';
import { inspect } from '../utilities/inspect.mjs';
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
    this.schemas = schemas;
    this.mergedRootTypes = Object.create(null);
    this.mergedTypes = Object.create(null);
    this.mergedDirectives = Object.create(null);
    this._createMergedElements();
    this.mergeSchema = new GraphQLSchema({
      query: this.mergedRootTypes[OperationTypeNode.QUERY],
      mutation: this.mergedRootTypes[OperationTypeNode.MUTATION],
      subscription: this.mergedRootTypes[OperationTypeNode.SUBSCRIPTION],
      types: Object.values(this.mergedTypes),
      directives: Object.values(this.mergedDirectives),
    });
  }
  _createMergedElements() {
    const originalRootTypes = Object.create(null);
    const originalTypes = Object.create(null);
    const originalDirectives = Object.create(null);
    for (const schema of this.schemas) {
      for (const operation of operations) {
        const rootType = schema.getRootType(operation);
        if (rootType) {
          let types = originalRootTypes[operation];
          if (!types) {
            types = [];
            originalRootTypes[operation] = types;
          }
          types.push(rootType);
        }
      }
      for (const [name, type] of Object.entries(schema.getTypeMap())) {
        if (name.startsWith('__')) {
          continue;
        }
        let types = originalTypes[name];
        if (!types) {
          types = [];
          originalTypes[name] = types;
        }
        types.push(type);
      }
      for (const directive of schema.getDirectives()) {
        const name = directive.name;
        let directives = originalDirectives[name];
        if (!directives) {
          directives = [];
          originalDirectives[name] = directives;
        }
        directives.push(directive);
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
        interfaceMap[type.name] = this._getMergedType(type);
      }
    }
    return Object.values(interfaceMap);
  }
  _getMergedMemberTypes(originalTypes) {
    const memberMap = Object.create(null);
    for (const type of originalTypes) {
      for (const unionType of type.getTypes()) {
        if (memberMap[unionType.name]) {
          continue;
        }
        memberMap[type.name] = this._getMergedType(type);
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
        return this.getType(typeNode.name.value);
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
}
