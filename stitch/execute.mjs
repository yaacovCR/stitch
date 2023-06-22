import { GraphQLError, Kind } from 'graphql';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Composer } from './Composer.mjs';
export function execute(args) {
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
  const results = [];
  for (const [
    subschema,
    subschemaSelections,
  ] of rootFieldPlan.selectionMap.entries()) {
    const document = {
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
