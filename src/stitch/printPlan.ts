import type { FieldNode, GraphQLObjectType, SelectionSetNode } from 'graphql';
import { Kind, print } from 'graphql';

import type { FieldPlan, RootPlan, SubschemaPlan } from './Planner.js';
import type { SuperSchema } from './SuperSchema.js';

function generateIndent(indent: number): string {
  return ' '.repeat(indent);
}

export function printPlan(
  plan: FieldPlan | RootPlan,
  indent = 0,
  type?: GraphQLObjectType  ,
): string {
  const superSchema = plan.superSchema;
  if (!('fieldTree' in plan)) {
    return '';
  }

  const entries = [];
  const fieldTree = Object.entries(plan.fieldTree);
  if (plan.subschemaPlans.length > 0 || fieldTree.length > 0) {
    const spaces = generateIndent(indent);

    entries.push(
      `${spaces}${type === undefined ? 'Plan' : `For type '${type.name}'`}:`,
    );

    if (plan.subschemaPlans.length > 0) {
      entries.push(
        printSubschemaPlans(superSchema, plan.subschemaPlans, indent + 2),
      );
    }
    if (fieldTree.length > 0) {
      entries.push(printFieldTree(fieldTree, indent + 2));
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

  const fieldTree = Object.entries(subschemaPlan.fieldTree);
  if (subschemaPlan.fieldNodes.length > 0 || fieldTree.length > 0) {
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

  if (fieldTree.length > 0) {
    entries.push(printFieldTree(fieldTree, indent + 2));
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

function printFieldTree(
  fieldTree: ReadonlyArray<[string, Map<GraphQLObjectType, FieldPlan>]>,
  indent: number,
): string {
  return fieldTree
    .map(([responseKey, fieldPlansByType]) =>
      printStitchPlan(responseKey, fieldPlansByType, indent),
    )
    .join('\n');
}

function printStitchPlan(
  responseKey: string,
  fieldPlansByType: Map<GraphQLObjectType, FieldPlan>,
  indent: number,
): string {
  const spaces = generateIndent(indent);
  const entries = [];
  entries.push(`${spaces}For key '${responseKey}':`);

  for (const [type, fieldPlan] of fieldPlansByType) {
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
