import type { Push } from '@repeaterjs/repeater';
import type {
  DocumentNode,
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  FragmentDefinitionNode,
  IncrementalResult,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  SelectionNode,
  SubsequentIncrementalExecutionResult,
} from 'graphql';
import { GraphQLError, Kind } from 'graphql';

import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';

import { isAsyncIterable } from '../predicates/isAsyncIterable.js';
import { isDeferIncrementalResult } from '../predicates/isDeferResult.js';
import { isObjectLike } from '../predicates/isObjectLike.js';
import { isPromise } from '../predicates/isPromise.js';
import { Consolidator } from '../utilities/Consolidator.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';

import { mapAsyncIterable } from './mapAsyncIterable.js';
import type { Plan } from './Plan.js';
import type { Subschema } from './SuperSchema.js';

interface TaggedSubsequentIncrementalExecutionResult {
  path: Path;
  incrementalResult: SubsequentIncrementalExecutionResult;
}

type Path = ReadonlyArray<string | number>;

interface GraphQLData {
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator<
    ExecutionResult | ExperimentalIncrementalExecutionResults,
    GraphQLError,
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >;
}

interface Parent {
  [key: string | number]: unknown;
}

/**
 * @internal
 */
export class Executor {
  plan: Plan;
  operation: OperationDefinitionNode;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;

  _consolidator:
    | Consolidator<
        TaggedSubsequentIncrementalExecutionResult,
        SubsequentIncrementalExecutionResult
      >
    | undefined;

  _deferredResults: Map<string, Array<ObjMap<unknown>>>;

