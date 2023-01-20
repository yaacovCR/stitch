'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Stitcher = void 0;
const isPromise_js_1 = require('../predicates/isPromise.js');
const deepAssign_js_1 = require('../utilities/deepAssign.js');
/**
 * @internal
 */
class Stitcher {
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
    if ((0, isPromise_js_1.isPromise)(result)) {
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
      (0, deepAssign_js_1.deepAssign)(this.data, result.data);
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
exports.Stitcher = Stitcher;
