'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PromiseAggregator = void 0;
/**
 * @internal
 */
class PromiseAggregator {
  constructor(returner) {
    this._promiseCount = 0;
    this._promise = new Promise((resolve) => {
      this._trigger = resolve;
    });
    this._returner = returner;
  }
  _increment() {
    this._promiseCount++;
  }
  _decrement() {
    this._promiseCount--;
    if (this._promiseCount === 0) {
      this._trigger();
    }
  }
  add(promise, onFulfilled, onRejected) {
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
  return() {
    if (this._promiseCount === 0) {
      return this._returner();
    }
    return this._promise.then(() => this._returner());
  }
}
exports.PromiseAggregator = PromiseAggregator;
