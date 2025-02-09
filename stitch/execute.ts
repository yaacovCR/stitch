import type {
  DocumentNode,
  ExecutionResult,
  OperationDefinitionNode,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import type { SubschemaPlanResult } from './compose.ts';
import { compose } from './compose.ts';
import type { SubschemaPlan } from './Planner.ts';
export function execute(args: ExecutionArgs): PromiseOrValue<ExecutionResult> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { operation, planner, rawVariableValues, variableValues } = exeContext;
  const plan = planner.createRootPlan(variableValues);
  if (plan instanceof GraphQLError) {
    return { data: null, errors: [plan] };
  }
  const subschemaPlanResults: Array<SubschemaPlanResult> = [];
  for (const subschemaPlan of plan.subschemaPlans) {
    subschemaPlanResults.push(
      toSubschemaPlanResult(subschemaPlan, operation, rawVariableValues),
    );
  }
  return compose(subschemaPlanResults, plan.superSchema, rawVariableValues);
}
function toSubschemaPlanResult(
  subschemaPlan: SubschemaPlan,
  operation: OperationDefinitionNode,
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined,
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