  constructor(
    plan: Plan,
    operation: OperationDefinitionNode,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  ) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this._deferredResults = new Map();
  }

  execute(): PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  > {
    const initialGraphQLData: GraphQLData = {
      fields: Object.create(null),
      errors: [],
      nulled: false,
      promiseAggregator: new PromiseAggregator(() =>
        this._buildResponse(initialGraphQLData),
      ),
    };

    for (const [
      subschema,
      subschemaSelections,
    ] of this.plan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });

      this._handleMaybeAsyncPossibleMultiPartResult(
        initialGraphQLData,
        undefined,
        initialGraphQLData.fields,
        result,
        [],
      );
    }

    return initialGraphQLData.promiseAggregator.return();
  }

  _createDocument(selections: Array<SelectionNode>): DocumentNode {
    return {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...this.operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections,
          },
        },
        ...this.fragments,
      ],
    };
  }

  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  > {
    const iteration = this.plan.selectionMap.entries().next();
    if (iteration.done) {
      const error = new GraphQLError('Could not route subscription.', {
        nodes: this.operation,
      });

      return { errors: [error] };
    }

    const [subschema, subschemaSelections] = iteration.value;

    const subscriber = subschema.subscriber;
    if (!subscriber) {
      const error = new GraphQLError(
        'Subschema is not configured to execute subscription operation.',
        { nodes: this.operation },
      );

      return { errors: [error] };
    }

    const document = this._createDocument(subschemaSelections);

    const result = subscriber({
      document,
      variables: this.rawVariableValues,
    });

    if (isPromise(result)) {
      return result.then((resolved) => this._handlePossibleStream(resolved));
    }
    return this._handlePossibleStream(result);
  }

  _buildResponse(
    initialGraphQLData: GraphQLData,
  ): ExecutionResult | ExperimentalIncrementalExecutionResults {
    const fieldsOrNull = initialGraphQLData.nulled
      ? null
      : initialGraphQLData.fields;

    if (this._consolidator !== undefined) {
      this._consolidator.close();

      const initialResult =
        initialGraphQLData.errors.length > 0
          ? {
              data: fieldsOrNull,
              errors: initialGraphQLData.errors,
              hasNext: true,
            }
          : { data: fieldsOrNull, hasNext: true };

      return {
        initialResult,
        subsequentResults: this._consolidator,
      };
    }

    return initialGraphQLData.errors.length > 0
      ? { data: fieldsOrNull, errors: initialGraphQLData.errors }
      : { data: fieldsOrNull };
  }

  _handleMaybeAsyncPossibleMultiPartResult<
    T extends PromiseOrValue<
      ExecutionResult | ExperimentalIncrementalExecutionResults
    >,
  >(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: T,
    path: Path,
  ): void {
    if (!isPromise(result)) {
      this._handlePossibleMultiPartResult(
        graphQLData,
        parent,
        fields,
        result,
        path,
      );
      return;
    }

    graphQLData.promiseAggregator.add(
      result,
      (resolved) =>
        this._handlePossibleMultiPartResult(
          graphQLData,
          parent,
          fields,
          resolved,
          path,
        ),
      (err) =>
        this._handlePossibleMultiPartResult(
          graphQLData,
          parent,
          fields,
          {
            data: null,
            errors: [new GraphQLError(err.message, { originalError: err })],
          },
          path,
        ),
    );
  }

  _handlePossibleMultiPartResult<
    T extends ExecutionResult | ExperimentalIncrementalExecutionResults,
  >(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: T,
    path: Path,
  ): void {
    if (!('initialResult' in result)) {
      this._handleInitialResult(graphQLData, parent, fields, result, path);
      return;
    }

    const { initialResult, subsequentResults } = result;

    this._handleInitialResult(graphQLData, parent, fields, initialResult, path);

    const taggedResults = mapAsyncIterable(
      subsequentResults,
      (incrementalResult) => ({
        path,
        incrementalResult,
      }),
    );

    if (this._consolidator === undefined) {
      this._consolidator = new Consolidator(
        [taggedResults],
        (taggedResult, push) =>
          this._handleIncrementalResult(taggedResult, push),
      );
      return;
    }

    this._consolidator.add(taggedResults);
  }

  _push(
    incrementalResult: SubsequentIncrementalExecutionResult,
    push: Push<SubsequentIncrementalExecutionResult>,
  ): void {
    push(incrementalResult).then(undefined, () => {
      /* ignore */
    });
  }

  _handleIncrementalResult(
    taggedResult: TaggedSubsequentIncrementalExecutionResult,
    push: Push<SubsequentIncrementalExecutionResult>,
  ): void {
    const { path, incrementalResult } = taggedResult;
    if (incrementalResult.incremental === undefined) {
      this._push(incrementalResult, push);
      return;
    }

    const newIncremental: Array<IncrementalResult> = [];

    for (const result of incrementalResult.incremental) {
      if (!isDeferIncrementalResult(result)) {
        newIncremental.push(result);
        continue;
      }

      const data = result.data;

      if (data == null) {
        newIncremental.push(result);
        continue;
      }

      let identifier: string | undefined;
      const newData = Object.create(null);
      for (const key of Object.keys(data)) {
        if (key !== '__deferredIdentifier__') {
          newData[key] = data[key];
          continue;
        }
        identifier = key;
      }

      const fullPath = result.path ? [...path, ...result.path] : path;

      if (identifier === undefined) {
        const subPlans = this._getSubPlans(result.path as Path);

        if (subPlans && Object.keys(subPlans).length > 0) {
          this._handleDeferredResult(newData, subPlans, push, fullPath);
        } else {
          newIncremental.push(result);
        }
        continue;
      }

      const key = fullPath.join();

      let deferredResults = this._deferredResults.get(key);
      if (deferredResults === undefined) {
        deferredResults = [newData];
        this._deferredResults.set(key, deferredResults);
      } else {
        deferredResults.push(newData);
      }

      const deferredSubschemas = this._getDeferredSubschemas(
        this.plan,
        fullPath,
      );

      if (
        deferredSubschemas &&
        deferredResults.length < deferredSubschemas.size
      ) {
        continue;
      }

      this._deferredResults.delete(key);

      for (const deferredResult of deferredResults) {
        for (const [deferredKey, value] of Object.entries(deferredResult)) {
          newData[deferredKey] = value;
        }
      }

      const subPlans = this._getSubPlans(fullPath);

      if (subPlans && Object.keys(subPlans).length > 0) {
        this._handleDeferredResult(newData, subPlans, push, fullPath);
      } else {
        newIncremental.push({
          ...result,
          data: newData,
          path: fullPath,
        });
      }
    }

    if (newIncremental.length === 0) {
      return undefined;
    }

    const newIncrementalResult = {
      ...incrementalResult,
      incremental: newIncremental,
    };

    if (this._deferredResults.size) {
      newIncrementalResult.hasNext = true;
    }

    this._push(newIncrementalResult, push);
  }

  _getDeferredSubschemas(
    plan: Plan,
    path: ReadonlyArray<string | number>,
  ): Set<Subschema> | undefined {
    let currentPlan = plan;
    const fieldPath = [...path];
    let key: string | number | undefined;
    while ((key = fieldPath.shift()) !== undefined) {
      if (typeof key === 'number') {
        continue;
      }
      currentPlan = currentPlan.subPlans[key];
    }

    if (currentPlan === undefined) {
      return undefined;
    }

    return currentPlan.deferredSubschemas;
  }

  _handleDeferredResult(
    data: ObjMap<unknown>,
    subPlans: ObjMap<Plan>,
    push: Push<SubsequentIncrementalExecutionResult>,
    path: Path,
  ): void {
    const graphQLData: GraphQLData = {
      fields: Object.create(null),
      errors: [],
      nulled: false,
      promiseAggregator: new PromiseAggregator(() => data),
    };

    this._executeSubPlans(graphQLData, data, subPlans, path);

    const newData = graphQLData.promiseAggregator.return() as ObjMap<unknown>;

    this._push(
      {
        incremental: [
          {
            data: newData,
            path,
          },
        ],
        hasNext: this._deferredResults.size > 0,
      },
      push,
    );
  }

  _getSubPlans(path: Path): ObjMap<Plan> | undefined {
    let subPlans = this.plan.subPlans;
    for (const key of path) {
      if (typeof key === 'number') {
        continue;
      }
      if (subPlans[key] === undefined) {
        return undefined;
      }
      subPlans = subPlans[key].subPlans;
    }
    return subPlans;
  }

  _handleInitialResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: ExecutionResult | InitialIncrementalExecutionResult,
    path: Path,
  ): void {
    if (result.errors != null) {
      graphQLData.errors.push(...result.errors);
    }

    const parentKey: string | number | undefined = path[path.length - 1];
    if (parent !== undefined) {
      if (parent[parentKey] === null) {
        return;
      }
    } else if (graphQLData.nulled) {
      return;
    }

    if (result.data == null) {
      if (parentKey === undefined) {
        graphQLData.nulled = true;
      } else if (parent) {
        parent[parentKey] = null;
        // TODO: null bubbling?
      }
      return;
    }

    for (const [key, value] of Object.entries(result.data)) {
      this._deepMerge(fields, key, value);
    }

    this._executeSubPlans(graphQLData, result.data, this.plan.subPlans, path);
  }

  _executeSubPlans(
    graphQLData: GraphQLData,
    fields: ObjMap<unknown>,
    subPlans: ObjMap<Plan>,
    path: Path,
  ): void {
    for (const [key, subPlan] of Object.entries(subPlans)) {
      if (fields[key]) {
        this._executePossibleListSubPlan(
          graphQLData,
          fields,
          fields[key] as ObjMap<unknown> | Array<unknown>,
          subPlan,
          [...path, key],
        );
      }
    }
  }

  _executePossibleListSubPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    plan: Plan,
    path: Path,
  ): void {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._executePossibleListSubPlan(
          graphQLData,
          fieldsOrList as unknown as Parent,
          fieldsOrList[i],
          plan,
          [...path, i],
        );
      }
      return;
    }

    this._executeSubPlan(graphQLData, parent, fieldsOrList, plan, path);
  }

  _executeSubPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fields: ObjMap<unknown>,
    plan: Plan,
    path: Path,
  ): void {
    for (const [
      subschema,
      subschemaSelections,
    ] of plan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });

      this._handleMaybeAsyncPossibleMultiPartResult(
        graphQLData,
        parent,
        fields,
        result,
        path,
      );
    }

    this._executeSubPlans(graphQLData, fields, plan.subPlans, path);
  }

  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void {
    if (
      !isObjectLike(fields[key]) ||
      !isObjectLike(value) ||
      Array.isArray(value)
    ) {
      fields[key] = value;
      return;
    }

    for (const [subKey, subValue] of Object.entries(value)) {
      const subFields = fields[key] as ObjMap<unknown>;
      this._deepMerge(subFields, subKey, subValue);
    }
  }

  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T> {
    if (isAsyncIterable(result)) {
      return mapAsyncIterable(result, (payload) => payload) as T;
    }

    return result;
  }
}
