'use strict';
/**
 * big-schema/stitch provides a set of tools for stitching GraphQL schemas.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = exports.execute = void 0;
var stitch_js_1 = require('./stitch/stitch.js');
Object.defineProperty(exports, 'execute', {
  enumerable: true,
  get: function () {
    return stitch_js_1.execute;
  },
});
Object.defineProperty(exports, 'subscribe', {
  enumerable: true,
  get: function () {
    return stitch_js_1.subscribe;
  },
});
