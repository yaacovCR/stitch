import type { Push, Stop } from '@repeaterjs/repeater';
import { Repeater } from '@repeaterjs/repeater';
/**
 * @internal
 */
export declare class Consolidator<T, U> extends Repeater<U> {
  _asyncIterators: Set<AsyncIterator<T>>;
  _processor: (value: T) => U | undefined;
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
    processor?: (value: T) => U | undefined,
  );
  _resetSignal(): Promise<void>;
  close(): void;
  add(value: AsyncIterable<T>): void;
  _addAsyncIterator(asyncIterator: AsyncIterator<T>): Promise<void>;
}
