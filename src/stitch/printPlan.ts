import type { SelectionNode, SelectionSetNode } from 'graphql';
import { Kind, print } from 'graphql';

import type { FieldPlan } from './FieldPlan';
import type { Subschema, SuperSchema } from './SuperSchema';

export function printPlan(plan: FieldPlan, indent = 0): string {
  const superSchema = plan.operationContext.superSchema;
  const entries = [];
  if (plan.selectionMap.size > 0) {
    entries.push(printMap(superSchema, plan.selectionMap, indent));
  }

  const subFieldPlans = Array.from(Object.entries(plan.subFieldPlans));
  if (subFieldPlans.length > 0) {
    entries.push(printSubFieldPlans(subFieldPlans, indent));
  }

  return entries.join('\n');
}

function printMap(
  superSchema: SuperSchema,
  selectionMap: ReadonlyMap<Subschema, ReadonlyArray<SelectionNode>>,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  let result = `${spaces}Map:\n`;
  result += Array.from(selectionMap.entries())
    .map(([subschema, selections]) =>
      printSubschemaSelections(superSchema, subschema, selections, indent + 2),
    )
    .join('\n');
  return result;
}

function printSubschemaSelections(
  superSchema: SuperSchema,
  subschema: Subschema,
  selections: ReadonlyArray<SelectionNode>,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  let result = '';
  result += `${spaces}Subschema ${superSchema.getSubschemaId(subschema)}:\n`;
  result += `${spaces}  `;
  result += printSelectionSet(
    {
      kind: Kind.SELECTION_SET,
      selections,
    },
    indent + 2,
  );
  return result;
}

function printSubFieldPlans(
  subFieldPlans: ReadonlyArray<[string, FieldPlan]>,
  indent: number,
): string {
  return subFieldPlans
    .map(([responseKey, subFieldPlan]) =>
      printSubFieldPlan(responseKey, subFieldPlan, indent),
    )
    .join('\n');
}

function printSubFieldPlan(
  responseKey: string,
  subFieldPlan: FieldPlan,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  let subFieldPlanEntry = '';
  subFieldPlanEntry += `${spaces}SubFieldPlan for '${responseKey}':\n`;
  subFieldPlanEntry += printPlan(subFieldPlan, indent + 2);
  return subFieldPlanEntry;
}

function printSelectionSet(
  selectionSet: SelectionSetNode,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  return print(selectionSet).split('\n').join(`\n${spaces}`);
}
