import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, Kind } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import type { Stitch } from './Composer.ts';
import { Composer } from './Composer.ts';
export function execute(args: ExecutionArgs): PromiseOrValue<ExecutionResult> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { operation, planner, rawVariableValues, coercedVariableValues } =
    exeContext;
  const rootFieldPlan = planner.createRootFieldPlan(coercedVariableValues);
  if (rootFieldPlan instanceof GraphQLError) {
    return { data: null, errors: [rootFieldPlan] };
  }
  const stitches: Array<Stitch> = [];
  for (const [subschema, subschemaPlan] of rootFieldPlan.subschemaPlans) {
    const document: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: subschemaPlan.fieldNodes,
          },
        },
      ],
    };
    stitches.push({
      subschema,
      stitchTrees: rootFieldPlan.stitchTrees,
      initialResult: subschema.executor({
        document,
        variables: rawVariableValues,
      }),
    });
  }
  const composer = new Composer(
    stitches,
    rootFieldPlan.superSchema,
    rawVariableValues,
  );
  return composer.compose();
}
