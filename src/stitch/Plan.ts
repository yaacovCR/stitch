import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import {
  getNamedType,
  Kind,
  print,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap';

import { inlineRootFragments } from '../utilities/inlineRootFragments.js';
import { invariant } from '../utilities/invariant.js';

import type { Subschema, SuperSchema } from './SuperSchema';

/**
 * @internal
 */
export class Plan {
  superSchema: SuperSchema;
  parentType: GraphQLCompositeType;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  map: Map<Subschema, Array<SelectionNode>>;
  subPlans: ObjMap<Plan>;

  constructor(
    superSchema: SuperSchema,
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
    fragmentMap: ObjMap<FragmentDefinitionNode>,
  ) {
    this.superSchema = superSchema;
    this.parentType = parentType;
    this.fragmentMap = fragmentMap;
    this.subPlans = Object.create(null);

    const inlinedSelections = inlineRootFragments(selections, fragmentMap);

    const splitSelections = this._splitSelections(
      parentType,
      inlinedSelections,
    );

    this.map = splitSelections;
  }

  _splitSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): Map<Subschema, Array<SelectionNode>> {
    const map = new Map<Subschema, Array<SelectionNode>>();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(
            parentType as GraphQLObjectType | GraphQLInterfaceType,
            selection,
            map,
          );
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? (this.superSchema.getType(typeName) as GraphQLCompositeType)
            : parentType;
          this._addInlineFragment(refinedType, selection, map);
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

    const fieldName = field.name.value;
    const fieldDef = this._getFieldDef(parentType, fieldName);

    if (!fieldDef) {
      return;
    }

    const fieldType = fieldDef.type;

    const fieldPlan = new Plan(
      this.superSchema,
      getNamedType(fieldType) as GraphQLObjectType,
      field.selectionSet.selections,
      this.fragmentMap,
    );

    const filteredSelections = fieldPlan.map.get(subschema);

    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: filteredSelections,
        },
      });
      fieldPlan.map.delete(subschema);
    }

    if (
      fieldPlan.map.size > 0 ||
      Object.values(fieldPlan.subPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;

      this.subPlans[responseKey] = fieldPlan;
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
  ): void {
    const splitSelections = this._splitSelections(
      parentType,
      fragment.selectionSet.selections,
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

  print(indent = 0): string {
    let result = '';
    const spaces = new Array(indent).fill(' ', 0, indent).join('');

    const mapEntries = Array.from(this.map.values()).map((selections, i) => {
      let mapEntry = '';
      mapEntry += `${spaces}Subschema ${i}:\n`;

      mapEntry += this._printSelectionSet(
        {
          kind: Kind.SELECTION_SET,
          selections,
        },
        indent,
      );
      return mapEntry;
    });

    if (mapEntries.length > 0) {
      result += `${spaces}Map:\n`;
    }

    const subPlanEntries = Array.from(Object.entries(this.subPlans)).map(
      ([responseKey, plan]) => {
        let subPlanEntry = '';
        subPlanEntry += `${spaces}SubPlan for '${responseKey}':\n`;
        subPlanEntry += plan.print(indent + 2);
        return subPlanEntry;
      },
    );

    result += [...mapEntries, ...subPlanEntries].join('\n');

    return result;
  }

  _printSelectionSet(selectionSet: SelectionSetNode, indent: number): string {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    return print(selectionSet)
      .split('\n')
      .map((line) => `${spaces}${line}`)
      .join('\n');
  }
}
