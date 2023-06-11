import { memoize2 } from './memoize2.ts';
export const emptyArray: Array<object> = [];
function _appendToArray<T extends object>(arr: Array<T>, item: T) {
  return [...arr, item];
}
export const appendToArray = memoize2(_appendToArray);
