import { GraphQLError, Kind } from 'graphql';
import { isAsyncIterable } from '../predicates/isAsyncIterable.mjs';
import { isPromise } from '../predicates/isPromise.mjs';
import { Consolidator } from '../utilities/Consolidator.mjs';
import { mapAsyncIterable } from './mapAsyncIterable.mjs';
/**
 * @internal
 */
export class PlanResult {
  constructor(plan, operation, fragments, rawVariableValues) {
    this.plan = plan;
    this.operation = operation;
    this.fragments = fragments;
    this.rawVariableValues = rawVariableValues;
    this._data = Object.create(null);
    this._nullData = false;
    this._errors = [];
  }
  execute() {
    for (const [subschema, subschemaSelections] of this.plan.map.entries()) {
      const document = {
        kind: Kind.DOCUMENT,
        definitions: [
          {
            ...this.operation,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: subschemaSelections,
            },
          },
          ...this.fragments,
        ],
      };
      const result = subschema.executor({
        document,
        variables: this.rawVariableValues,
      });
      if (isPromise(result)) {
        const promiseContext = this._incrementPromiseContext();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        result.then((resolved) => {
          promiseContext.promiseCount--;
          this._handlePossibleMultiPartResult(resolved);
          if (promiseContext.promiseCount === 0) {
            promiseContext.trigger();
          }
        });
      } else {
        this._handlePossibleMultiPartResult(result);
      }
    }
    return this._promiseContext !== undefined
      ? this._promiseContext.promise.then(() => this._return())
      : this._return();
  }
  _incrementPromiseContext() {
    if (this._promiseContext) {
      this._promiseContext.promiseCount++;
      return this._promiseContext;
    }
    let trigger;
    const promiseCount = 1;
    const promise = new Promise((resolve) => {
      trigger = resolve;
    });
    const promiseContext = {
      promiseCount,
      promise,
      trigger,
    };
    this._promiseContext = promiseContext;
    return promiseContext;
  }
  subscribe() {
    const iteration = this.plan.map.entries().next();
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
    const document = {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...this.operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: subschemaSelections,
          },
        },
        ...this.fragments,
      ],
    };
    const result = subscriber({
      document,
      variables: this.rawVariableValues,
    });
    if (isPromise(result)) {
      return result.then((resolved) => this._handlePossibleStream(resolved));
    }
    return this._handlePossibleStream(result);
  }
  _return() {
    const dataOrNull = this._nullData ? null : this._data;
    if (this._consolidator !== undefined) {
      this._consolidator.close();
      const initialResult =
        this._errors.length > 0
          ? { data: dataOrNull, errors: this._errors, hasNext: true }
          : { data: dataOrNull, hasNext: true };
      return {
        initialResult,
        subsequentResults: this._consolidator,
      };
    }
    return this._errors.length > 0
      ? { data: dataOrNull, errors: this._errors }
      : { data: dataOrNull };
  }
  _handlePossibleMultiPartResult(result) {
    if ('initialResult' in result) {
      this._handleSingleResult(result.initialResult);
      if (this._consolidator === undefined) {
        this._consolidator = new Consolidator([result.subsequentResults]);
      } else {
        this._consolidator.add(result.subsequentResults);
      }
    } else {
      this._handleSingleResult(result);
    }
  }
  _handleSingleResult(result) {
    if (result.errors != null) {
      this._errors.push(...result.errors);
    }
    if (this._nullData) {
      return;
    }
    if (result.data == null) {
      this._nullData = true;
      return;
    }
    Object.assign(this._data, result.data);
  }
  _handlePossibleStream(result) {
    if (isAsyncIterable(result)) {
      return mapAsyncIterable(result, (payload) => payload);
    }
    return result;
  }
}
