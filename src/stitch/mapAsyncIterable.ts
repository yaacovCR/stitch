import type { PromiseOrValue } from '../types/PromiseOrValue.js';

/**
 * Given an AsyncIterable and a callback function, return an AsyncIterator
 * which produces values mapped via calling the callback function.
 */
export function mapAsyncIterable<T, U>(
  iterable: AsyncIterable<T> | AsyncIterableIterator<T>,
  callback: (value: T) => PromiseOrValue<U>,
): AsyncIterableIterator<U> {
  const iterator = iterable[Symbol.asyncIterator]();

  async function mapResult(
    result: IteratorResult<T>,
  ): Promise<IteratorResult<U>> {
    if (result.done) {
      return result;
    }

    try {
      return { value: await callback(result.value), done: false };
    } catch (error) {
      /* c8 ignore start */
      // FIXME: add test case
      if (typeof iterator.return === 'function') {
        try {
          await iterator.return();
        } catch (_e) {
          /* ignore error */
        }
      }
      throw error;
      /* c8 ignore stop */
    }
  }

  return {
    async next() {
      return mapResult(await iterator.next());
    },
    async return(): Promise<IteratorResult<U>> {
      // If iterator.return() does not exist, then type R must be undefined.
      return typeof iterator.return === 'function'
        ? mapResult(await iterator.return())
        : { value: undefined as any, done: true };
    },
    async throw(error?: unknown) {
      if (typeof iterator.throw === 'function') {
        return mapResult(await iterator.throw(error));
      }
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
