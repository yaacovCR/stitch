import { inspect } from './inspect.js';

/**
 * @internal
 */
export class PromiseAggregator {
  _promiseCount: number;
  _signal: Promise<void>;
  _trigger!: () => void;

  constructor() {
    this._promiseCount = 0;
    this._signal = new Promise<void>((resolve) => (this._trigger = resolve));
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

  add(promise: Promise<void>): void {
    this._increment();
    promise.then(
      () => {
        this._decrement();
      },
      (err) => {
        throw new Error(`Error thrown by aggregated promise: ${inspect(err)}`);
      },
    );
  }

  isEmpty(): boolean {
    return this._promiseCount === 0;
  }

  resolved(): Promise<void> {
    return this._signal;
  }
}
