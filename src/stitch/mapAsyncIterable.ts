import { Repeater } from '@repeaterjs/repeater';

import type { PromiseOrValue } from '../types/PromiseOrValue.js';

import { isPromise } from '../predicates/isPromise.js';

/**
 * Given an AsyncIterable and a callback function, return an AsyncGenerator
 * which produces values mapped via calling the callback function.
 */
export function mapAsyncIterable<T, U>(
  iterable: AsyncIterable<T>,
  fn: (value: T) => PromiseOrValue<U>,
): AsyncIterableIterator<U> {
  return new Repeater(async (push, stop) => {
    const iter = iterable[Symbol.asyncIterator]();
    let finalIteration: PromiseOrValue<unknown>;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    stop.then(() => {
      finalIteration = typeof iter.return === 'function' ? iter.return() : true;
    });

    let thrown = false;
    let nextValue;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!finalIteration) {
      // safe race implementation
      let eventStream: Repeater<IteratorResult<T> | undefined>;
      if (thrown) {
        if (!iter.throw || typeof iter.throw !== 'function') {
          throw nextValue;
        }
        thrown = false;
        eventStream = Repeater.race([iter.throw(nextValue), stop]);
      } else {
        eventStream = Repeater.race([iter.next(nextValue), stop]);
      }

      // eslint-disable-next-line no-await-in-loop
      const possibleIteration = (await eventStream.next()).value;

      if (possibleIteration === undefined) {
        break;
      }

      if (possibleIteration.done) {
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
  });
}
