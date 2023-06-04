import { Repeater } from '@repeaterjs/repeater';
import type { PromiseOrValue } from '../types/PromiseOrValue.ts';
import { isPromise } from '../predicates/isPromise.ts';
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
export function mapAsyncIterable<T, U, R = undefined, N = void>(
  iterable: AsyncGenerator<T, R, N>,
  fn: (value: T) => PromiseOrValue<U>,
): AsyncGenerator<U, R, N>;
export function mapAsyncIterable<T, U, R, N>(
  iterable: CustomAsyncIterable<T, R, N>,
  fn: (value: T) => PromiseOrValue<U>,
): CustomAsyncIterableIterator<U, R, N>;
export function mapAsyncIterable<T, U, R, N>(
  iterable: CustomAsyncIterable<T, R, N>,
  fn: (value: T) => PromiseOrValue<U>,
): CustomAsyncIterableIterator<U, R, N> {
  return new Repeater<U, R, N>(async (push, stop) => {
    const iter = iterable[Symbol.asyncIterator]();
    let finalIteration: PromiseOrValue<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    stop.then(() => {
      finalIteration = typeof iter.return === 'function' ? iter.return() : true;
    });
    let thrown = false;
    let nextValue: N | undefined;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (finalIteration === undefined) {
      // safe race implementation
      let eventStream: Repeater<IteratorResult<T> | undefined>;
      if (thrown) {
        if (typeof iter.throw !== 'function') {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw nextValue;
        }
        thrown = false;
        eventStream = Repeater.race([iter.throw(nextValue), stop]);
      } else {
        eventStream = Repeater.race([iter.next(nextValue as N), stop]);
      }
      // eslint-disable-next-line no-await-in-loop
      const possibleIteration = (await eventStream.next()).value;
      if (possibleIteration === undefined) {
        break;
      }
      if (possibleIteration.done === true) {
        stop();
        break;
      }
      const mapped = fn(possibleIteration.value as T);
      try {
        // eslint-disable-next-line no-await-in-loop
        nextValue = await push(mapped);
      } catch (err) {
        thrown = true;
        nextValue = err;
      }
    }
    if (isPromise(finalIteration)) {
      await finalIteration;
    }
    return undefined as R;
  });
}
