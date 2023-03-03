'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Plan = void 0;
const graphql_1 = require('graphql');
const AccumulatorMap_js_1 = require('../utilities/AccumulatorMap.js');
const inlineRootFragments_js_1 = require('../utilities/inlineRootFragments.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
/**
 * @internal
 */
class Plan {
  constructor(superSchema, parentType, selections, fragmentMap) {
    this.superSchema = superSchema;
    this.parentType = parentType;
    this.fragmentMap = fragmentMap;
    this.subPlans = Object.create(null);
    const inlinedSelections = (0, inlineRootFragments_js_1.inlineRootFragments)(
      selections,
      fragmentMap,
    );
    const { selectionMap, deferredSubschemas } = this._processSelections(
      parentType,
      inlinedSelections,
    );
    this.selectionMap = selectionMap;
    this.deferredSubschemas = deferredSubschemas;
  }
  _processSelections(parentType, selections) {
    const selectionMetadata = {
      selectionMap: new AccumulatorMap_js_1.AccumulatorMap(),
      deferredSubschemas: new Set(),
    };
    for (const selection of selections) {
      switch (selection.kind) {
        case graphql_1.Kind.FIELD: {
          this._addField(parentType, selection, selectionMetadata);
          break;
        }
        case graphql_1.Kind.INLINE_FRAGMENT: {
          const typeName = selection.typeCondition?.name.value;
          const refinedType = typeName
            ? this.superSchema.getType(typeName)
            : parentType;
          (0, graphql_1.isCompositeType)(refinedType) ||
            (0, invariant_js_1.invariant)(
              false,
              `Invalid type condition ${(0, inspect_js_1.inspect)(
                refinedType,
              )}`,
            );
          this._addInlineFragment(refinedType, selection, selectionMetadata);
          break;
        }
        case graphql_1.Kind.FRAGMENT_SPREAD: {
          // Not reached
          false ||
            (0, invariant_js_1.invariant)(
              false,
              'Fragment spreads should be inlined prior to selections being split!',
            );
        }
      }
    }
    return selectionMetadata;
  }
  _addField(parentType, field, selectionMetadata) {
    const subschemaSetsByField =
      this.superSchema.subschemaSetsByTypeAndField[parentType.name];
    const subschemaSets = subschemaSetsByField[field.name.value];
    if (!subschemaSets) {
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
      (0, graphql_1.getNamedType)(fieldType),
      field.selectionSet.selections,
      this.fragmentMap,
    );
    const filteredSelections = fieldPlan.selectionMap.get(subschema);
    if (filteredSelections) {
      selections.push({
        ...field,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
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
  _getSubschemaAndSelections(subschemas, selectionMap) {
    let selections;
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
  _getFieldDef(parentType, fieldName) {
    if (fieldName === '__typename') {
      return graphql_1.TypeNameMetaFieldDef;
    }
    (0, graphql_1.isObjectType)(parentType) ||
      (0, graphql_1.isInterfaceType)(parentType) ||
      (0, invariant_js_1.invariant)(
        false,
        `Invalid parent type ${(0, inspect_js_1.inspect)(parentType)}.`,
      );
    const fields = parentType.getFields();
    const field = fields[fieldName];
    if (field) {
      return field;
    }
    if (parentType === this.superSchema.mergedSchema.getQueryType()) {
      switch (fieldName) {
        case graphql_1.SchemaMetaFieldDef.name:
          return graphql_1.SchemaMetaFieldDef;
        case graphql_1.TypeMetaFieldDef.name:
          return graphql_1.TypeMetaFieldDef;
      }
    }
  }
  _addInlineFragment(parentType, fragment, selectionMetadata) {
    const fragmentSelectionMetadata = this._processSelections(
      parentType,
      fragment.selectionSet.selections,
    );
    const defer = fragment.directives?.find(
      (directive) => directive.name.value === 'defer',
    );
    if (defer === undefined) {
      this._addFragmentSelectionMap(
        fragment,
        fragmentSelectionMetadata.selectionMap,
        selectionMetadata.selectionMap,
      );
    } else {
      for (const deferredSubschema of fragmentSelectionMetadata.selectionMap.keys()) {
        selectionMetadata.deferredSubschemas.add(deferredSubschema);
      }
      const identifier = '__deferredIdentifier__';
      this._addModifiedFragmentSelectionMap(
        fragment,
        fragmentSelectionMetadata.selectionMap,
        selectionMetadata.selectionMap,
        (selections) =>
          this._addIdentifier(
            selections,
            identifier,
            defer.arguments?.find((arg) => arg.name.value === 'if')?.value,
          ),
      );
    }
    for (const deferredSubschema of fragmentSelectionMetadata.deferredSubschemas) {
      selectionMetadata.deferredSubschemas.add(deferredSubschema);
    }
  }
  _addFragmentSelectionMap(fragment, fragmentSelectionMap, selectionMap) {
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: fragmentSelections,
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
  _addModifiedFragmentSelectionMap(
    fragment,
    fragmentSelectionMap,
    selectionMap,
    toSelections,
  ) {
    for (const [
      fragmentSubschema,
      fragmentSelections,
    ] of fragmentSelectionMap) {
      const splitFragment = {
        ...fragment,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: toSelections(fragmentSelections),
        },
      };
      selectionMap.add(fragmentSubschema, splitFragment);
    }
  }
  _addIdentifier(selections, identifier, includeIf) {
    const identifierField = {
      kind: graphql_1.Kind.FIELD,
      name: {
        kind: graphql_1.Kind.NAME,
        value: '__typename',
      },
      alias: {
        kind: graphql_1.Kind.NAME,
        value: identifier,
      },
      directives: includeIf
        ? [
            {
              kind: graphql_1.Kind.DIRECTIVE,
              name: {
                kind: graphql_1.Kind.NAME,
                value: 'include',
              },
              arguments: [
                {
                  kind: graphql_1.Kind.ARGUMENT,
                  name: {
                    kind: graphql_1.Kind.NAME,
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
    if (this.selectionMap.size > 0) {
      entries.push(this._printMap(indent));
    }
    if (this.deferredSubschemas.size > 0) {
      entries.push(this._printDeferredSubschemas(indent));
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
    result += Array.from(this.selectionMap.entries())
      .map(([subschema, selections]) =>
        this._printSubschemaSelections(subschema, selections, indent + 2),
      )
      .join('\n');
    return result;
  }
  _printDeferredSubschemas(indent) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');
    let result = `${spaces}Deferred: `;
    result += Array.from(this.deferredSubschemas.values())
      .map(
        (subschema) =>
          `Subschema ${this.superSchema.getSubschemaId(subschema)}`,
      )
      .join(', ');
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
        kind: graphql_1.Kind.SELECTION_SET,
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
    return (0, graphql_1.print)(selectionSet).split('\n').join(`\n${spaces}`);
  }
}
exports.Plan = Plan;
