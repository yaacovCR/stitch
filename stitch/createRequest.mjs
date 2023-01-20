import { Kind } from 'graphql';
export function createRequest(operation, fragments) {
  const document = {
    kind: Kind.DOCUMENT,
    definitions: [operation, ...fragments],
  };
  return document;
}
