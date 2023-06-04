'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.mapAsyncIterable = void 0;
const repeater_1 = require('@repeaterjs/repeater');
const isPromise_js_1 = require('../predicates/isPromise.js');
function mapAsyncIterable(iterable, fn) {
  return new repeater_1.Repeater(async (push, stop) => {
    const iter = iterable[Symbol.asyncIterator]();
    let finalIteration;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    stop.then(() => {
      finalIteration = typeof iter.return === 'function' ? iter.return() : true;
    });
    let thrown = false;
    let nextValue;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (finalIteration === undefined) {
      // safe race implementation
      let eventStream;
      if (thrown) {
        if (typeof iter.throw !== 'function') {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw nextValue;
        }
        thrown = false;
        eventStream = repeater_1.Repeater.race([iter.throw(nextValue), stop]);
      } else {
        eventStream = repeater_1.Repeater.race([iter.next(nextValue), stop]);
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
      const mapped = fn(possibleIteration.value);
      try {
        // eslint-disable-next-line no-await-in-loop
        nextValue = await push(mapped);
      } catch (err) {
        thrown = true;
        nextValue = err;
      }
    }
    if ((0, isPromise_js_1.isPromise)(finalIteration)) {
      await finalIteration;
    }
    return undefined;
  });
}
exports.mapAsyncIterable = mapAsyncIterable;
