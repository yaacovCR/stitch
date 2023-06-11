const objectCaches = new WeakMap();
export function updateNode(node, key, value) {
  let cacheForNode = objectCaches.get(node);
  if (cacheForNode === undefined) {
    cacheForNode = new Map();
    objectCaches.set(node, cacheForNode);
  }
  let cacheForKey = cacheForNode.get(key);
  if (cacheForKey === undefined) {
    cacheForKey = new Map();
    cacheForNode.set(key, cacheForKey);
  }
  let cachedValue = cacheForKey.get(value);
  if (cachedValue === undefined) {
    cachedValue = {};
    for (const nodeKey of Object.keys(node)) {
      if (nodeKey === key) {
        if (value !== null) {
          cachedValue[nodeKey] = value;
        }
        continue;
      }
      cachedValue[nodeKey] = node[nodeKey];
    }
    cacheForKey.set(value, cachedValue);
  }
  return cachedValue;
}
