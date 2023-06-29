import type { FieldNode, GraphQLObjectType, SelectionSetNode } from 'graphql';
import { Kind, print } from 'graphql';

import type { FieldPlan, StitchPlan, SubschemaPlan } from './Planner.js';
import type { SuperSchema } from './SuperSchema.js';

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
  const stitchPlans = Object.entries(plan.stitchPlans);
  if (plan.subschemaPlans.length > 0 || stitchPlans.length > 0) {
    const spaces = generateIndent(indent);

    entries.push(
      `${spaces}${type === undefined ? 'Plan' : `For type '${type.name}'`}:`,
    );

    if (plan.subschemaPlans.length > 0) {
      entries.push(
        printSubschemaPlans(superSchema, plan.subschemaPlans, indent + 2),
      );
    }
    if (stitchPlans.length > 0) {
      entries.push(printStitchPlans(stitchPlans, indent + 2));
    }
  }

  return entries.join('\n');
}

function printSubschemaPlans(
  superSchema: SuperSchema,
  subschemaPlans: ReadonlyArray<SubschemaPlan>,
  indent: number,
): string {
  return subschemaPlans
    .map((subschemaPlan) =>
      printSubschemaPlan(superSchema, subschemaPlan, indent),
    )
    .join('\n');
}

function printSubschemaPlan(
  superSchema: SuperSchema,
  subschemaPlan: SubschemaPlan,
  indent: number,
): string {
  const spaces = generateIndent(indent);
  const entries = [];

  const stitchPlans = Object.entries(subschemaPlan.stitchPlans);
  if (subschemaPlan.fieldNodes.length > 0 || stitchPlans.length > 0) {
    entries.push(
      `${spaces}For Subschema: [${superSchema.getSubschemaId(
        subschemaPlan.toSubschema,
      )}]`,
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

  if (stitchPlans.length > 0) {
    entries.push(printStitchPlans(stitchPlans, indent + 2));
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

function printStitchPlans(
  stitchPlans: ReadonlyArray<[string, StitchPlan]>,
  indent: number,
): string {
  return stitchPlans
    .map(([responseKey, stitchPlan]) =>
      printStitchPlan(responseKey, stitchPlan, indent),
    )
    .join('\n');
}

function printStitchPlan(
  responseKey: string,
  stitchPlan: StitchPlan,
  indent: number,
): string {
  const spaces = generateIndent(indent);
  const entries = [];
  entries.push(`${spaces}For key '${responseKey}':`);

  for (const [type, fieldPlan] of stitchPlan) {
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
