import type { Push, Stop } from '@repeaterjs/repeater';
import { Repeater } from '@repeaterjs/repeater';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
/**
 * @internal
 */
export declare class Consolidator<T, U> extends Repeater<U> {
  _asyncIterators: Set<AsyncIterator<T>>;
  _processor: (value: T, push: Push<U>) => PromiseOrValue<void>;
  _push: Push<U> | undefined;
  _stop: Stop | undefined;
  _started: boolean;
  _stopped: boolean;
  _closed: boolean;
  _finalIteration: IteratorReturnResult<unknown> | undefined;
  _trigger: () => void;
  _signal: Promise<void>;
  _advances: Map<
    AsyncIterator<T>,
    (value?: IteratorResult<unknown>) => unknown
  >;
  constructor(
    asyncIterables?: Array<AsyncIterable<T>>,
    processor?: (value: T, push: Push<U>) => PromiseOrValue<void>,
  );
  _resetSignal(): Promise<void>;
  close(): void;
  add(value: AsyncIterable<T>): void;
  _addAsyncIterator(asyncIterator: AsyncIterator<T>): Promise<void>;
}
