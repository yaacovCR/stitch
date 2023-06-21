import type {
  FieldNode,
  FragmentSpreadNode,
  GraphQLCompositeType,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import {
  getNamedType,
  isAbstractType,
  isCompositeType,
  Kind,
  TypeNameMetaFieldDef,
} from 'graphql';

import { collectSubFields } from '../utilities/collectSubFields.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';

import { FieldPlan } from './FieldPlan.js';
import type {
  OperationContext,
  Subschema,
  SuperSchema,
} from './SuperSchema.js';

/**
 * @internal
 */
export class SubFieldPlan {
  operationContext: OperationContext;
  superSchema: SuperSchema;
  ownSelections: ReadonlyArray<SelectionNode>;
  otherSelections: ReadonlyArray<SelectionNode>;
  fieldPlans: Map<GraphQLObjectType, FieldPlan>;
  visitedFragments: Set<string>;
  subschema: Subschema;
  nested: number;

  constructor(
    operationContext: OperationContext,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    subschema: Subschema,
    nested: number,
  ) {
    this.operationContext = operationContext;
    this.superSchema = operationContext.superSchema;
    this.visitedFragments = new Set();
    this.subschema = subschema;
    this.nested = nested;

    const { ownSelections, otherSelections } = this._processSelections(
      parentType,
      selections,
    );
    this.ownSelections = ownSelections;
    this.otherSelections = otherSelections;

    let possibleTypes: ReadonlyArray<GraphQLObjectType>;
    if (isAbstractType(parentType)) {
      possibleTypes = this.superSchema.getPossibleTypes(parentType);
    } else {
      possibleTypes = [parentType];
    }

    this.fieldPlans = new Map<GraphQLObjectType, FieldPlan>();
    for (const type of possibleTypes) {
      const fieldNodes = collectSubFields(
        this.operationContext,
        type,
        otherSelections,
      );
      const fieldPlan = new FieldPlan(
        this.operationContext,
        type,
        fieldNodes,
        nested + 1,
      );
      if (
        fieldPlan.selectionMap.size > 0 ||
        Object.values(fieldPlan.subFieldPlans).length > 0
      ) {
        this.fieldPlans.set(type, fieldPlan);
      }
    }

    if (this.nested < 1 && this.fieldPlans.size > 0) {
      ownSelections.push({
        kind: Kind.FIELD,
        name: {
          kind: Kind.NAME,
          value: TypeNameMetaFieldDef.name,
        },
        alias: {
          kind: Kind.NAME,
          value: '__stitching__typename',
        },
      });
    }
  }

  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): {
    ownSelections: Array<SelectionNode>;
    otherSelections: Array<SelectionNode>;
  } {
    const ownSelections: Array<SelectionNode> = [];
    const otherSelections: Array<SelectionNode> = [];
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, ownSelections, otherSelections);
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
            ownSelections,
            otherSelections,
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
            ownSelections,
            otherSelections,
          );
          break;
        }
      }
    }
    return {
      ownSelections,
      otherSelections,
    };
  }

  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    ownSelections: Array<SelectionNode>,
    otherSelections: Array<SelectionNode>,
  ): void {
    const subschemaSetsByField =
      this.operationContext.superSchema.subschemaSetsByTypeAndField[
        parentType.name
      ];

    const subschemaSet = subschemaSetsByField[field.name.value];

    if (subschemaSet === undefined) {
      return;
    }

    if (!field.selectionSet) {
      if (subschemaSet.has(this.subschema)) {
        ownSelections.push(field);
      } else {
        otherSelections.push(field);
      }
      return;
    }

    const fieldName = field.name.value;
    const fieldDef = this.superSchema.getFieldDef(parentType, fieldName);

    if (!fieldDef) {
      return;
    }

    const fieldType = fieldDef.type;

    const subFieldPlan = new SubFieldPlan(
      this.operationContext,
      getNamedType(fieldType) as GraphQLObjectType,
      field.selectionSet.selections,
      this.subschema,
      this.nested,
    );

    if (subFieldPlan.ownSelections.length) {
      ownSelections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subFieldPlan.ownSelections,
        },
      });
    }

    if (subFieldPlan.otherSelections.length) {
      otherSelections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: subFieldPlan.otherSelections,
        },
      });
    }
  }

  _addFragment(
    parentType: GraphQLCompositeType,
    node: InlineFragmentNode | FragmentSpreadNode,
    selections: ReadonlyArray<SelectionNode>,
    ownSelections: Array<SelectionNode>,
    otherSelections: Array<SelectionNode>,
  ): void {
    const {
      ownSelections: fragmentOwnSelections,
      otherSelections: fragmentOtherSelections,
    } = this._processSelections(parentType, selections);

    if (fragmentOwnSelections.length > 0) {
      const splitFragment: InlineFragmentNode = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentOwnSelections,
        },
      };
      ownSelections.push(splitFragment);
    }

    if (fragmentOtherSelections.length > 0) {
      const splitFragment: InlineFragmentNode = {
        ...node,
        kind: Kind.INLINE_FRAGMENT,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentOtherSelections,
        },
      };
      otherSelections.push(splitFragment);
    }
  }
}