/**
 * @internal
 */
export declare class PromiseAggregator {
  _promiseCount: number;
  _signal: Promise<void>;
  _trigger: () => void;
  constructor();
  _increment(): void;
  _decrement(): void;
  add(promise: Promise<void>): void;
  isEmpty(): boolean;
  resolved(): Promise<void>;
}
