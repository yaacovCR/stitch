import { GraphQLError, Kind } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isObjectLike } from '../predicates/isObjectLike.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { PromiseAggregator } from '../utilities/PromiseAggregator.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
/**
 * @internal
 */
export class Executor {
  constructor(plan, operation, fragments, rawVariableValues) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
  }
  execute() {
    const initialGraphQLData = {
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
      this._handleMaybeAsyncResult(
        initialGraphQLData,
        undefined,
        initialGraphQLData.fields,
        result,
        [],
      );
    }
    return initialGraphQLData.promiseAggregator.return();
  }
  _createDocument(selections) {
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
  subscribe() {
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
  _buildResponse(initialGraphQLData) {
    const fieldsOrNull = initialGraphQLData.nulled
      ? null
      : initialGraphQLData.fields;
    return initialGraphQLData.errors.length > 0
      ? { data: fieldsOrNull, errors: initialGraphQLData.errors }
      : { data: fieldsOrNull };
  }
  _handleMaybeAsyncResult(graphQLData, parent, fields, result, path) {
    if (!isPromise(result)) {
      this._handleInitialResult(graphQLData, parent, fields, result, path);
      return;
    }
    graphQLData.promiseAggregator.add(
      result,
      (resolved) =>
        this._handleInitialResult(graphQLData, parent, fields, resolved, path),
      (err) =>
        this._handleInitialResult(
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
  _getSubPlans(path) {
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
  _handleInitialResult(graphQLData, parent, fields, result, path) {
    if (result.errors != null) {
      graphQLData.errors.push(...result.errors);
    }
    const parentKey = path[path.length - 1];
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
  _executeSubPlans(graphQLData, fields, subPlans, path) {
    for (const [key, subPlan] of Object.entries(subPlans)) {
      if (fields[key] !== undefined) {
        this._executePossibleListSubPlan(
          graphQLData,
          fields,
          fields[key],
          subPlan,
          [...path, key],
        );
      }
    }
  }
  _executePossibleListSubPlan(graphQLData, parent, fieldsOrList, plan, path) {
    if (Array.isArray(fieldsOrList)) {
      for (let i = 0; i < fieldsOrList.length; i++) {
        this._executePossibleListSubPlan(
          graphQLData,
          fieldsOrList,
          fieldsOrList[i],
          plan,
          [...path, i],
        );
      }
      return;
    }
    this._executeSubPlan(graphQLData, parent, fieldsOrList, plan, path);
  }
  _executeSubPlan(graphQLData, parent, fields, plan, path) {
    for (const [
      subschema,
      subschemaSelections,
    ] of plan.selectionMap.entries()) {
      const result = subschema.executor({
        document: this._createDocument(subschemaSelections),
        variables: this.rawVariableValues,
      });
      this._handleMaybeAsyncResult(graphQLData, parent, fields, result, path);
    }
    this._executeSubPlans(graphQLData, fields, plan.subPlans, path);
  }
  _deepMerge(fields, key, value) {
    if (
      !isObjectLike(fields[key]) ||
      !isObjectLike(value) ||
      Array.isArray(value)
    ) {
      fields[key] = value;
      return;
    }
    for (const [subKey, subValue] of Object.entries(value)) {
      const subFields = fields[key];
      this._deepMerge(subFields, subKey, subValue);
    }
  }
  _handlePossibleStream(result) {
    if (isAsyncIterable(result)) {
      return mapAsyncIterable(result, (payload) => payload);
    }
    return result;
  }
}
