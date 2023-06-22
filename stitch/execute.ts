import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, Kind } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import type { ExecutionArgs } from './buildExecutionContext.ts';
import { buildExecutionContext } from './buildExecutionContext.ts';
import { Composer } from './Composer.ts';
export function execute(args: ExecutionArgs): PromiseOrValue<ExecutionResult> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { superSchema, operation, fragments, planner, rawVariableValues } =
    exeContext;
  const rootFieldPlan = planner.createRootFieldPlan();
  if (rootFieldPlan instanceof GraphQLError) {
    return { data: null, errors: [rootFieldPlan] };
  }
  const results: Array<PromiseOrValue<ExecutionResult>> = [];
  for (const [
    subschema,
    subschemaSelections,
  ] of rootFieldPlan.selectionMap.entries()) {
    const document: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: subschemaSelections,
          },
        },
        ...fragments,
      ],
    };
    results.push(
      subschema.executor({
        document,
        variables: rawVariableValues,
      }),
    );
  }
  const composer = new Composer(
    superSchema,
    results,
    rootFieldPlan,
    fragments,
    rawVariableValues,
  );
  return composer.compose();
}
