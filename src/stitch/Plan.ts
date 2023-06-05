import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import {
  getNamedType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  Kind,
  print,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inlineRootFragments } from '../utilities/inlineRootFragments.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';

import type { Subschema, SuperSchema } from './SuperSchema';

/**
 * @internal
 */
export class Plan {
  superSchema: SuperSchema;
  parentType: GraphQLCompositeType;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  selectionMap: Map<Subschema, Array<SelectionNode>>;
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

    const selectionMap = this._processSelections(parentType, inlinedSelections);

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
              ? this.superSchema.getType(typeName)
              : parentType;

          invariant(
            isCompositeType(refinedType),
            `Invalid type condition ${inspect(refinedType)}`,
          );

          this._addInlineFragment(refinedType, selection, selectionMap);
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
    return selectionMap;
  }

  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];

    const subschemaSets = subschemaSetsByField[field.name.value];

    if (subschemaSets === undefined) {
      return;
    }

    const { subschema, selections } = this._getSubschemaAndSelections(
      Array.from(subschemaSets),
      selectionMap,
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

    const filteredSelections = fieldPlan.selectionMap.get(subschema);

    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: filteredSelections,
        },
      });
      fieldPlan.selectionMap.delete(subschema);
    }

    if (
      fieldPlan.selectionMap.size > 0 ||
      Object.values(fieldPlan.subPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;

      this.subPlans[responseKey] = fieldPlan;
    }
  }

  _getSubschemaAndSelections(
    subschemas: ReadonlyArray<Subschema>,
    selectionMap: Map<Subschema, Array<SelectionNode>>,
  ): {
    subschema: Subschema;
    selections: Array<SelectionNode>;
  } {
    let selections: Array<SelectionNode> | undefined;
    for (const subschema of subschemas) {
      selections = selectionMap.get(subschema);
      if (selections) {
        return { subschema, selections };
      }
    }

    selections = [];
    const subschema = subschemas[0];
    selectionMap.set(subschema, selections);
    return { subschema, selections };
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

    if (parentType === this.superSchema.mergedSchema.getQueryType()) {
      switch (fieldName) {
        case SchemaMetaFieldDef.name:
          return SchemaMetaFieldDef;
        case TypeMetaFieldDef.name:
          return TypeMetaFieldDef;
      }
    }
  }

  _addInlineFragment(
    parentType: GraphQLCompositeType,
    fragment: InlineFragmentNode,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void {
    const fragmentSelectionMap = this._processSelections(
      parentType,
      fragment.selectionSet.selections,
    );

    this._addFragmentSelectionMap(fragment, fragmentSelectionMap, selectionMap);
  }

  _addFragmentSelectionMap(
    fragment: InlineFragmentNode,
    fragmentSelectionMap: Map<Subschema, Array<SelectionNode>>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
  ): void {
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment: InlineFragmentNode = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }

  print(indent = 0): string {
    const entries = [];
    if (this.selectionMap.size > 0) {
      entries.push(this._printMap(indent));
    }

    const subPlans = Array.from(Object.entries(this.subPlans));
    if (subPlans.length > 0) {
      entries.push(this._printSubPlans(subPlans, indent));
    }

    return entries.join('\n');
  }

  _printMap(indent: number): string {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = `${spaces}Map:\n`;
    result += Array.from(this.selectionMap.entries())
      .map(([subschema, selections]) =>
        this._printSubschemaSelections(subschema, selections, indent + 2),
      )
      .join('\n');
    return result;
  }

  _printSubschemaSelections(
    subschema: Subschema,
    selections: ReadonlyArray<SelectionNode>,
    indent: number,
  ): string {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = '';
    result += `${spaces}Subschema ${this.superSchema.getSubschemaId(
      subschema,
    )}:\n`;
    result += `${spaces}  `;
    result += this._printSelectionSet(
      {
        kind: Kind.SELECTION_SET,
        selections,
      },
      indent + 2,
    );
    return result;
  }

  _printSubPlans(
    subPlans: ReadonlyArray<[string, Plan]>,
    indent: number,
  ): string {
    return subPlans
      .map(([responseKey, subPlan]) =>
        this._printSubPlan(responseKey, subPlan, indent),
      )
      .join('\n');
  }

  _printSubPlan(responseKey: string, subPlan: Plan, indent: number): string {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let subPlanEntry = '';
    subPlanEntry += `${spaces}SubPlan for '${responseKey}':\n`;
    subPlanEntry += subPlan.print(indent + 2);
    return subPlanEntry;
  }

  _printSelectionSet(selectionSet: SelectionSetNode, indent: number): string {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    return print(selectionSet).split('\n').join(`\n${spaces}`);
  }
}
