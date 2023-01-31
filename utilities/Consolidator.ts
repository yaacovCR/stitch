import type { Push, Stop } from '@repeaterjs/repeater';
import { Repeater } from '@repeaterjs/repeater';
/**
 * @internal
 */
export class Consolidator<T> extends Repeater<T> {
  _asyncIterators: Set<AsyncIterator<T>>;
  _push: Push<T> | undefined;
  _stop: Stop | undefined;
  _started: boolean;
  _stopped: boolean;
  _closed: boolean;
  _finalIteration: IteratorReturnResult<unknown> | undefined;
  _trigger!: () => void;
  _signal: Promise<void>;
  _advances: Map<
    AsyncIterator<T>,
    (value?: IteratorResult<unknown>) => unknown
  >;
  constructor(asyncIterables?: Array<AsyncIterable<T>>) {
    super(async (push, stop) => {
      this._push = push;
      this._stop = stop;
      this._started = true;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      stop.then(() => {
        this._stopped = true;
        for (const advance of this._advances.values()) {
          advance();
        }
      });
      // eslint-disable-next-line no-constant-condition
      while (true) {
        while (this._asyncIterators.size > 0) {
          const promises: Array<Promise<void>> = [];
          for (const asyncIterator of this._asyncIterators) {
            promises.push(this._addAsyncIterator(asyncIterator));
          }
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(promises);
        }
        if (this._closed) {
          stop();
          return this._finalIteration?.value;
        }
        // eslint-disable-next-line no-await-in-loop
        await this._signal;
        this._signal = this._resetSignal();
      }
    });
    this._asyncIterators = new Set();
    if (asyncIterables) {
      for (const asyncIterable of asyncIterables) {
        this._asyncIterators.add(asyncIterable[Symbol.asyncIterator]());
      }
    }
    this._started = false;
    this._stopped = false;
    this._closed = false;
    this._advances = new Map();
    this._signal = this._resetSignal();
  }
  _resetSignal(): Promise<void> {
    return new Promise<void>((resolve) => {
      this._trigger = resolve;
    });
  }
  close(): void {
    this._closed = true;
    if (this._started) {
      this._trigger();
    }
  }
  add(value: AsyncIterable<T>): void {
    if (this._closed) {
      return;
    }
    this._asyncIterators.add(value[Symbol.asyncIterator]());
    if (this._started) {
      this._trigger();
    }
  }
  async _addAsyncIterator(asyncIterator: AsyncIterator<T>): Promise<void> {
    try {
      while (!this._stopped) {
        asyncIterator.next().then(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (iteration) => this._advances.get(asyncIterator)!(iteration),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (err) => this._stop!(err),
        );
        const iteration: IteratorResult<unknown> | undefined =
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) =>
            this._advances.set(asyncIterator, resolve),
          );
        if (iteration !== undefined) {
          if (iteration.done) {
            this._finalIteration = iteration;
            return;
          }
          // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-non-null-assertion
          await this._push!(iteration.value as T);
        }
      }
    } finally {
      this._advances.delete(asyncIterator);
      this._asyncIterators.delete(asyncIterator);
      if (this._closed && this._asyncIterators.size === 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this._stop!();
      }
      await asyncIterator.return?.();
    }
  }
}
