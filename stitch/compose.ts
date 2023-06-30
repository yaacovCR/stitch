import type { DocumentNode, ExecutionResult, SelectionNode } from 'graphql';
import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';
import type { ObjMap } from '../types/ObjMap.ts';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import { isPromise } from '../predicates/isPromise.ts';
import { AccumulatorMap } from '../utilities/AccumulatorMap.ts';
import { inspect } from '../utilities/inspect.ts';
import { invariant } from '../utilities/invariant.ts';
import { PromiseAggregator } from '../utilities/PromiseAggregator.ts';
import type { StitchPlan, SubschemaPlan } from './Planner.ts';
import type { Subschema, SuperSchema } from './SuperSchema.ts';
export interface SubschemaPlanResult {
  subschemaPlan: SubschemaPlan;
  initialResult: PromiseOrValue<ExecutionResult>;
}
interface Pointer {
  parent: ObjMap<unknown>;
  responseKey: string | number;
}
interface Stitch {
  subschemaPlan: SubschemaPlan;
  target: ObjMap<unknown>;
  pointer: Pointer;
}
interface CompositionContext {
  superSchema: SuperSchema;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  data: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  promiseAggregator: PromiseAggregator;
}
export function compose(
  subschemaPlanResults: Array<SubschemaPlanResult>,
  superSchema: SuperSchema,
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined,
): PromiseOrValue<ExecutionResult> {
  const data = Object.create(null);
  const context: CompositionContext = {
    superSchema,
    rawVariableValues,
    data,
    errors: [],
    promiseAggregator: new PromiseAggregator(),
  };
  for (const subschemaPlanResult of subschemaPlanResults) {
    const { subschemaPlan, initialResult } = subschemaPlanResult;
    const stitch: Stitch = {
      subschemaPlan,
      target: data,
      pointer: {
        parent: context as unknown as ObjMap<unknown>,
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
function createDocument(
  selections: ReadonlyArray<SelectionNode>,
): DocumentNode {
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
function buildResponse(context: CompositionContext): ExecutionResult {
  const { data, errors } = context;
  return errors.length > 0 ? { data, errors } : { data };
}
function handleMaybeAsyncResult(
  context: CompositionContext,
  stitch: Stitch,
  initialResult: PromiseOrValue<ExecutionResult>,
): void {
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
function handleResult(
  context: CompositionContext,
  stitch: Stitch,
  result: ExecutionResult,
): void {
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
    const stitchMap = new AccumulatorMap<Subschema, Stitch>();
    walkStitchPlans(context, stitchMap, target, subschemaPlan.stitchPlans);
    performStitches(context, stitchMap);
  }
}
function walkStitchPlans(
  context: CompositionContext,
  stitchMap: AccumulatorMap<Subschema, Stitch>,
  parent: ObjMap<unknown>,
  stitchPlans: ObjMap<StitchPlan>,
): void {
  for (const [responseKey, stitchPlan] of Object.entries(stitchPlans)) {
    if (parent[responseKey] !== undefined) {
      collectStitches(
        context,
        stitchMap,
        {
          parent,
          responseKey,
        },
        parent[responseKey] as ObjMap<unknown>,
        stitchPlan,
      );
    }
  }
}
function performStitches(
  context: CompositionContext,
  stitchMap: Map<Subschema, ReadonlyArray<Stitch>>,
): void {
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
  context: CompositionContext,
  stitchMap: AccumulatorMap<Subschema, Stitch>,
  pointer: Pointer,
  fieldsOrList: ObjMap<unknown>,
  stitchPlan: StitchPlan,
): void {
  if (Array.isArray(fieldsOrList)) {
    for (let i = 0; i < fieldsOrList.length; i++) {
      collectStitches(
        context,
        stitchMap,
        {
          parent: fieldsOrList,
          responseKey: i,
        },
        fieldsOrList[i] as ObjMap<unknown>,
        stitchPlan,
      );
    }
    return;
  }
  const typeName = fieldsOrList.__stitching__typename as
    | string
    | undefined
    | null;
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
