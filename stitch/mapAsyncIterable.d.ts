import type { PromiseOrValue } from '../types/PromiseOrValue.js';
interface CustomAsyncIterable<T, R, N> {
  [Symbol.asyncIterator]: () => AsyncIterator<T, R, N>;
}
interface CustomAsyncIterableIterator<T, R, N> {
  [Symbol.asyncIterator]: () => AsyncIterator<T, R, N>;
  next: (...args: [] | [N]) => Promise<IteratorResult<T, R>>;
  return?: (
    value?: R | PromiseLike<R> | undefined,
  ) => Promise<IteratorResult<T, R>>;
  throw?: (e?: any) => Promise<IteratorResult<T, R>>;
}
/**
 * Given an AsyncIterable and a callback function, return an AsyncIterableIterator
 * which produces values mapped via calling the callback function.
 *
 * Provides a separate overload for AsyncGenerators which have non-optional
 * parameters of type TReturn, whereas AsyncIterables may have iterators
 * with optional parameters of type TReturn.
 */
export declare function mapAsyncIterable<T, U, R = undefined, N = void>(
  iterable: AsyncGenerator<T, R, N>,
  fn: (value: T) => PromiseOrValue<U>,
): AsyncGenerator<U, R, N>;
export declare function mapAsyncIterable<T, U, R, N>(
  iterable: CustomAsyncIterable<T, R, N>,
  fn: (value: T) => PromiseOrValue<U>,
): CustomAsyncIterableIterator<U, R, N>;
export {};
