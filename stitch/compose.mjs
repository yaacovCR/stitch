import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';
import { isPromise } from '../predicates/isPromise.mjs';
import { AccumulatorMap } from '../utilities/AccumulatorMap.mjs';
import { inspect } from '../utilities/inspect.mjs';
import { invariant } from '../utilities/invariant.mjs';
import { PromiseAggregator } from '../utilities/PromiseAggregator.mjs';
export function compose(subschemaPlanResults, superSchema, rawVariableValues) {
  const data = Object.create(null);
  const context = {
    superSchema,
    rawVariableValues,
    data,
    errors: [],
    promiseAggregator: new PromiseAggregator(),
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
function createDocument(selections) {
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: OperationTypeNode.QUERY,
        selectionSet: {
          kind: Kind.SELECTION_SET,
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
  if (!isPromise(initialResult)) {
    handleResult(context, stitch, initialResult);
    return;
  }
  const promise = initialResult.then(
    (resolved) => handleResult(context, stitch, resolved),
    (err) =>
      handleResult(context, stitch, {
        data: null,
        errors: [new GraphQLError(err.message, { originalError: err })],
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
  if (subschemaPlan.stitchPlans !== undefined) {
    const stitchMap = new AccumulatorMap();
    walkStitchPlans(context, stitchMap, target, subschemaPlan.stitchPlans);
    performStitches(context, stitchMap);
  }
}
function walkStitchPlans(context, stitchMap, parent, stitchPlans) {
  for (const [responseKey, stitchPlan] of Object.entries(stitchPlans)) {
    if (parent[responseKey] !== undefined) {
      collectStitches(
        context,
        stitchMap,
        {
          parent,
          responseKey,
        },
        parent[responseKey],
        stitchPlan,
      );
    }
  }
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
function collectStitches(
  context,
  stitchMap,
  pointer,
  fieldsOrList,
  stitchPlan,
) {
  if (Array.isArray(fieldsOrList)) {
    for (let i = 0; i < fieldsOrList.length; i++) {
      collectStitches(
        context,
        stitchMap,
        {
          parent: fieldsOrList,
          responseKey: i,
        },
        fieldsOrList[i],
        stitchPlan,
      );
    }
    return;
  }
  const typeName = fieldsOrList.__stitching__typename;
  typeName != null ||
    invariant(
      false,
      `Missing entry '__stitching__typename' in response ${inspect(
        fieldsOrList,
      )}.`,
    );
  const type = context.superSchema.getType(typeName);
  isObjectType(type) ||
    invariant(false, `Expected Object type, received '${typeName}'.`);
  const fieldPlan = stitchPlan.get(type);
  fieldPlan !== undefined ||
    invariant(false, `Missing field plan for type '${typeName}'.`);
  for (const subschemaPlan of fieldPlan.subschemaPlans) {
    stitchMap.add(subschemaPlan.toSubschema, {
      subschemaPlan,
      pointer,
      target: fieldsOrList,
    });
  }
  walkStitchPlans(context, stitchMap, fieldsOrList, fieldPlan.stitchPlans);
}
