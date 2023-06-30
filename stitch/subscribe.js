'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = void 0;
const graphql_1 = require('graphql');
const isAsyncIterable_js_1 = require('../predicates/isAsyncIterable.js');
const isPromise_js_1 = require('../predicates/isPromise.js');
const invariant_js_1 = require('../utilities/invariant.js');
const buildExecutionContext_js_1 = require('./buildExecutionContext.js');
const compose_js_1 = require('./compose.js');
const mapAsyncIterable_js_1 = require('./mapAsyncIterable.js');
function subscribe(args) {
  // If a valid execution context cannot be created due to incorrect arguments,
  // a "Response" with only errors is returned.
  const exeContext = (0, buildExecutionContext_js_1.buildExecutionContext)(
    args,
  );
  // Return early errors if execution context failed.
  if (!('planner' in exeContext)) {
    return { errors: exeContext };
  }
  const { operation, planner, rawVariableValues, coercedVariableValues } =
    exeContext;
  operation.operation === graphql_1.OperationTypeNode.SUBSCRIPTION ||
    (0, invariant_js_1.invariant)(false);
  const rootFieldPlan = planner.createRootFieldPlan(coercedVariableValues);
  if (rootFieldPlan instanceof graphql_1.GraphQLError) {
    return { errors: [rootFieldPlan] };
  }
  const subschemaPlan = rootFieldPlan.subschemaPlans[0];
  if (subschemaPlan === undefined) {
    const error = new graphql_1.GraphQLError('Could not route subscription.', {
      nodes: operation,
    });
    return { errors: [error] };
  }
  const subschema = subschemaPlan.toSubschema;
  const subscriber = subschema.subscriber;
  if (!subscriber) {
    const error = new graphql_1.GraphQLError(
      'Subschema is not configured to execute subscription operation.',
      { nodes: operation },
    );
    return { errors: [error] };
  }
  const document = {
    kind: graphql_1.Kind.DOCUMENT,
    definitions: [
      {
        ...operation,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections: subschemaPlan.fieldNodes,
        },
      },
    ],
  };
  const result = subscriber({
    document,
    variables: rawVariableValues,
  });
  if ((0, isPromise_js_1.isPromise)(result)) {
    return result.then((resolved) => {
      if ((0, isAsyncIterable_js_1.isAsyncIterable)(resolved)) {
        return (0, mapAsyncIterable_js_1.mapAsyncIterable)(
          resolved,
          (payload) =>
            (0, compose_js_1.compose)(
              [
                {
                  subschemaPlan,
                  initialResult: payload,
                },
              ],
              rootFieldPlan.superSchema,
              rawVariableValues,
            ),
        );
      }
      return result;
    });
  }
  if ((0, isAsyncIterable_js_1.isAsyncIterable)(result)) {
    return (0, mapAsyncIterable_js_1.mapAsyncIterable)(result, (payload) =>
      (0, compose_js_1.compose)(
        [
          {
            subschemaPlan,
            initialResult: payload,
          },
        ],
        rootFieldPlan.superSchema,
        rawVariableValues,
      ),
    );
  }
  return result;
}
exports.subscribe = subscribe;
