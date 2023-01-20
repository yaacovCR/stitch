import { isPromise } from '../predicates/isPromise.mjs';
import { deepAssign } from '../utilities/deepAssign.mjs';
/**
 * @internal
 */
export class Stitcher {
  constructor(exeContext, originalResult) {
    this.exeContext = exeContext;
    this.originalResult = originalResult;
    this.finished = new Promise((resolve) => {
      this.trigger = resolve;
    });
    this.originalResult = originalResult;
    this.data = undefined;
    this.errors = [];
    this.promiseCount = 0;
  }
  stitch() {
    if (!('data' in this.originalResult) || this.originalResult.data == null) {
      return this.originalResult;
    }
    try {
      this.merge(this.originalResult);
    } catch (error) {
      this.errors.push(error);
      return this.createResult();
    }
    if (this.promiseCount > 0) {
      return this.finished.then(() => this.createResult());
    }
    return this.createResult();
  }
  mergePossiblePromise(result) {
    if (isPromise(result)) {
      this.promiseCount++;
      result.then(
        (resolved) => {
          this.promiseCount--;
          this.merge(resolved);
          if (this.promiseCount === 0) {
            this.trigger();
          }
        },
        (error) => {
          this.promiseCount--;
          this.errors.push(error);
          if (this.promiseCount === 0) {
            this.trigger();
          }
        },
      );
    } else {
      this.merge(result);
    }
  }
  merge(result) {
    if (result.data == null) {
      this.data = null;
    } else if (this.data === undefined) {
      this.data = result.data;
    } else if (this.data !== null) {
      deepAssign(this.data, result.data);
    }
    if (result.errors) {
      this.errors.push(...result.errors);
    }
  }
  createResult() {
    if (this.errors.length > 0) {
      return {
        ...this.originalResult,
        data: this.data ? this.data : null,
        errors: this.errors,
      };
    }
    return {
      ...this.originalResult,
      data: this.data ? this.data : null,
    };
  }
}
