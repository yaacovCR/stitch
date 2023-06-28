import type { FieldNode, GraphQLObjectType, SelectionSetNode } from 'graphql';
import { Kind, print } from 'graphql';

import type { FieldPlan, StitchTree, SubschemaPlan } from './Planner.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';

export function printPlan(
  plan: FieldPlan,
  indent = 0,
  type?: GraphQLObjectType | undefined,
): string {
  const superSchema = plan.superSchema;
  const entries = [];
  const stitchTrees = Array.from(Object.entries(plan.stitchTrees));
  if (plan.subschemaPlans.size > 0 || stitchTrees.length > 0) {
    const spaces = new Array(indent).fill(' ', 0, indent).join('');

    entries.push(
      `${spaces}${type === undefined ? 'Plan' : `For type '${type.name}'`}:`,
    );

    if (plan.subschemaPlans.size > 0) {
      entries.push(
        printSubschemaPlans(superSchema, plan.subschemaPlans, indent + 2),
      );
    }
    if (stitchTrees.length > 0) {
      entries.push(printStitchTrees(stitchTrees, indent + 2));
    }
  }

  return entries.join('\n');
}

function printSubschemaPlans(
  superSchema: SuperSchema,
  subschemaPlans: Map<Subschema, SubschemaPlan>,
  indent: number,
): string {
  return Array.from(subschemaPlans.entries())
    .map(([subschema, subschemaPlan]) =>
      printSubschemaPlan(superSchema, subschema, subschemaPlan, indent),
    )
    .join('\n');
}

function printSubschemaPlan(
  superSchema: SuperSchema,
  subschema: Subschema,
  subschemaPlan: SubschemaPlan,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  const entries = [];

  const stitchTrees = Object.entries(subschemaPlan.stitchTrees);
  if (subschemaPlan.fieldNodes.length > 0 || stitchTrees.length > 0) {
    entries.push(
      `${spaces}For Subschema: [${superSchema.getSubschemaId(subschema)}]`,
    );
  }

  if (subschemaPlan.fieldNodes.length > 0) {
    if (subschemaPlan.fromSubschema !== undefined) {
      entries.push(
        `${spaces}  From Subschema: [${superSchema.getSubschemaId(
          subschemaPlan.fromSubschema,
        )}]`,
      );
    }
    entries.push(
      printSubschemaFieldNodes(subschemaPlan.fieldNodes, indent + 2),
    );
  }

  if (stitchTrees.length > 0) {
    entries.push(printStitchTrees(stitchTrees, indent + 2));
  }
  return entries.join('\n');
}

function printSubschemaFieldNodes(
  fieldNodes: ReadonlyArray<FieldNode>,
  indent: number,
): string {
  const spaces = new Array(indent).fill(' ', 0, indent).join('');
  let result = '';
  result += `${spaces}FieldNodes:\n`;
  result += `${spaces}  `;
  result += printSelectionSet(
    {
      kind: Kind.SELECTION_SET,
      selections: fieldNodes,
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
  stitchTreeEntry += `${spaces}For key '${responseKey}':\n`;

  const entries = [];
  for (const [type, fieldPlan] of stitchTree.fieldPlans) {
    entries.push(printPlan(fieldPlan, indent + 2, type));
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
