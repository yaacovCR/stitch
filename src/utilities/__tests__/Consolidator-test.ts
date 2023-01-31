// adapted from https://github.com/repeaterjs/repeater/blob/219a0c8faf2c2768d234ecfe8dd21d455a4a98fe/packages/repeater/src/__tests__/combinators.ts

import { Repeater } from '@repeaterjs/repeater';
import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import type { SinonFakeTimers } from 'sinon';
import { spy, useFakeTimers } from 'sinon';

import { expectPromise } from '../../__testUtils__/expectPromise.js';

import { Consolidator } from '../Consolidator.js';

// eslint-disable-next-line @typescript-eslint/require-await
async function* gen<T>(
  values: Array<T>,
  returned: T,
): AsyncIterableIterator<T> {
  for (const value of values) {
    yield value;
  }
  return returned;
}

async function* deferredGen<T>(
  values: Array<T>,
  returned: T,
): AsyncIterableIterator<T> {
  for (const value of values) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
    yield value;
  }
  return returned;
}

export async function* hangingGen<T = never>(): AsyncGenerator<T> {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise(() => {});
  /* c8 ignore next 2 */
  yield Infinity as unknown as T;
}

function delayRepeater<T>(
  wait: number,
  values: Array<T>,
  returned?: T,
  error?: Error,
): Repeater<T> {
  return new Repeater<T>(async (push, stop) => {
    let i = 0;
    const timer = setInterval(() => {
      if (i >= values.length) {
        stop(error);
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(values[i++]);
    }, wait);
    await stop;
    clearInterval(timer);
    return returned;
  });
}

async function expectValues<T, R>(
  asyncIterator: AsyncIterator<T>,
  expectedValues: Array<T>,
  expectedReturnValue: R,
): Promise<void> {
  const values: Array<T> = [];
  let result: IteratorResult<T>;
  do {
    // eslint-disable-next-line no-await-in-loop
    result = await asyncIterator.next();
    if (result.done) {
      expect(result.value).to.deep.equal(expectedReturnValue);
    } else {
      values.push(result.value);
    }
  } while (!result.done);
  expect(values).to.deep.equal(expectedValues);
}

describe('Consolidator', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it('empty', async () => {
    const consolidator = new Consolidator();
    consolidator.close();
    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('empty calling stop after next', async () => {
    const consolidator = new Consolidator();
    const iteration = consolidator.next();
    consolidator.close();
    expect(await iteration).to.deep.equal({ done: true, value: undefined });
  });

  it('empty calling add after stop', async () => {
    const consolidator = new Consolidator();
    const iteration = consolidator.next();
    consolidator.close();
    consolidator.add(delayRepeater(100, [1, 2, 3], 4));
    expect(await iteration).to.deep.equal({ done: true, value: undefined });
  });

  it('single iterator', async () => {
    const consolidator = new Consolidator([delayRepeater(100, [1, 2, 3], 4)]);
    consolidator.close();

    const values = expectValues(consolidator, [1, 2, 3], 4);
    clock.tick(1000);
    await values;

    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('single iterator calling add after next', async () => {
    const consolidator = new Consolidator<number>();

    const iteration = consolidator.next();

    consolidator.add(delayRepeater(100, [1, 2, 3], 4));
    consolidator.close();

    const values = expectValues(consolidator, [2, 3], 4);
    await clock.tickAsync(1000);
    await values;

    expect(await iteration).to.deep.equal({ done: false, value: 1 });
    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('generator vs deferred generator', async () => {
    const consolidator = new Consolidator([
      gen([1, 2, 3, 4, 5], 6),
      deferredGen([10, 20, 30, 40, 50], 60),
    ]);
    consolidator.close();

    await expectValues(consolidator, [1, 10, 2, 20, 3, 30, 4, 40, 5, 50], 60);
    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('generator vs later deferred generator', async () => {
    const consolidator = new Consolidator([gen([1, 2, 3, 4, 5], 6)]);

    consolidator.add(deferredGen([10, 20, 30, 40, 50], 60));
    consolidator.close();

    await expectValues(consolidator, [1, 10, 2, 20, 3, 30, 4, 40, 5, 50], 60);
    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('deferred generator vs generator', async () => {
    const consolidator = new Consolidator([
      deferredGen([10, 20, 30, 40, 50], 60),
      gen([1, 2, 3, 4, 5], 6),
    ]);
    consolidator.close();

    await expectValues(consolidator, [1, 10, 2, 20, 3, 30, 4, 40, 5, 50], 60);
    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('deferred generator vs later generator', async () => {
    const consolidator = new Consolidator([deferredGen([10, 20, 30, 40, 50], 60)]);

    consolidator.add(gen([1, 2, 3, 4, 5], 6));
    consolidator.close();

    await expectValues(consolidator, [1, 10, 2, 20, 3, 30, 4, 40, 5, 50], 60);
    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('slow repeater vs fast repeater', async () => {
    const consolidator = new Consolidator([
      delayRepeater(160, [0, 1, 2, 3, 4], -2),
      delayRepeater(100, [100, 101, 102, 103, 104, 105], -3),
    ]);
    consolidator.close();

    const values = expectValues(
      consolidator,
      [100, 0, 101, 102, 1, 103, 2, 104, 105, 3, 4],
      -2,
    );
    await clock.tickAsync(1000);
    await values;

    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('return methods called on all iterators when parent return called', async () => {
    const iter1 = delayRepeater(100, [1]);
    const iter2 = delayRepeater(10000, [2]);
    const iter3 = new Repeater<number>(() => {
      /* no-op */
    });
    const spy1 = spy(iter1, 'return');
    const spy2 = spy(iter2, 'return');
    const spy3 = spy(iter3, 'return');

    const consolidator = new Consolidator([iter1, iter2, iter3]);
    consolidator.close();

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    consolidator.next();
    expect(await consolidator.return()).to.deep.equal({
      done: true,
      value: undefined,
    });
    expect(spy1.calledOnce).to.equal(true);
    expect(spy2.calledOnce).to.equal(true);
    expect(spy3.calledOnce).to.equal(true);
  });

  it('return methods on all iterators not called when parent iterator return called prematurely', async () => {
    const iter1 = hangingGen();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const iter2 = new Repeater<number>(() => {});
    const iter3 = delayRepeater(10000, [1]);
    const spy1 = spy(iter1, 'return');
    const spy2 = spy(iter2, 'return');
    const spy3 = spy(iter3, 'return');

    const consolidator = new Consolidator([iter1, iter2, iter3]);
    consolidator.close();

    expect(await consolidator.return()).to.deep.equal({
      done: true,
      value: undefined,
    });
    expect(spy1.notCalled).to.equal(true);
    expect(spy2.notCalled).to.equal(true);
    expect(spy3.notCalled).to.equal(true);
  });

  it('one iterator errors', async () => {
    const iter1 = delayRepeater(100, Array(10).fill(101), 102);
    const iter2 = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(11);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(12);
    });
    const error = new Error('merge error');
    const iter3 = delayRepeater(250, [1, 2, 3], undefined, error);
    const spy1 = spy(iter1, 'return');
    const spy2 = spy(iter2, 'return');
    const spy3 = spy(iter3, 'return');

    const consolidator = new Consolidator([iter1, iter2, iter3]);
    consolidator.close();

    const values = expectValues(
      consolidator,
      [11, 12, 101, 101, 1, 101, 101, 2, 101, 101, 101, 3, 101, 101],
      NaN,
    );
    clock.tick(1000);
    await expectPromise(values).toRejectWith('merge error');

    expect(await consolidator.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
    expect(spy1.calledOnce).to.equal(true);
    expect(spy2.calledOnce).to.equal(true);
    expect(spy3.calledOnce).to.equal(true);
  });
});
