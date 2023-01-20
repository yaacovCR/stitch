'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.deepAssign = void 0;
const isObjectLike_js_1 = require('../predicates/isObjectLike.js');
function deepAssign(target, source) {
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];
    if ((0, isObjectLike_js_1.isObjectLike)(sourceValue)) {
      if ((0, isObjectLike_js_1.isObjectLike)(targetValue)) {
        deepAssign(targetValue, sourceValue);
      }
    } else {
      target[key] = sourceValue;
    }
  }
}
exports.deepAssign = deepAssign;
