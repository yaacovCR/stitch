import { inspect } from "./inspect.mjs";
/**
 * @internal
 */
export class PromiseAggregator {
    constructor() {
        this._promiseCount = 0;
        this._signal = new Promise((resolve) => (this._trigger = resolve));
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
    add(promise) {
        this._increment();
        promise.then(() => {
            this._decrement();
        }, (err) => {
            throw new Error(`Error thrown by aggregated promise: ${inspect(err)}`);
        });
    }
    isEmpty() {
        return this._promiseCount === 0;
    }
    resolved() {
        return this._signal;
    }
}
