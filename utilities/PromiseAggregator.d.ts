import type { PromiseOrValue } from '../types/PromiseOrValue';
/**
 * @internal
 */
export declare class PromiseAggregator<TResolved, TError, TReturn> {
  _promiseCount: number;
  _promise: Promise<void>;
  _trigger: () => void;
  _returner: () => TReturn;
  constructor(returner: () => TReturn);
  _increment(): void;
  _decrement(): void;
  add(
    promise: Promise<TResolved>,
    onFulfilled: (resolved: TResolved) => void,
    onRejected: (err: TError) => void,
  ): void;
  return(): PromiseOrValue<TReturn>;
}
