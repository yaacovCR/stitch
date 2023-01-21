'use strict';
/**
 * big-schema/stitch provides a set of tools for stitching GraphQL schemas.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.subscribe = exports.execute = void 0;
var execute_js_1 = require('./stitch/execute.js');
Object.defineProperty(exports, 'execute', {
  enumerable: true,
  get: function () {
    return execute_js_1.execute;
  },
});
var subscribe_js_1 = require('./stitch/subscribe.js');
Object.defineProperty(exports, 'subscribe', {
  enumerable: true,
  get: function () {
    return subscribe_js_1.subscribe;
  },
});
