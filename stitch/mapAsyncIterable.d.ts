import type { PromiseOrValue } from '../types/PromiseOrValue.js';
/**
 * Given an AsyncIterable and a callback function, return an AsyncIterator
 * which produces values mapped via calling the callback function.
 */
export declare function mapAsyncIterable<T, U>(
  iterable: AsyncIterable<T> | AsyncIterableIterator<T>,
  callback: (value: T) => PromiseOrValue<U>,
): AsyncIterableIterator<U>;
