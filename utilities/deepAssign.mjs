import { isObjectLike } from '../predicates/isObjectLike.mjs';
export function deepAssign(target, source) {
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];
    if (isObjectLike(sourceValue)) {
      if (isObjectLike(targetValue)) {
        deepAssign(targetValue, sourceValue);
      }
    } else {
      target[key] = sourceValue;
    }
  }
}
