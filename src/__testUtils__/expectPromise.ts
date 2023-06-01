import { assert, expect } from 'chai';

import { isPromise } from '../predicates/isPromise.js';

import { inspect } from '../utilities/inspect.js';

export function expectPromise(maybePromise: unknown) {
  assert(
    isPromise(maybePromise),
    `Expected a promise, received '${inspect(maybePromise)}'`,
  );

  return {
    toResolve() {
      return maybePromise;
    },
    async toRejectWith(message: string) {
      let caughtError: Error | undefined;
      let resolved;
      let rejected = false;
      try {
        resolved = await maybePromise;
      } catch (error) {
        rejected = true;
        caughtError = error;
      }

      assert(
        rejected,
        `Promise should have rejected with message '${message}', but resolved as '${inspect(
          resolved,
        )}'`,
      );

      expect(caughtError).to.be.an.instanceOf(Error);
      expect(caughtError).to.have.property('message', message);
    },
  };
}
