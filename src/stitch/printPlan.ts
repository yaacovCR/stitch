import type { SelectionNode, SelectionSetNode } from 'graphql';
import { Kind, print } from 'graphql';

import type { FieldPlan, StitchTree } from './Planner.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';

export function printPlan(plan: FieldPlan, indent = 0): string {
  const superSchema = plan.superSchema;
  const entries = [];
  if (plan.selectionMap.size > 0) {
    entries.push(printMap(superSchema, plan.selectionMap, indent));
  }

  const stitchTrees = Array.from(Object.entries(plan.stitchTrees));
  if (stitchTrees.length > 0) {
    entries.push(printStitchTrees(stitchTrees, indent));
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

function printStitchTrees(
  stitchTrees: ReadonlyArray<[string, StitchTree]>,
  indent: number,
): string {
  return stitchTrees
    .map(([responseKey, stitchTree]) =>
      printStitchTree(responseKey, stitchTree, indent),
    )
    .join('\n');
}

function printStitchTree(
  responseKey: string,
  stitchTree: StitchTree,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  let stitchTreeEntry = '';
  stitchTreeEntry += `${spaces}StitchTree for '${responseKey}':\n`;

  const entries = [];
  for (const [type, fieldPlan] of stitchTree.fieldPlans.entries()) {
    let entry = `${spaces}  Plan for type '${type.name}':\n`;
    entry += printPlan(fieldPlan, indent + 4);
    entries.push(entry);
  }

  stitchTreeEntry += entries.join('\n');
  return stitchTreeEntry;
}

function printSelectionSet(
  selectionSet: SelectionSetNode,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  return print(selectionSet).split('\n').join(`\n${spaces}`);
}
