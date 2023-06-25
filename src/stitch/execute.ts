import type { DocumentNode, ExecutionResult } from 'graphql';
import { GraphQLError, Kind } from 'graphql';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import type { ExecutionArgs } from './buildExecutionContext.js';
import { buildExecutionContext } from './buildExecutionContext.js';
import { Composer } from './Composer.js';

export function execute(args: ExecutionArgs): PromiseOrValue<ExecutionResult> {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);

  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }

  const { operation, planner, rawVariableValues } = exeContext;

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
      ],
    };

    results.push(
      subschema.executor({
        document,
        variables: rawVariableValues,
      }),
    );
  }

  const composer = new Composer(results, rootFieldPlan, rawVariableValues);

  return composer.compose();
}
