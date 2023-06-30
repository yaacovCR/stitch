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
  pointer: Pointer | undefined;
}
interface CompositionContext {
  superSchema: SuperSchema;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
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
  const fields = Object.create(null);
  const context: CompositionContext = {
    superSchema,
    rawVariableValues,
    fields,
    errors: [],
    nulled: false,
    promiseAggregator: new PromiseAggregator(),
  };
  for (const subschemaPlanResult of subschemaPlanResults) {
    const { subschemaPlan, initialResult } = subschemaPlanResult;
    handleMaybeAsyncResult(
      context,
      undefined,
      fields,
      subschemaPlan,
      initialResult,
    );
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
  const fieldsOrNull = context.nulled ? null : context.fields;
  return context.errors.length > 0
    ? { data: fieldsOrNull, errors: context.errors }
    : { data: fieldsOrNull };
}
function handleMaybeAsyncResult(
  context: CompositionContext,
  pointer: Pointer | undefined,
  fields: ObjMap<unknown>,
  subschemaPlan: SubschemaPlan,
  initialResult: PromiseOrValue<ExecutionResult>,
): void {
  if (!isPromise(initialResult)) {
    handleResult(context, pointer, fields, subschemaPlan, initialResult);
    return;
  }
  const promise = initialResult.then(
    (resolved) =>
      handleResult(context, pointer, fields, subschemaPlan, resolved),
    (err) =>
      handleResult(context, pointer, fields, subschemaPlan, {
        data: null,
        errors: [new GraphQLError(err.message, { originalError: err })],
      }),
  );
  context.promiseAggregator.add(promise);
}
function handleResult(
  context: CompositionContext,
  pointer: Pointer | undefined,
  fields: ObjMap<unknown>,
  subschemaPlan: SubschemaPlan,
  result: ExecutionResult,
): void {
  if (result.errors != null) {
    context.errors.push(...result.errors);
  }
  if (pointer !== undefined) {
    if (pointer.parent[pointer.responseKey] === null) {
      return;
    }
  } else if (context.nulled) {
    return;
  }
  if (result.data == null) {
    if (pointer === undefined) {
      context.nulled = true;
    } else {
      pointer.parent[pointer.responseKey] = null;
      // TODO: null bubbling?
    }
    return;
  }
  for (const [key, value] of Object.entries(result.data)) {
    fields[key] = value;
  }
  if (subschemaPlan.stitchPlans !== undefined) {
    const stitchMap = new AccumulatorMap<Subschema, Stitch>();
    walkStitchPlans(context, stitchMap, result.data, subschemaPlan.stitchPlans);
    performStitches(context, stitchMap);
  }
}
function walkStitchPlans(
  context: CompositionContext,
  stitchMap: AccumulatorMap<Subschema, Stitch>,
  fields: ObjMap<unknown>,
  stitchPlans: ObjMap<StitchPlan>,
): void {
  for (const [key, stitchPlan] of Object.entries(stitchPlans)) {
    if (fields[key] !== undefined) {
      collectStitches(
        context,
        stitchMap,
        {
          parent: fields,
          responseKey: key,
        },
        fields[key] as ObjMap<unknown>,
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
      const subschemaPlan = stitch.subschemaPlan;
      const initialResult = subschema.executor({
        document: createDocument(stitch.subschemaPlan.fieldNodes),
        variables: context.rawVariableValues,
      });
      handleMaybeAsyncResult(
        context,
        stitch.pointer,
        stitch.target,
        subschemaPlan,
        initialResult,
      );
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
