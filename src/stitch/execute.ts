import type {
  DocumentNode,
  ExecutionResult,
  OperationDefinitionNode,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import type { Stitch } from './Composer.js';
import { Composer } from './Composer.js';
import type { SubschemaPlan } from './Planner.js';
import type { Subschema } from './SuperSchema.js';

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
    stitches.push(
      toStitch(subschema, subschemaPlan, operation, rawVariableValues),
    );
  }

  const composer = new Composer(
    stitches,
    rootFieldPlan.superSchema,
    rawVariableValues,
  );

  return composer.compose();
}

function toStitch(
  subschema: Subschema,
  subschemaPlan: SubschemaPlan,
  operation: OperationDefinitionNode,
  rawVariableValues: { readonly [variable: string]: unknown } | undefined,
): Stitch {
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

  return {
    fromSubschema: subschema,
    stitchTrees: subschemaPlan.stitchTrees,
    initialResult: subschema.executor({
      document,
      variables: rawVariableValues,
    }),
  };
}
