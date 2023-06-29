import type {
  DocumentNode,
  ExecutionResult,
  OperationDefinitionNode,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import type { SubschemaPlanResult } from './Composer.js';
import { Composer } from './Composer.js';
import type { SubschemaPlan } from './Planner.js';

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

  const subschemaPlanResults: Array<SubschemaPlanResult> = [];

  for (const subschemaPlan of rootFieldPlan.subschemaPlans) {
    subschemaPlanResults.push(
      toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues),
    );
  }

  const composer = new Composer(
    subschemaPlanResults,
    rootFieldPlan.superSchema,
    rawVariableValues,
  );

  return composer.compose();
}

function toSubschemaPlanResult(
  subschemaPlan: SubschemaPlan,
  operation: OperationDefinitionNode,
  rawVariableValues: { readonly [variable: string]: unknown } | undefined,
): SubschemaPlanResult {
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
    subschemaPlan,
    initialResult: subschemaPlan.toSubschema.executor({
      document,
      variables: rawVariableValues,
    }),
  };
}
