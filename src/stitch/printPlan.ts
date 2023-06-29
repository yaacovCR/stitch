import type { FieldNode, GraphQLObjectType, SelectionSetNode } from 'graphql';
import { Kind, print } from 'graphql';

import type { FieldPlan, StitchTree, SubschemaPlan } from './Planner.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';

function generateIndent(indent: number): string {
  return ' '.repeat(indent);
}

export function printPlan(
  plan: FieldPlan,
  indent = 0,
  type?: GraphQLObjectType | undefined,
): string {
  const superSchema = plan.superSchema;
  const entries = [];
  const stitchTrees = Object.entries(plan.stitchTrees);
  if (plan.subschemaPlans.size > 0 || stitchTrees.length > 0) {
    const spaces = generateIndent(indent);

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
  return [...subschemaPlans.entries()]
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
  const spaces = generateIndent(indent);
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
  const spaces = generateIndent(indent);
  return `${spaces}FieldNodes:\n${spaces}  ${printSelectionSet(
    {
      kind: Kind.SELECTION_SET,
      selections: fieldNodes,
    },
    indent + 2,
  )}`;
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
  const spaces = generateIndent(indent);
  const entries = [];
  entries.push(`${spaces}For key '${responseKey}':`);

  for (const [type, fieldPlan] of stitchTree.fieldPlans) {
    entries.push(printPlan(fieldPlan, indent + 2, type));
  }

  return entries.join('\n');
}

function printSelectionSet(
  selectionSet: SelectionSetNode,
  indent: number,
): string {
  const spaces = generateIndent(indent);
  return print(selectionSet).split('\n').join(`\n${spaces}`);
}
