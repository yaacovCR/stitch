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
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { inlineRootFragments } from '../utilities/inlineRootFragments.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { UniqueId } from '../utilities/UniqueId.mjs';
/**
 * @internal
 */
export class Plan {
  constructor(superSchema, parentType, selections, fragmentMap) {
    this.superSchema = superSchema;
    this.parentType = parentType;
    this.fragmentMap = fragmentMap;
    this.subPlans = Object.create(null);
    this.uniqueId = new UniqueId();
    const inlinedSelections = inlineRootFragments(selections, fragmentMap);
    const splitSelections = this._splitSelections(
      parentType,
      inlinedSelections,
    );
    this.map = splitSelections;
  }
  _splitSelections(parentType, selections) {
    const map = new AccumulatorMap();
    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD: {
          this._addField(parentType, selection, map);
          break;
        }
        case Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;
          isCompositeType(refinedType) ||
            invariant(false, `Invalid type condition ${inspect(refinedType)}`);
          this._addInlineFragment(refinedType, selection, map);
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
    return map;
  }
  _addField(parentType, field, map) {
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
      getNamedType(fieldType),
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
  _getSubschemaAndSelections(subschemas, map) {
    let selections;
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
  _getFieldDef(parentType, fieldName) {
    if (fieldName === '__typename') {
      return TypeNameMetaFieldDef;
    }
    isObjectType(parentType) ||
      isInterfaceType(parentType) ||
      invariant(false, `Invalid parent type ${inspect(parentType)}.`);
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
  _addInlineFragment(parentType, fragment, map) {
    const splitSelections = this._splitSelections(
      parentType,
      fragment.selectionSet.selections,
    );
    const defer = fragment.directives?.find(
      (directive) => directive.name.value === 'defer',
    );
    if (defer === undefined || splitSelections.size < 2) {
      this._addSplitFragments(fragment, splitSelections, map);
      return;
    }
    const identifier = `__identifier__${this.uniqueId.gen()}__${
      splitSelections.size
    }`;
    this._addModifiedSplitFragments(
      fragment,
      splitSelections,
      map,
      (selections) =>
        this._addIdentifier(
          selections,
          identifier,
          defer.arguments?.find((arg) => arg.name.value === 'if')?.value,
        ),
    );
  }
  _addSplitFragments(fragment, splitSelections, map) {
    for (const [fragmentSubschema, fragmentSelections] of splitSelections) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      map.add(fragmentSubschema, splitFragment);
    }
  }
  _addModifiedSplitFragments(fragment, splitSelections, map, toSelections) {
    for (const [fragmentSubschema, fragmentSelections] of splitSelections) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: toSelections(fragmentSelections),
        },
      };
      map.add(fragmentSubschema, splitFragment);
    }
  }
  _addIdentifier(selections, identifier, includeIf) {
    const identifierField = {
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
  print(indent = 0) {
    const entries = [];
    if (this.map.size > 0) {
      entries.push(this._printMap(indent));
    }
    const subPlans = Array.from(Object.entries(this.subPlans));
    if (subPlans.length > 0) {
      entries.push(this._printSubPlans(subPlans, indent));
    }
    return entries.join('\n');
  }
  _printMap(indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = `${spaces}Map:\n`;
    result += Array.from(this.map.entries())
      .map(([subschema, selections]) =>
        this._printSubschemaSelections(subschema, selections, indent + 2),
      )
      .join('\n');
    return result;
  }
  _printSubschemaSelections(subschema, selections, indent) {
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
  _printSubPlans(subPlans, indent) {
    return subPlans
      .map(([responseKey, subPlan]) =>
        this._printSubPlan(responseKey, subPlan, indent),
      )
      .join('\n');
  }
  _printSubPlan(responseKey, subPlan, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let subPlanEntry = '';
    subPlanEntry += `${spaces}SubPlan for '${responseKey}':\n`;
    subPlanEntry += subPlan.print(indent + 2);
    return subPlanEntry;
  }
  _printSelectionSet(selectionSet, indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    return print(selectionSet).split('\n').join(`\n${spaces}`);
  }
}
