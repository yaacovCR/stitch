// adapted from graphql-js
import type { ASTNode } from 'graphql';
import { Kind } from 'graphql';
import { appendToArray, emptyArray } from './appendToArray.ts';
import { updateNode } from './updateNode.ts';
/**
 * A visitor is provided to visit, it contains the collection of
 * relevant functions to be called during the visitor's traversal.
 */
type ASTVisitor = EnterLeaveVisitor<ASTNode> | KindVisitor;
type KindVisitor = {
  readonly [NodeT in ASTNode as NodeT['kind']]?:
    | ASTVisitFn<NodeT>
    | EnterLeaveVisitor<NodeT>;
};
interface EnterLeaveVisitor<TVisitedNode extends ASTNode> {
  readonly enter?: ASTVisitFn<TVisitedNode> | undefined;
  readonly leave?: ASTVisitFn<TVisitedNode> | undefined;
}
/**
 * A visitor is comprised of visit functions, which are called on each node
 * during the visitor's traversal.
 */
type ASTVisitFn<TVisitedNode extends ASTNode> = (
  /** The current node being visiting. */
  node: TVisitedNode,
  /** The index or key to this node from the parent node or Array. */
  key: string | number | undefined,
  /** The parent immediately above this node, which may be an Array. */
  parent: ASTNode | ReadonlyArray<ASTNode> | undefined,
  /** The key path to get to this node from the root node. */
  path: ReadonlyArray<string | number>,
  /**
   * All nodes and Arrays visited before reaching parent of this node.
   * These correspond to array indices in `path`.
   * Note: ancestors includes arrays which contain the parent of visited node.
   */
  ancestors: ReadonlyArray<ASTNode | ReadonlyArray<ASTNode>>,
) => any;
/**
 * A reducer is comprised of reducer functions which convert AST nodes into
 * another form.
 */
