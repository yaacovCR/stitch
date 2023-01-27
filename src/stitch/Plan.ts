import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import {
  getNamedType,
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap';

import { inlineRootFragments } from '../utilities/inlineRootFragments.js';
import { invariant } from '../utilities/invariant.js';

import type { OperationContext, Subschema, SuperSchema } from './SuperSchema';

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
export class Plan {
  superSchema: SuperSchema;
  operationContext: OperationContext;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  map: Map<Subschema, SubschemaPlan>;

  constructor(superSchema: SuperSchema, operationContext: OperationContext) {
    this.superSchema = superSchema;
    this.operationContext = operationContext;
    this.fragmentMap = operationContext.fragmentMap;
    this.map = new Map();

    const { operation, fragments, fragmentMap } = this.operationContext;
    const rootType = this.superSchema.getRootType(operation.operation);
    invariant(
      rootType !== undefined,
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
      subPlans,
      [],
    );

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

      this.map.set(subschema, {
        document,
        subPlans,
      });
    }
  }

  _splitSelectionSet(
    parentType: GraphQLCompositeType,
    selectionSet: SelectionSetNode,
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
            map,
            subPlans,
            [...path, selection.name.value],
          );
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? (this.superSchema.getType(typeName) as GraphQLCompositeType)
            : parentType;
          this._addInlineFragment(refinedType, selection, map, subPlans, path);
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          // Not reached
          invariant(
            false,
            'Fragment spreads should be inlined prior to selections being split!',
          );
        }
      }
    }
    return map;
  }

  _addField(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    field: FieldNode,
    map: Map<Subschema, Array<SelectionNode>>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): void {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];

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
        this.fragmentMap,
      );

      const fieldName = field.name.value;
      const fieldDef = this._getFieldDef(parentType, fieldName);
      if (fieldDef) {
        const fieldType = fieldDef.type;

        const splitSelections = this._splitSelectionSet(
          getNamedType(fieldType) as GraphQLCompositeType,
          inlinedSelectionSet,
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
      parentType === this.superSchema.mergedSchema.getQueryType()
    ) {
      return SchemaMetaFieldDef;
    }
    if (
      fieldName === TypeMetaFieldDef.name &&
      parentType === this.superSchema.mergedSchema.getQueryType()
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
    map: Map<Subschema, Array<SelectionNode>>,
    subPlans: ObjMap<SubPlan>,
    path: Array<string>,
  ): void {
    const splitSelections = this._splitSelectionSet(
      parentType,
      fragment.selectionSet,
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
