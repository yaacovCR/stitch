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
import {
  coerceInputValue,
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  isInputType,
  isNonNullType,
  Kind,
  print,
  valueFromAST,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap';

import { hasOwnProperty } from '../utilities/hasOwnProperty.js';
import { inspect } from '../utilities/inspect.js';
import { printPathArray } from '../utilities/printPathArray.js';

type CoercedVariableValues =
  | { errors: ReadonlyArray<GraphQLError>; coerced?: never }
  | { coerced: { [variable: string]: unknown }; errors?: never };

/**
 * @internal
 */
export class SuperSchema {
  schemas: ReadonlyArray<GraphQLSchema>;
  rootTypes: ObjMap<GraphQLObjectType | null | undefined>;
  typeMap: ObjMap<GraphQLNamedType>;

  constructor(schemas: ReadonlyArray<GraphQLSchema>) {
    this.schemas = schemas;
    this.rootTypes = Object.create(null);
    this.typeMap = Object.create(null);
  }

  getRootType(operation: OperationTypeNode): GraphQLObjectType | undefined {
    let type: GraphQLNamedType | null | undefined = this.rootTypes[operation];
    if (type) {
      return type;
    }

    if (type === null) {
      return undefined;
    }

    for (const schema of this.schemas) {
      type = schema.getRootType(operation);
      if (type) {
        this.rootTypes[operation] = type;
        return type;
      }
    }

    this.rootTypes[operation] = null;
    return undefined;
  }

  getType(name: string): GraphQLNamedType | undefined {
    let type: GraphQLNamedType | undefined = this.typeMap[name];
    if (type) {
      return type;
    }

    for (const schema of this.schemas) {
      type = schema.getType(name);
      if (type) {
        this.typeMap[name] = type;
        return type;
      }
    }
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
        return this.getType(typeNode.name.value);
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
