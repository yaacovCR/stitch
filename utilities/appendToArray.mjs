import { memoize2 } from './memoize2.mjs';
export const emptyArray = [];
function _appendToArray(arr, item) {
  return [...arr, item];
}
export const appendToArray = memoize2(_appendToArray);
