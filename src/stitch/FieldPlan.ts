import type {
  FieldNode,
  FragmentSpreadNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import {
  getNamedType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';
import { memoize3 } from '../utilities/memoize3.js';

import { SubFieldPlan } from './SubFieldPlan.js';
import type { OperationContext, Subschema } from './SuperSchema.js';

export const createFieldPlan = memoize3(
  (
    operationContext: OperationContext,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ) => new FieldPlan(operationContext, parentType, selections),
);

/**
 * @internal
 */
export class FieldPlan {
  operationContext: OperationContext;
  parentType: GraphQLCompositeType;
  selectionMap: Map<Subschema, Array<SelectionNode>>;
  subFieldPlans: ObjMap<SubFieldPlan>;
  visitedFragments: Set<string>;

  constructor(
    operationContext: OperationContext,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ) {
    this.operationContext = operationContext;
    this.parentType = parentType;
    this.subFieldPlans = Object.create(null);
    this.visitedFragments = new Set();

    const selectionMap = this._processSelections(this.parentType, selections);
    this.selectionMap = selectionMap;
  }

  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): AccumulatorMap<Subschema, SelectionNode> {
    const selectionMap = new AccumulatorMap<Subschema, SelectionNode>();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, selectionMap);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.operationContext.superSchema.getType(typeName)
              : parentType;

          invariant(
            isCompositeType(refinedType),
            `Invalid type condition ${inspect(refinedType)}`,
          );

          this._addFragment(
            refinedType,
            selection,
            selection.selectionSet.selections,
            selectionMap,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          const fragmentName = selection.name.value;
          if (this.visitedFragments.has(fragmentName)) {
            continue;
          }

          this.visitedFragments.add(fragmentName);

          const fragment = this.operationContext.fragmentMap[fragmentName];

          const typeName = fragment.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.operationContext.superSchema.getType(typeName)
              : parentType;

          invariant(
            isCompositeType(refinedType),
            `Invalid type condition ${inspect(refinedType)}`,
          );

          this._addFragment(
            refinedType,
            selection,
            fragment.selectionSet.selections,
            selectionMap,
          );
          break;
        }
      }
    }
    return selectionMap;
  }

  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void {
    const subschemaSetsByField =
      this.operationContext.superSchema.subschemaSetsByTypeAndField[
        parentType.name
      ];

    const subschemaSets = subschemaSetsByField[field.name.value];

    if (subschemaSets === undefined) {
      return;
    }

    const subschema = this._getSubschema(subschemaSets, selectionMap);

    if (!field.selectionSet) {
      selectionMap.add(subschema, field);
      return;
    }

    const fieldName = field.name.value;
    const fieldDef = this._getFieldDef(parentType, fieldName);

    if (!fieldDef) {
      return;
    }

    const fieldType = fieldDef.type;

    const subFieldPlan = new SubFieldPlan(
      this.operationContext,
      getNamedType(fieldType) as GraphQLObjectType,
      field.selectionSet.selections,
      subschema,
    );

    if (subFieldPlan.ownSelections.length) {
      selectionMap.add(subschema, {
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subFieldPlan.ownSelections,
        },
      });
    }

    if (
      subFieldPlan.fieldPlans.size > 0 ||
      Object.values(subFieldPlan.subFieldPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;

      this.subFieldPlans[responseKey] = subFieldPlan;
    }
  }

  _getSubschema(
    subschemas: Set<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): Subschema {
    let selections: Array<SelectionNode> | undefined;
    for (const subschema of subschemas) {
      selections = selectionMap.get(subschema);
      if (selections) {
        return subschema;
      }
    }

    return subschemas.values().next().value as Subschema;
  }

  _getFieldDef(
    parentType: GraphQLCompositeType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined {
    if (fieldName === '__typename') {
      return TypeNameMetaFieldDef;
    }

    invariant(
      isObjectType(parentType) || isInterfaceType(parentType),
      `Invalid parent type ${inspect(parentType)}.`,
    );

    const fields = parentType.getFields();

    const field = fields[fieldName];

    if (field !== undefined) {
      return field;
    }

    if (
      parentType ===
      this.operationContext.superSchema.mergedSchema.getQueryType()
    ) {
      switch (fieldName) {
        case SchemaMetaFieldDef.name:
          return SchemaMetaFieldDef;
        case TypeMetaFieldDef.name:
          return TypeMetaFieldDef;
      }
    }
  }

  _addFragment(
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void {
    const fragmentSelectionMap = this._processSelections(
      parentType,
      selections,
    );

    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment: InlineFragmentNode = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
}
