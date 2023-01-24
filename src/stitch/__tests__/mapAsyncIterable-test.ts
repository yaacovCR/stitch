import { expect } from 'chai';
import { describe, it } from 'mocha';

import { expectPromise } from '../../__testUtils__/expectPromise.js';
import { resolveOnNextTick } from '../../__testUtils__/resolveOnNextTick.js';

import { mapAsyncIterable } from '../mapAsyncIterable.js';

/* eslint-disable @typescript-eslint/require-await */
describe('mapAsyncIterable', () => {
  it('maps over async generator', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const doubles = mapAsyncIterable(source(), (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 6, done: false });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('maps over async iterable', async () => {
    const items = [1, 2, 3];

    const iterable = {
      [Symbol.asyncIterator]() {
        return this;
      },

      next(): Promise<IteratorResult<number, void>> {
        if (items.length > 0) {
          const value = items[0];
          items.shift();
          return Promise.resolve({ done: false, value });
        }

        return Promise.resolve({ done: true, value: undefined });
      },
    };

    const doubles = mapAsyncIterable(iterable, (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 6, done: false });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('compatible with for-await-of', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const doubles = mapAsyncIterable(source(), (x) => x + x);

    const result = [];
    for await (const x of doubles) {
      result.push(x);
    }
    expect(result).to.deep.equal([2, 4, 6]);
  });

  it('maps over async values with async function', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const doubles = mapAsyncIterable(source(), (x) => Promise.resolve(x + x));

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 6, done: false });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('allows returning early from mapped async generator', async () => {
    async function* source() {
      try {
        yield 1;
        /* c8 ignore next 3 */
        yield 2;
        yield 3; // Shouldn't be reached.
      } finally {
        // eslint-disable-next-line no-unsafe-finally
        return 'The End';
      }
    }

    const doubles = mapAsyncIterable(source(), (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Early return with parameter
    expect(await doubles.return?.('')).to.deep.equal({
      value: '',
      done: true,
    });

    // Subsequent next calls
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('allows returning early from mapped async iterable', async () => {
    const items = [1, 2, 3];

    const iterable = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        const value = items[0];
        items.shift();
        return Promise.resolve({
          done: items.length === 0,
          value,
        });
      },
    };

    const doubles = mapAsyncIterable(iterable, (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Early return with parameter
    expect(await doubles.return?.(0)).to.deep.equal({
      value: 0,
      done: true,
    });
  });

  it('does not pass through early return from async values', async () => {
    async function* source() {
      try {
        yield 'a';
        /* c8 ignore next 3 */
        yield 'b';
        yield 'c'; // Shouldn't be reached.
      } finally {
        yield 'Done';
        yield 'Last';
      }
    }

    const doubles = mapAsyncIterable(source(), (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 'aa', done: false });
    expect(await doubles.next()).to.deep.equal({ value: 'bb', done: false });

    // Early return without parameter
    expect(await doubles.return?.()).to.deep.equal({
      value: undefined,
      done: true,
    });

    // Subsequent next calls
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('handles early return from async iterable with throwing inner return', async () => {
    const items = [1, 2, 3];

    const iterable = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        const value = items[0];
        items.shift();
        return Promise.resolve({
          done: items.length === 0,
          value,
        });
      },
      return() {
        return Promise.reject(new Error('Ouch!'));
      },
    };

    const doubles = mapAsyncIterable(iterable, (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });

    await expectPromise(doubles.return?.()).toRejectWith('Ouch!');
  });

  it('handles early return from async iterable with pending next from inner iterator', async () => {
    let called = false;
    const iterable = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        if (called) {
          return new Promise<IteratorResult<string>>(() => {
            /* never resolve */
          });
        }
        called = true;
        return Promise.resolve({ done: false, value: 'a' });
      },
      return() {
        return Promise.reject(new Error('Ouch!'));
      },
    };

    const doubles = mapAsyncIterable(iterable, (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 'aa', done: false });

    const payload = doubles.next();

    // Wait for the inner iterator to be awaited
    await resolveOnNextTick();

    // Early return works anyway
    await expectPromise(doubles.return?.()).toRejectWith('Ouch!');

    expect(await payload).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('allows throwing errors through async iterable', async () => {
    const items = [1, 2, 3];

    const iterable = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        const value = items[0];
        items.shift();
        return Promise.resolve({
          done: items.length === 0,
          value,
        });
      },
    };

    const doubles = mapAsyncIterable(iterable, (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Throw error
    const message = 'allows throwing errors when mapping async iterable';
    const thrown = doubles.throw?.(new Error(message));
    await expectPromise(thrown).toRejectWith(message);
  });

  it('passes through caught errors through async generators', async () => {
    async function* source() {
      try {
        yield 1;
        /* c8 ignore next 2 */
        yield 2;
        yield 3; // Shouldn't be reached.
      } catch (e) {
        yield e;
      }
    }

    const doubles = mapAsyncIterable(source(), (x) => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Throw error
    expect(await doubles.throw?.('Ouch')).to.deep.equal({
      value: 'OuchOuch',
      done: false,
    });

    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('does not normally map over thrown errors', async () => {
    async function* source() {
      yield 'Hello';
      throw new Error('Goodbye');
    }

    const doubles = mapAsyncIterable(source(), (x) => x + x);

    expect(await doubles.next()).to.deep.equal({
      value: 'HelloHello',
      done: false,
    });

    await expectPromise(doubles.next()).toRejectWith('Goodbye');
  });

  async function testClosesSourceWithMapper<T>(mapper: (value: number) => T) {
    let didVisitFinally = false;

    async function* source() {
      try {
        yield 1;
        /* c8 ignore next 3 */
        yield 2;
        yield 3; // Shouldn't be reached.
      } finally {
        didVisitFinally = true;
        yield 1000;
      }
    }

    const throwOver1 = mapAsyncIterable(source(), mapper);

    expect(await throwOver1.next()).to.deep.equal({ value: 1, done: false });

    await expectPromise(throwOver1.next()).toRejectWith('Cannot count to 2');

    expect(await throwOver1.next()).to.deep.equal({
      value: undefined,
      done: true,
    });

    expect(didVisitFinally).to.equal(true);
  }

  it('closes source if mapper throws an error', async () => {
    await testClosesSourceWithMapper((x) => {
      if (x > 1) {
        throw new Error('Cannot count to ' + x);
      }
      return x;
    });
  });

  it('closes source if mapper rejects', async () => {
    await testClosesSourceWithMapper((x) =>
      x > 1
        ? Promise.reject(new Error('Cannot count to ' + x))
        : Promise.resolve(x),
    );
  });
});
