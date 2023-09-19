'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.compose = void 0;
const graphql_1 = require('graphql');
const isPromise_js_1 = require('../predicates/isPromise.js');
const AccumulatorMap_js_1 = require('../utilities/AccumulatorMap.js');
const inspect_js_1 = require('../utilities/inspect.js');
const invariant_js_1 = require('../utilities/invariant.js');
const PromiseAggregator_js_1 = require('../utilities/PromiseAggregator.js');
function compose(subschemaPlanResults, superSchema, rawVariableValues) {
  const data = Object.create(null);
  const context = {
    superSchema,
    rawVariableValues,
    data,
    errors: [],
    promiseAggregator: new PromiseAggregator_js_1.PromiseAggregator(),
  };
  for (const subschemaPlanResult of subschemaPlanResults) {
    const { subschemaPlan, initialResult } = subschemaPlanResult;
    const stitch = {
      subschemaPlan,
      target: data,
      pointer: {
        parent: context,
        responseKey: 'data',
      },
    };
    handleMaybeAsyncResult(context, stitch, initialResult);
  }
  if (context.promiseAggregator.isEmpty()) {
    return buildResponse(context);
  }
  return context.promiseAggregator
    .resolved()
    .then(() => buildResponse(context));
}
exports.compose = compose;
function createDocument(selections) {
  return {
    kind: graphql_1.Kind.DOCUMENT,
    definitions: [
      {
        kind: graphql_1.Kind.OPERATION_DEFINITION,
        operation: graphql_1.OperationTypeNode.QUERY,
        selectionSet: {
          kind: graphql_1.Kind.SELECTION_SET,
          selections,
        },
      },
    ],
  };
}
function buildResponse(context) {
  const { data, errors } = context;
  return errors.length > 0 ? { data, errors } : { data };
}
function handleMaybeAsyncResult(context, stitch, initialResult) {
  if (!(0, isPromise_js_1.isPromise)(initialResult)) {
    handleResult(context, stitch, initialResult);
    return;
  }
  const promise = initialResult.then(
    (resolved) => handleResult(context, stitch, resolved),
    (err) =>
      handleResult(context, stitch, {
        data: null,
        errors: [
          new graphql_1.GraphQLError(err.message, { originalError: err }),
        ],
      }),
  );
  context.promiseAggregator.add(promise);
}
function handleResult(context, stitch, result) {
  if (result.errors != null) {
    context.errors.push(...result.errors);
  }
  const {
    subschemaPlan,
    target,
    pointer: { parent, responseKey },
  } = stitch;
  if (parent[responseKey] === null) {
    return;
  }
  if (result.data == null) {
    parent[responseKey] = null;
    // TODO: null bubbling?
    return;
  }
  for (const [key, value] of Object.entries(result.data)) {
    target[key] = value;
  }
  if (subschemaPlan.fieldTree !== undefined) {
    const stitchMap = new AccumulatorMap_js_1.AccumulatorMap();
    walkFieldTree(context, stitchMap, target, subschemaPlan.fieldTree);
    performStitches(context, stitchMap);
  }
}
function walkFieldTree(context, stitchMap, target, fieldTree) {
  for (const [responseKey, fieldPlansByType] of Object.entries(fieldTree)) {
    if (target[responseKey] !== undefined) {
      collectPossibleListStitches(
        context,
        stitchMap,
        {
          parent: target,
          responseKey,
        },
        fieldPlansByType,
      );
    }
  }
}
function collectPossibleListStitches(
  context,
  stitchMap,
  pointer,
  fieldPlansByType,
) {
  const { parent, responseKey } = pointer;
  const target = parent[responseKey];
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      collectStitches(
        context,
        stitchMap,
        {
          parent: target,
          responseKey: i,
        },
        fieldPlansByType,
      );
    }
    return;
  }
  collectStitches(context, stitchMap, pointer, fieldPlansByType);
}
function collectStitches(context, stitchMap, pointer, fieldPlansByType) {
  const { parent, responseKey } = pointer;
  const target = parent[responseKey];
  const newTarget = Object.create(null);
  let typeName;
  for (const [key, value] of Object.entries(target)) {
    if (key === '__stitching__typename') {
      typeName = value;
      continue;
    }
    newTarget[key] = value;
  }
  parent[responseKey] = newTarget;
  typeName != null ||
    (0, invariant_js_1.invariant)(
      false,
      `Missing entry '__stitching__typename' in response ${(0,
      inspect_js_1.inspect)(target)}.`,
    );
  const type = context.superSchema.getType(typeName);
  (0, graphql_1.isObjectType)(type) ||
    (0, invariant_js_1.invariant)(
      false,
      `Expected Object type, received '${typeName}'.`,
    );
  const fieldPlan = fieldPlansByType.get(type);
  fieldPlan !== undefined ||
    (0, invariant_js_1.invariant)(
      false,
      `Missing field plan for type '${typeName}'.`,
    );
  for (const subschemaPlan of fieldPlan.subschemaPlans) {
    const stitch = {
      subschemaPlan,
      pointer,
      target: newTarget,
    };
    stitchMap.add(subschemaPlan.toSubschema, stitch);
  }
  walkFieldTree(context, stitchMap, newTarget, fieldPlan.fieldTree);
}
function performStitches(context, stitchMap) {
  for (const [subschema, stitches] of stitchMap) {
    for (const stitch of stitches) {
      // TODO: batch subStitches by accessors
      // TODO: batch subStitches by subschema?
      const initialResult = subschema.executor({
        document: createDocument(stitch.subschemaPlan.fieldNodes),
        variables: context.rawVariableValues,
      });
      handleMaybeAsyncResult(context, stitch, initialResult);
    }
  }
}
