import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  InlineFragmentNode,
  SelectionNode,
} from 'graphql';
import {
  getNamedType,
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap';

import { inlineRootFragments } from '../utilities/inlineRootFragments.js';
import { invariant } from '../utilities/invariant.js';

import type { Subschema, SuperSchema } from './SuperSchema';

export interface SubPlan {
  type: GraphQLOutputType;
  selectionsBySubschema: Map<Subschema, Array<SelectionNode>>;
}

/**
 * @internal
 */
export class Plan {
  superSchema: SuperSchema;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  map: Map<Subschema, Array<SelectionNode>>;
  subPlans: ObjMap<SubPlan>;

  constructor(
    superSchema: SuperSchema,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
  ) {
    this.superSchema = superSchema;
    this.fragmentMap = fragmentMap;
    this.subPlans = Object.create(null);

    const inlinedSelections = inlineRootFragments(selections, fragmentMap);

    const splitSelections = this._splitSelections(
      parentType,
      inlinedSelections,
      [],
    );

    this.map = splitSelections;
  }

  _splitSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    path: Array<string>,
  ): Map<Subschema, Array<SelectionNode>> {
    const map = new Map<Subschema, Array<SelectionNode>>();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(
            parentType as GraphQLObjectType | GraphQLInterfaceType,
            selection,
            map,
            [...path, selection.name.value],
          );
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? (this.superSchema.getType(typeName) as GraphQLCompositeType)
            : parentType;
          this._addInlineFragment(refinedType, selection, map, path);
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
    path: Array<string>,
  ): void {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];

    const subschemaSets = subschemaSetsByField[field.name.value];

    if (!subschemaSets) {
      return;
    }

    const { subschema, selections } = this._getSubschemaAndSelections(
      Array.from(subschemaSets),
      map,
    );

    if (!field.selectionSet) {
      selections.push(field);
      return;
    }

    const inlinedSelections = inlineRootFragments(
      field.selectionSet.selections,
      this.fragmentMap,
    );

    const fieldName = field.name.value;
    const fieldDef = this._getFieldDef(parentType, fieldName);

    if (!fieldDef) {
      return;
    }

    const fieldType = fieldDef.type;

    const splitSelections = this._splitSelections(
      getNamedType(fieldType) as GraphQLCompositeType,
      inlinedSelections,
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
      this.subPlans[path.join('.')] = {
        type: fieldType,
        selectionsBySubschema: splitSelections,
      };
    }
  }

  _getSubschemaAndSelections(
    subschemas: ReadonlyArray<Subschema>,
    map: Map<Subschema, Array<SelectionNode>>,
  ): {
    subschema: Subschema;
    selections: Array<SelectionNode>;
  } {
    let selections: Array<SelectionNode> | undefined;
    for (const subschema of subschemas) {
      selections = map.get(subschema);
      if (selections) {
        return { subschema, selections };
      }
    }

    selections = [];
    const subschema = subschemas[0];
    map.set(subschema, selections);
    return { subschema, selections };
  }

  _getFieldDef(
    parentType: GraphQLObjectType | GraphQLInterfaceType,
    fieldName: string,
  ): GraphQLField<any, any> | undefined {
    const fields = parentType.getFields();

    const field = fields[fieldName];

    if (field) {
      return field;
    }

    if (parentType === this.superSchema.mergedSchema.getQueryType()) {
      switch (fieldName) {
        case SchemaMetaFieldDef.name:
          return SchemaMetaFieldDef;
        case TypeMetaFieldDef.name:
          return TypeMetaFieldDef;
        case TypeNameMetaFieldDef.name:
          return TypeNameMetaFieldDef;
      }
    }
  }

  _addInlineFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
    map: Map<Subschema, Array<SelectionNode>>,
    path: Array<string>,
  ): void {
    const splitSelections = this._splitSelections(
      parentType,
      fragment.selectionSet.selections,
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