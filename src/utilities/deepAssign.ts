import type { ObjMap } from 'graphql/jsutils/ObjMap.js';

import { isObjectLike } from './isObjectLike.js';

export function deepAssign(
  target: ObjMap<unknown>,
  source: ObjMap<unknown>,
): void {
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
