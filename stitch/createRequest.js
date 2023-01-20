'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createRequest = void 0;
const graphql_1 = require('graphql');
function createRequest(operation, fragments) {
  const document = {
    kind: graphql_1.Kind.DOCUMENT,
    definitions: [operation, ...fragments],
  };
  return document;
}
exports.createRequest = createRequest;
