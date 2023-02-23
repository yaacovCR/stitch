'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.isDeferIncrementalResult = void 0;
function isDeferIncrementalResult(incrementalResult) {
  return 'data' in incrementalResult;
}
exports.isDeferIncrementalResult = isDeferIncrementalResult;
