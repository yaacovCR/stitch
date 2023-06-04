import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLCompositeType,
  GraphQLField,
  GraphQLObjectType,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
  ValueNode,
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
import type { ObjMap } from '../types/ObjMap.ts';
import { AccumulatorMap } from '../utilities/AccumulatorMap.ts';
import { inlineRootFragments } from '../utilities/inlineRootFragments.ts';
import { inspect } from '../utilities/inspect.ts';
import { invariant } from '../utilities/invariant.ts';
import type { Subschema, SuperSchema } from './SuperSchema';
interface SelectionMetadata {
  selectionMap: AccumulatorMap<Subschema, SelectionNode>;
}
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
    const { selectionMap } = this._processSelections(
      parentType,
      inlinedSelections,
    );
    this.selectionMap = selectionMap;
  }
  _processSelections(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): SelectionMetadata {
    const selectionMetadata: SelectionMetadata = {
      selectionMap: new AccumulatorMap(),
    };
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, selectionMetadata);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType =
            typeName !== undefined
              ? this.superSchema.getType(typeName)
              : parentType;
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
          this._addInlineFragment(refinedType, selection, selectionMetadata);
          break;
        }
        case Kind.FRAGMENT_SPREAD: {
          // Not reached
          false ||
            invariant(
              false,
              'Fragment spreads should be inlined prior to selections being split!',
            );
        }
      }
    }
    return selectionMetadata;
  }
  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    selectionMetadata: SelectionMetadata,
  ): void {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (subschemaSets === undefined) {
      return;
    }
    const { subschema, selections } = this._getSubschemaAndSelections(
      Array.from(subschemaSets),
      selectionMetadata.selectionMap,
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
    isObjectType(parentType) ||
      isInterfaceType(parentType) ||
      invariant(false, `Invalid parent type ${inspect(parentType)}.`);
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
    selectionMetadata: SelectionMetadata,
  ): void {
    const fragmentSelectionMetadata = this._processSelections(
      parentType,
      fragment.selectionSet.selections,
    );
    this._addFragmentSelectionMap(
      fragment,
      fragmentSelectionMetadata.selectionMap,
      selectionMetadata.selectionMap,
    );
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
  _addModifiedFragmentSelectionMap(
    fragment: InlineFragmentNode,
    fragmentSelectionMap: Map<Subschema, Array<SelectionNode>>,
    selectionMap: AccumulatorMap<Subschema, SelectionNode>,
    toSelections: (
      originalSelections: ReadonlyArray<SelectionNode>,
    ) => Array<SelectionNode>,
  ): void {
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment: InlineFragmentNode = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: toSelections(fragmentSelections),
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
  _addIdentifier(
    selections: ReadonlyArray<SelectionNode>,
    identifier: string,
    includeIf: ValueNode | undefined,
  ): Array<SelectionNode> {
    const identifierField: FieldNode = {
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        value: '__typename',
      },
      alias: {
        kind: Kind.NAME,
        value: identifier,
      },
      directives: includeIf
        ? [
            {
              kind: Kind.DIRECTIVE,
              name: {
                kind: Kind.NAME,
                value: 'include',
              },
              arguments: [
                {
                  kind: Kind.ARGUMENT,
                  name: {
                    kind: Kind.NAME,
                    value: 'if',
                  },
                  value: includeIf,
                },
              ],
            },
          ]
        : undefined,
    };
    return [identifierField, ...selections];
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
