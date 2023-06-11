'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.appendToArray = exports.emptyArray = void 0;
const memoize2_js_1 = require('./memoize2.js');
exports.emptyArray = [];
function _appendToArray(arr, item) {
  return [...arr, item];
}
exports.appendToArray = (0, memoize2_js_1.memoize2)(_appendToArray);
