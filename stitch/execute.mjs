import { GraphQLError, Kind } from 'graphql';
import { buildExecutionContext } from './buildExecutionContext.mjs';
import { Composer } from './Composer.mjs';
import { createFieldPlan } from './FieldPlan.mjs';
export function execute(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = buildExecutionContext(args);
  // Return early errors if execution context failed.
  if (!('operationContext' in exeContext)) {
    return { errors: exeContext };
  }
  const { operationContext, rawVariableValues } = exeContext;
  const { superSchema, operation, fragments } = operationContext;
  const rootType = superSchema.getRootType(operation.operation);
  if (rootType == null) {
    const error = new GraphQLError(
      `Schema is not configured to execute ${operation.operation} operation.`,
      { nodes: operation },
    );
    return { data: null, errors: [error] };
  }
  const fieldPlan = createFieldPlan(
    operationContext,
    rootType,
    operation.selectionSet.selections,
  );
  const results = [];
  for (const [
    subschema,
    subschemaSelections,
  ] of fieldPlan.selectionMap.entries()) {
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
    results,
    fieldPlan,
    fragments,
    rawVariableValues,
  );
  return composer.compose();
}
