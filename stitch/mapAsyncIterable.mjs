import { Repeater } from '@repeaterjs/repeater';
import { isPromise } from '../predicates/isPromise.mjs';
export function mapAsyncIterable(iterable, fn) {
  return new Repeater(async (push, stop) => {
    const iter = iterable[Symbol.asyncIterator]();
    let finalIteration;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    stop.then(() => {
      finalIteration = typeof iter.return === 'function' ? iter.return() : true;
    });
    let thrown = false;
    let nextValue;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!finalIteration) {
      // safe race implementation
      let eventStream;
      if (thrown) {
        if (typeof iter.throw !== 'function') {
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
      const mapped = fn(possibleIteration.value);
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
    return undefined;
  });
}
