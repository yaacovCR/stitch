import type { PromiseOrValue } from '../types/PromiseOrValue';

/**
 * @internal
 */
export class PromiseAggregator<TResolved, TError, TReturn> {
  _promiseCount: number;
  _promise: Promise<void>;
  _trigger!: () => void;
  _returner: () => TReturn;

  constructor(returner: () => TReturn) {
    this._promiseCount = 0;
    this._promise = new Promise<void>((resolve) => {
      this._trigger = resolve;
    });
    this._returner = returner;
  }

  _increment(): void {
    this._promiseCount++;
  }

  _decrement(): void {
    this._promiseCount--;

    if (this._promiseCount === 0) {
      this._trigger();
    }
  }

  add(
    promise: Promise<TResolved>,
    onFulfilled: (resolved: TResolved) => void,
    onRejected: (err: TError) => void,
  ): void {
    this._increment();
    promise.then(
      (resolved) => {
        onFulfilled(resolved);
        this._decrement();
      },
      (err) => {
        onRejected(err);
        this._decrement();
      },
    );
  }

  return(): PromiseOrValue<TReturn> {
    if (this._promiseCount === 0) {
      return this._returner();
    }
    return this._promise.then(() => this._returner());
  }
}
