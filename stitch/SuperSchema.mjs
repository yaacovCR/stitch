import { coerceInputLiteral, coerceInputValue, execute, GraphQLDirective, GraphQLEnumType, GraphQLError, GraphQLInputObjectType, GraphQLInterfaceType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLScalarType, GraphQLSchema, GraphQLUnionType, isCompositeType, isInputType, isListType, isNonNullType, isSpecifiedScalarType, isUnionType, Kind, OperationTypeNode, print, validateInputValue, } from 'graphql';
import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { printPathArray } from '../utilities/printPathArray.js';
const operations = [
    OperationTypeNode.QUERY,
    OperationTypeNode.MUTATION,
    OperationTypeNode.SUBSCRIPTION,
];
/**
 * @internal
 */
export class SuperSchema {
    constructor(subschemas) {
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
        const introspectionSubschema = {
            schema: this.mergedSchema,
            executor: (args) => execute({ ...args, schema: this.mergedSchema }),
        };
        for (const [name, type] of Object.entries(this.mergedSchema.getTypeMap())) {
            if (!name.startsWith('__')) {
                continue;
            }
            if (isCompositeType(type)) {
                this._addToSubschemaSets(introspectionSubschema, name, type);
            }
        }
        const subSchemaSetsByField = this.subschemaSetsByTypeAndField[queryType.name];
        subSchemaSetsByField.__schema = new Set([introspectionSubschema]);
        subSchemaSetsByField.__type = new Set([introspectionSubschema]);
        this.subschemas = [introspectionSubschema, ...subschemas];
    }
    _createMergedElements(subschemas) {
        const originalRootTypes = new AccumulatorMap();
        const originalTypes = new AccumulatorMap();
        const originalDirectives = new AccumulatorMap();
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
                this.mergedTypes[typeName] = this._mergeScalarTypes(types);
            }
            else if (firstType instanceof GraphQLObjectType) {
                this.mergedTypes[typeName] = this._mergeObjectTypes(types);
            }
            else if (firstType instanceof GraphQLInterfaceType) {
                this.mergedTypes[typeName] = this._mergeInterfaceTypes(types);
            }
            else if (firstType instanceof GraphQLUnionType) {
                this.mergedTypes[typeName] = this._mergeUnionTypes(types);
            }
            else if (firstType instanceof GraphQLInputObjectType) {
                this.mergedTypes[typeName] = this._mergeInputObjectTypes(types);
            }
            else if (firstType instanceof GraphQLEnumType) {
                this.mergedTypes[typeName] = this._mergeEnumTypes(types);
            }
        }
        for (const [operation, rootTypes] of originalRootTypes) {
            this.mergedRootTypes[operation] = this.getType(rootTypes[0].name);
        }
        for (const [directiveName, directives] of originalDirectives) {
            this.mergedDirectives[directiveName] = this._mergeDirectives(directives);
        }
    }
    _addToSubschemaSets(subschema, name, type) {
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
            isRepeatable: originalDirectives.some((directive) => directive.isRepeatable),
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
                if (fields[fieldName] !== undefined) {
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
                if (interfaceMap[interfaceType.name] !== undefined) {
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
                if (memberMap[memberType.name] !== undefined) {
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
                if (fields[fieldName] !== undefined) {
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
                if (values[valueName] !== undefined) {
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
    getFieldDef(parentType, fieldName) {
        return this.mergedSchema.getField(parentType, fieldName);
    }
    getPossibleTypes(abstractType) {
        return this.mergedSchema.getPossibleTypes(abstractType);
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
            const variableValues = this._coerceVariableValues(varDefNodes, inputs, (error) => {
                if (maxErrors != null && errors.length >= maxErrors) {
                    throw new GraphQLError('Too many errors processing variables, error limit reached. Execution aborted.');
                }
                errors.push(error);
            });
            if (errors.length === 0) {
                return { variableValues };
            }
        }
        catch (error) {
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
    _coerceVariableValues(varDefNodes, inputs, onError, hideSuggestions) {
        const sources = Object.create(null);
        const coerced = Object.create(null);
        for (const varDefNode of varDefNodes) {
            const varSignature = this._getVariableSignature(varDefNode);
            if (varSignature instanceof GraphQLError) {
                onError(varSignature);
                continue;
            }
            const { name: varName, type: varType } = varSignature;
            let value;
            if (!Object.hasOwn(inputs, varName)) {
                sources[varName] = { signature: varSignature };
                if (varDefNode.defaultValue) {
                    coerced[varName] = coerceInputLiteral(varDefNode.defaultValue, varType);
                    continue;
                }
                else if (!isNonNullType(varType)) {
                    // Non-provided values for nullable variables are omitted.
                    continue;
                }
            }
            else {
                value = inputs[varName];
                sources[varName] = { signature: varSignature, value };
            }
            const coercedValue = coerceInputValue(value, varType);
            if (coercedValue !== undefined) {
                coerced[varName] = coercedValue;
            }
            else {
                validateInputValue(value, varType, (error, path) => {
                    onError(new GraphQLError(`Variable "$${varName}" has invalid value${printPathArray(path)}: ${error.message}`, { nodes: varDefNode, originalError: error }));
                }, hideSuggestions);
            }
        }
        return { sources, coerced };
    }
    _getVariableSignature(varDefNode) {
        const varName = varDefNode.variable.name.value;
        const varType = this._typeFromAST(varDefNode.type);
        if (!isInputType(varType)) {
            // Must use input types for variables. This should be caught during
            // validation, however is checked again here for safety.
            const varTypeStr = print(varDefNode.type);
            return new GraphQLError(`Variable "$${varName}" expected value of type "${varTypeStr}" which cannot be used as an input type.`, { nodes: varDefNode.type });
        }
        const defaultValue = varDefNode.defaultValue;
        return {
            name: varName,
            type: varType,
            default: defaultValue && { literal: defaultValue },
        };
    }
    getSubschemaId(subschema) {
        let subschemaId = this.subschemaIds.get(subschema);
        if (subschemaId === undefined) {
            subschemaId = this.subschemaIds.size.toString();
            this.subschemaIds.set(subschema, subschemaId);
        }
        return subschemaId;
    }
}
