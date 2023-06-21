import { memoize2 } from './memoize2.ts';
export const emptyArray: ReadonlyArray<object> = [];
function _appendToArray<T extends object>(arr: ReadonlyArray<T>, item: T) {
  return [...arr, item];
}
export const appendToArray = memoize2(_appendToArray);
