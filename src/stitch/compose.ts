import type { DocumentNode, ExecutionResult, SelectionNode } from 'graphql';
import { GraphQLError, isObjectType, Kind, OperationTypeNode } from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isPromise } from '../predicates/isPromise.js';

import { AccumulatorMap } from '../utilities/AccumulatorMap.js';
import { inspect } from '../utilities/inspect.js';
import { invariant } from '../utilities/invariant.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';

import type { StitchPlan, SubschemaPlan } from './Planner.js';
import type { Subschema, SuperSchema } from './SuperSchema.js';

export interface SubschemaPlanResult {
  subschemaPlan: SubschemaPlan;
  initialResult: PromiseOrValue<ExecutionResult>;
}

interface Stitch {
  subschemaPlan: SubschemaPlan;
  target: ObjMap<unknown>;
  parent: ObjMap<unknown>;
  responseKey: string | number;
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
      parent: context as unknown as ObjMap<unknown>,
      responseKey: 'data',
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

  const { subschemaPlan, target, parent, responseKey } = stitch;

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
  target: ObjMap<unknown>,
  stitchPlans: ObjMap<StitchPlan>,
): void {
  for (const [responseKey, stitchPlan] of Object.entries(stitchPlans)) {
    if (target[responseKey] !== undefined) {
      collectPossibleListStitches(
        context,
        stitchMap,
        target,
        responseKey,
        stitchPlan,
      );
    }
  }
}

function collectPossibleListStitches(
  context: CompositionContext,
  stitchMap: AccumulatorMap<Subschema, Stitch>,
  parent: ObjMap<unknown>,
  responseKey: string | number,
  stitchPlan: StitchPlan,
): void {
  const target = parent[responseKey] as ObjMap<unknown>;
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      collectStitches(context, stitchMap, target, i, stitchPlan);
    }
    return;
  }

  collectStitches(context, stitchMap, parent, responseKey, stitchPlan);
}

function collectStitches(
  context: CompositionContext,
  stitchMap: AccumulatorMap<Subschema, Stitch>,
  parent: ObjMap<unknown>,
  responseKey: string | number,
  stitchPlan: StitchPlan,
): void {
  const target = parent[responseKey] as ObjMap<unknown>;

  const newTarget = Object.create(null);
  let typeName: string | null | undefined;
  for (const [key, value] of Object.entries(target)) {
    if (key === '__stitching__typename') {
      typeName = value as string;
      continue;
    }
    newTarget[key] = value;
  }
  parent[responseKey] = newTarget;

  invariant(
    typeName != null,
    `Missing entry '__stitching__typename' in response ${inspect(target)}.`,
  );

  const type = context.superSchema.getType(typeName);

  invariant(
    isObjectType(type),
    `Expected Object type, received '${typeName}'.`,
  );

  const fieldPlan = stitchPlan.get(type);

  invariant(
    fieldPlan !== undefined,
    `Missing field plan for type '${typeName}'.`,
  );

  for (const subschemaPlan of fieldPlan.subschemaPlans) {
    const stitch: Stitch = {
      subschemaPlan,
      parent,
      responseKey,
      target: newTarget,
    };
    stitchMap.add(subschemaPlan.toSubschema, stitch);
  }

  walkStitchPlans(context, stitchMap, newTarget, fieldPlan.stitchPlans);
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
