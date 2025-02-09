// adapted from graphql-js
import { Kind } from 'graphql';
import { appendToArray, emptyArray } from "./appendToArray.mjs";
import { updateNode } from "./updateNode.mjs";
const DocumentKeys = {
    Name: [],
    Document: ['definitions'],
    OperationDefinition: [
        'name',
        'variableDefinitions',
        'directives',
        'selectionSet',
    ],
    VariableDefinition: ['variable', 'type', 'defaultValue', 'directives'],
    Variable: ['name'],
    SelectionSet: ['selections'],
    Field: [
        'alias',
        'name',
        'arguments',
        'directives',
        'selectionSet',
        // Note: Client Controlled Nullability is experimental and may be changed
        // or removed in the future.
        'nullabilityAssertion',
    ],
    Argument: ['name', 'value'],
    // Note: Client Controlled Nullability is experimental and may be changed
    // or removed in the future.
    ListNullabilityOperator: ['nullabilityAssertion'],
    NonNullAssertion: ['nullabilityAssertion'],
    ErrorBoundary: ['nullabilityAssertion'],
    FragmentSpread: ['name', 'directives'],
    InlineFragment: ['typeCondition', 'directives', 'selectionSet'],
    FragmentDefinition: [
        'name',
        // Note: fragment variable definitions are deprecated and will removed in v17.0.0
        'variableDefinitions',
        'typeCondition',
        'directives',
        'selectionSet',
    ],
    IntValue: [],
    FloatValue: [],
    StringValue: [],
    BooleanValue: [],
    NullValue: [],
    EnumValue: [],
    ListValue: ['values'],
    ObjectValue: ['fields'],
    ObjectField: ['name', 'value'],
    Directive: ['name', 'arguments'],
    NamedType: ['name'],
    ListType: ['type'],
    NonNullType: ['type'],
    SchemaDefinition: ['description', 'directives', 'operationTypes'],
    OperationTypeDefinition: ['type'],
    ScalarTypeDefinition: ['description', 'name', 'directives'],
    ObjectTypeDefinition: [
        'description',
        'name',
        'interfaces',
        'directives',
        'fields',
    ],
    FieldDefinition: ['description', 'name', 'arguments', 'type', 'directives'],
    InputValueDefinition: [
        'description',
        'name',
        'type',
        'defaultValue',
        'directives',
    ],
    InterfaceTypeDefinition: [
        'description',
        'name',
        'interfaces',
        'directives',
        'fields',
    ],
    UnionTypeDefinition: ['description', 'name', 'directives', 'types'],
    EnumTypeDefinition: ['description', 'name', 'directives', 'values'],
    EnumValueDefinition: ['description', 'name', 'directives'],
    InputObjectTypeDefinition: ['description', 'name', 'directives', 'fields'],
    DirectiveDefinition: ['description', 'name', 'arguments', 'locations'],
    SchemaExtension: ['directives', 'operationTypes'],
    ScalarTypeExtension: ['name', 'directives'],
    ObjectTypeExtension: ['name', 'interfaces', 'directives', 'fields'],
    InterfaceTypeExtension: ['name', 'interfaces', 'directives', 'fields'],
    UnionTypeExtension: ['name', 'directives', 'types'],
    EnumTypeExtension: ['name', 'directives', 'values'],
    InputObjectTypeExtension: ['name', 'directives', 'fields'],
};
/**
 * Given a visitor instance and a node kind, return EnterLeaveVisitor for that kind.
 */
function getEnterLeaveForKind(visitor, kind) {
    const kindVisitor = visitor[kind];
    if (typeof kindVisitor === 'object') {
        // { Kind: { enter() {}, leave() {} } }
        return kindVisitor;
    }
    else if (typeof kindVisitor === 'function') {
        // { Kind() {} }
        return { enter: kindVisitor, leave: undefined };
    }
    // { enter() {}, leave() {} }
    return { enter: visitor.enter, leave: visitor.leave };
}
const kindValues = new Set(Object.keys(DocumentKeys));
function isNode(maybeNode) {
    const maybeKind = maybeNode?.kind;
    return typeof maybeKind === 'string' && kindValues.has(maybeKind);
}
export const BREAK = Object.freeze({});
export function visitWithMemo(root, visitor, visitorKeys = DocumentKeys) {
    const enterLeaveMap = new Map();
    for (const kind of Object.values(Kind)) {
        enterLeaveMap.set(kind, getEnterLeaveForKind(visitor, kind));
    }
    /* eslint-disable no-undef-init */
    let stack = undefined;
    let inArray = Array.isArray(root);
    let keys = [root];
    let index = -1;
    let edits = new Map();
    let node = root;
    let key = undefined;
    let parent = undefined;
    const path = [];
    const ancestors = [];
    /* eslint-enable no-undef-init */
    do {
        index++;
        const isLeaving = index === keys.length;
        const isEdited = isLeaving && edits.size !== 0;
        if (isLeaving) {
            key = ancestors.length === 0 ? undefined : path[path.length - 1];
            node = parent;
            parent = ancestors.pop();
            if (isEdited) {
                if (inArray) {
                    let arr = emptyArray;
                    for (let arrIndex = 0; arrIndex < node.length; arrIndex++) {
                        const editValue = edits.get(arrIndex);
                        if (editValue === undefined) {
                            arr = appendToArray(arr, node[arrIndex]);
                        }
                        else if (editValue !== null) {
                            arr = appendToArray(arr, editValue);
                        }
                    }
                    node = arr;
                }
                else {
                    let newNode = node;
                    for (const [editKey, editValue] of edits) {
                        newNode = updateNode(newNode, editKey, editValue);
                    }
                    node = newNode;
                }
            }
            index = stack.index;
            keys = stack.keys;
            edits = stack.edits;
            inArray = stack.inArray;
            stack = stack.prev;
        }
        else if (parent != null) {
            key = inArray ? index : keys[index];
            node = parent[key];
            if (node === null || node === undefined) {
                continue;
            }
            path.push(key);
        }
        let result;
        if (!Array.isArray(node)) {
            const visitFn = isLeaving
                ? enterLeaveMap.get(node.kind)?.leave
                : enterLeaveMap.get(node.kind)?.enter;
            result = visitFn?.call(visitor, node, key, parent, path, ancestors);
            if (result === BREAK) {
                break;
            }
            if (result === false) {
                path.pop();
                continue;
            }
            else if (result !== undefined) {
                edits.set(key, result);
                if (!isLeaving) {
                    if (isNode(result)) {
                        node = result;
                    }
                    else {
                        path.pop();
                        continue;
                    }
                }
            }
        }
        if (result === undefined && isEdited) {
            edits.set(key, node);
        }
        if (isLeaving) {
            path.pop();
        }
        else {
            stack = { inArray, index, keys, edits, prev: stack };
            inArray = Array.isArray(node);
            keys = inArray ? node : (visitorKeys[node.kind] ?? []);
            index = -1;
            edits = new Map();
            if (parent != null) {
                ancestors.push(parent);
            }
            parent = node;
        }
    } while (stack !== undefined);
    if (edits.size !== 0) {
        // New root
        return Array.from(edits.values()).at(-1);
    }
    return root;
}
