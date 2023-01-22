'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SuperSchema = void 0;
const graphql_1 = require('graphql');
const hasOwnProperty_js_1 = require('../utilities/hasOwnProperty.js');
const inspect_js_1 = require('../utilities/inspect.js');
const printPathArray_js_1 = require('../utilities/printPathArray.js');
/**
 * @internal
 */
class SuperSchema {
  constructor(schemas) {
    this.schemas = schemas;
    this.rootTypes = Object.create(null);
    this.typeMap = Object.create(null);
  }
  getRootType(operation) {
    let type = this.rootTypes[operation];
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
  getType(name) {
    let type = this.typeMap[name];
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
  getVariableValues(varDefNodes, inputs, options) {
    const errors = [];
    const maxErrors = options?.maxErrors;
    try {
      const coerced = this._coerceVariableValues(
        varDefNodes,
        inputs,
        (error) => {
          if (maxErrors != null && errors.length >= maxErrors) {
            throw new graphql_1.GraphQLError(
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
      case graphql_1.Kind.LIST_TYPE: {
        const innerType = this._typeFromAST(typeNode.type);
        return innerType && new graphql_1.GraphQLList(innerType);
      }
      case graphql_1.Kind.NON_NULL_TYPE: {
        const innerType = this._typeFromAST(typeNode.type);
        return innerType && new graphql_1.GraphQLNonNull(innerType);
      }
      case graphql_1.Kind.NAMED_TYPE:
        return this.getType(typeNode.name.value);
    }
  }
  _coerceVariableValues(varDefNodes, inputs, onError) {
    const coercedValues = {};
    for (const varDefNode of varDefNodes) {
      const varName = varDefNode.variable.name.value;
      const varType = this._typeFromAST(varDefNode.type);
      if (!(0, graphql_1.isInputType)(varType)) {
        // Must use input types for variables. This should be caught during
        // validation, however is checked again here for safety.
        const varTypeStr = (0, graphql_1.print)(varDefNode.type);
        onError(
          new graphql_1.GraphQLError(
            `Variable "$${varName}" expected value of type "${varTypeStr}" which cannot be used as an input type.`,
            { nodes: varDefNode.type },
          ),
        );
        continue;
      }
      if (!(0, hasOwnProperty_js_1.hasOwnProperty)(inputs, varName)) {
        if (varDefNode.defaultValue) {
          coercedValues[varName] = (0, graphql_1.valueFromAST)(
            varDefNode.defaultValue,
            varType,
          );
        } else if ((0, graphql_1.isNonNullType)(varType)) {
          const varTypeStr = (0, inspect_js_1.inspect)(varType);
          onError(
            new graphql_1.GraphQLError(
              `Variable "$${varName}" of required type "${varTypeStr}" was not provided.`,
              { nodes: varDefNode },
            ),
          );
        }
        continue;
      }
      const value = inputs[varName];
      if (value === null && (0, graphql_1.isNonNullType)(varType)) {
        const varTypeStr = (0, inspect_js_1.inspect)(varType);
        onError(
          new graphql_1.GraphQLError(
            `Variable "$${varName}" of non-null type "${varTypeStr}" must not be null.`,
            { nodes: varDefNode },
          ),
        );
        continue;
      }
      coercedValues[varName] = (0, graphql_1.coerceInputValue)(
        value,
        varType,
        (path, invalidValue, error) => {
          let prefix =
            `Variable "$${varName}" got invalid value ` +
            (0, inspect_js_1.inspect)(invalidValue);
          if (path.length > 0) {
            prefix += ` at "${varName}${(0, printPathArray_js_1.printPathArray)(
              path,
            )}"`;
          }
          onError(
            new graphql_1.GraphQLError(prefix + '; ' + error.message, {
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
exports.SuperSchema = SuperSchema;
