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

import type { ObjMap } from '../types/ObjMap';

import { inlineRootFragments } from '../utilities/inlineRootFragments.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';

import type { Subschema, SuperSchema } from './SuperSchema';

export interface OperationPartial {
  selections: Array<SelectionNode>;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
}

/**
 * @internal
 */
export class Plan {
  superSchema: SuperSchema;
  parentType: GraphQLCompositeType;
  fragmentMap: ObjMap<FragmentDefinitionNode>;
  operationPartials: Map<Subschema, OperationPartial>;
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

    this.operationPartials = this._getSplitOperationPartials(
      parentType,
      inlinedSelections,
    );
  }

  _getSplitOperationPartials(
    parentType: GraphQLCompositeType,
    selections: ReadonlyArray<SelectionNode>,
  ): Map<Subschema, OperationPartial> {
    const operationPartials = new Map<Subschema, OperationPartial>();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, operationPartials);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;

          invariant(
            isCompositeType(refinedType),
            `Invalid type condition ${inspect(refinedType)}`,
          );

          this._addInlineFragment(refinedType, selection, operationPartials);
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
    return operationPartials;
  }

  _addField(
    parentType: GraphQLCompositeType,
    field: FieldNode,
    operationPartials: Map<Subschema, OperationPartial>,
  ): void {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];

    const subschemaSets = subschemaSetsByField[field.name.value];

    if (!subschemaSets) {
      return;
    }

    const { subschema, operationPartial } = this._getSubschemaAndSelections(
      Array.from(subschemaSets),
      operationPartials,
    );

    if (!field.selectionSet) {
      operationPartial.selections.push(field);
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

    const filteredOperationPartials =
      fieldPlan.operationPartials.get(subschema);

    if (filteredOperationPartials) {
      operationPartial.selections.push({
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: filteredOperationPartials.selections,
        },
      });
      fieldPlan.operationPartials.delete(subschema);
    }

    if (
      fieldPlan.operationPartials.size > 0 ||
      Object.values(fieldPlan.subPlans).length > 0
    ) {
      const responseKey = field.alias?.value ?? field.name.value;

      this.subPlans[responseKey] = fieldPlan;
    }
  }

  _getSubschemaAndSelections(
    subschemas: ReadonlyArray<Subschema>,
    operationPartials: Map<Subschema, OperationPartial>,
  ): {
    subschema: Subschema;
    operationPartial: OperationPartial;
  } {
    let operationPartial: OperationPartial | undefined;
    for (const subschema of subschemas) {
      operationPartial = operationPartials.get(subschema);
      if (operationPartial) {
        return { subschema, operationPartial };
      }
    }

    operationPartial = { selections: [], fragmentMap: Object.create(null) };
    const subschema = subschemas[0];
    operationPartials.set(subschema, operationPartial);
    return { subschema, operationPartial };
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

    if (field) {
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
    operationPartials: Map<Subschema, OperationPartial>,
  ): void {
    const splitOperationPartials = this._getSplitOperationPartials(
      parentType,
      fragment.selectionSet.selections,
    );
    for (const [
      fragmentSubschema,
      fragmentOperationPartial,
    ] of splitOperationPartials) {
      const splitFragment: InlineFragmentNode = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentOperationPartial.selections,
        },
      };
      const operationPartial = operationPartials.get(fragmentSubschema);
      if (operationPartial) {
        operationPartial.selections.push(splitFragment);
      } else {
        operationPartials.set(fragmentSubschema, {
          selections: [splitFragment],
          fragmentMap: Object.create(null),
        });
      }
    }
  }

  print(indent = 0): string {
    const entries = [];
    if (this.operationPartials.size > 0) {
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
    result += Array.from(this.operationPartials.entries())
      .map(([subschema, operationPartials]) =>
        this._printSubschemaSelections(
          subschema,
          operationPartials.selections,
          indent + 2,
        ),
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