type ASTReducer<R> = {
  readonly [NodeT in ASTNode as NodeT['kind']]?: {
    readonly enter?: ASTVisitFn<NodeT>;
    readonly leave: ASTReducerFn<NodeT, R>;
  };
};
const DocumentKeys: {
  [NodeT in ASTNode as NodeT['kind']]: ReadonlyArray<keyof NodeT>;
} = {
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
function getEnterLeaveForKind(
  visitor: ASTVisitor,
  kind: Kind,
): EnterLeaveVisitor<ASTNode> {
  const kindVisitor:
    | ASTVisitFn<ASTNode>
    | EnterLeaveVisitor<ASTNode>
    | undefined = (visitor as any)[kind];
  if (typeof kindVisitor === 'object') {
    // { Kind: { enter() {}, leave() {} } }
    return kindVisitor;
  } else if (typeof kindVisitor === 'function') {
    // { Kind() {} }
    return { enter: kindVisitor, leave: undefined };
  }
  // { enter() {}, leave() {} }
  return { enter: (visitor as any).enter, leave: (visitor as any).leave };
}
const kindValues = new Set<string>(Object.keys(DocumentKeys));
function isNode(maybeNode: any): maybeNode is ASTNode {
  const maybeKind = maybeNode?.kind;
  return typeof maybeKind === 'string' && kindValues.has(maybeKind);
}
type ASTReducerFn<TReducedNode extends ASTNode, R> = (
  /** The current node being visiting. */
  node: {
    [K in keyof TReducedNode]: ReducedField<TReducedNode[K], R>;
  },
  /** The index or key to this node from the parent node or Array. */
  key: string | number | undefined,
  /** The parent immediately above this node, which may be an Array. */
  parent: ASTNode | ReadonlyArray<ASTNode> | undefined,
  /** The key path to get to this node from the root node. */
  path: ReadonlyArray<string | number>,
  /**
   * All nodes and Arrays visited before reaching parent of this node.
   * These correspond to array indices in `path`.
   * Note: ancestors includes arrays which contain the parent of visited node.
   */
  ancestors: ReadonlyArray<ASTNode | ReadonlyArray<ASTNode>>,
) => R;
type ReducedField<T, R> = T extends ASTNode
  ? R
  : T extends ReadonlyArray<ASTNode>
  ? ReadonlyArray<R>
  : T;
interface EnterLeaveVisitor<TVisitedNode extends ASTNode> {
  readonly enter?: ASTVisitFn<TVisitedNode> | undefined;
  readonly leave?: ASTVisitFn<TVisitedNode> | undefined;
}
/**
 * A KeyMap describes each the traversable properties of each kind of node.
 */
type ASTVisitorKeyMap = {
  [NodeT in ASTNode as NodeT['kind']]?: ReadonlyArray<keyof NodeT>;
};
export const BREAK: unknown = Object.freeze({});
/**
 * visit() will walk through an AST using a depth-first traversal, calling
 * the visitor's enter function at each node in the traversal, and calling the
 * leave function after visiting that node and all of its child nodes.
 *
 * NOTE: this version of visit has been modified from the upstream version
 * in graphql-js so that it memoizes arrays within the AST. Memoization can
 * also be added to individual nodes by passing memoizing visitor functions.
 *
 * By returning different values from the enter and leave functions, the
 * behavior of the visitor can be altered, including skipping over a sub-tree of
 * the AST (by returning false), editing the AST by returning a value or null
 * to remove the value, or to stop the whole traversal by returning BREAK.
 *
 * When using visit() to edit an AST, the original AST will not be modified, and
 * a new version of the AST with the changes applied will be returned from the
 * visit function.
 *
 * ```ts
 * const editedAST = visit(ast, {
 *   enter(node) {
 *     // @return
 *     //   undefined: no action
 *     //   false: skip visiting this node
 *     //   BREAK: stop visiting altogether
 *     //   null: delete this node
 *     //   any value: replace this node with the returned value
 *   },
 *   leave(node) {
 *     // @return
 *     //   undefined: no action
 *     //   false: no action
 *     //   BREAK: stop visiting altogether
 *     //   null: delete this node
 *     //   any value: replace this node with the returned value
 *   }
 * });
 * ```
 *
 * Alternatively to providing enter() and leave() functions, a visitor can
 * instead provide functions named the same as the kinds of AST nodes, or
 * enter/leave visitors at a named key, leading to three permutations of the
 * visitor API:
 *
 * 1) Named visitors triggered when entering a node of a specific kind.
 *
 * ```ts
 * visitWithMemo(ast, {
 *   Kind(node) {
 *     // enter the "Kind" node
 *   }
 * })
 * ```
 *
 * 2) Named visitors that trigger upon entering and leaving a node of a specific kind.
 *
 * ```ts
 * visitWithMemo(ast, {
 *   Kind: {
 *     enter(node) {
 *       // enter the "Kind" node
 *     }
 *     leave(node) {
 *       // leave the "Kind" node
 *     }
 *   }
 * })
 * ```
 *
 * 3) Generic visitors that trigger upon entering and leaving any node.
 *
 * ```ts
 * visitWithMemo(ast, {
 *   enter(node) {
 *     // enter any node
 *   },
 *   leave(node) {
 *     // leave any node
 *   }
 * })
 * ```
 */
export function visitWithMemo<N extends ASTNode>(
  root: N,
  visitor: ASTVisitor,
  visitorKeys?: ASTVisitorKeyMap,
): N;
export function visitWithMemo<R>(
  root: ASTNode,
  visitor: ASTReducer<R>,
  visitorKeys?: ASTVisitorKeyMap,
): R;
export function visitWithMemo(
  root: ASTNode,
  visitor: ASTVisitor | ASTReducer<any>,
  visitorKeys: ASTVisitorKeyMap = DocumentKeys,
): any {
  const enterLeaveMap = new Map<Kind, EnterLeaveVisitor<ASTNode>>();
  for (const kind of Object.values(Kind)) {
    enterLeaveMap.set(kind, getEnterLeaveForKind(visitor, kind));
  }
  /* eslint-disable no-undef-init */
  let stack: any = undefined;
  let inArray = Array.isArray(root);
  let keys: any = [root];
  let index = -1;
  let edits = new Map<string | number, any>();
  let node: any = root;
  let key: any = undefined;
  let parent: any = undefined;
  const path: any = [];
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
          let arr: Array<any> = emptyArray;
          for (let arrIndex = 0; arrIndex < node.length; arrIndex++) {
            const editValue = edits.get(arrIndex);
            if (editValue === undefined) {
              arr = appendToArray(arr, node[arrIndex]);
            } else if (editValue !== null) {
              arr = appendToArray(arr, editValue);
            }
          }
          node = arr;
        } else {
          let newNode = node;
          for (const [editKey, editValue] of edits) {
            newNode = updateNode(newNode, editKey as string, editValue);
          }
          node = newNode;
        }
      }
      index = stack.index;
      keys = stack.keys;
      edits = stack.edits;
      inArray = stack.inArray;
      stack = stack.prev;
    } else if (parent != null) {
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
      } else if (result !== undefined) {
        edits.set(key, result);
        if (!isLeaving) {
          if (isNode(result)) {
            node = result;
          } else {
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
    } else {
      stack = { inArray, index, keys, edits, prev: stack };
      inArray = Array.isArray(node);
      keys = inArray ? node : (visitorKeys as any)[node.kind] ?? [];
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
