'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.UniqueId = void 0;
/**
 * @internal
 */
class UniqueId {
  constructor() {
    this._id = 0;
  }
  gen() {
    return (this._id++).toString();
  }
}
exports.UniqueId = UniqueId;
