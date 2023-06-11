const objectCaches = new WeakMap<
  object,
  Map<string, Map<unknown, { [key: string]: unknown }>>
>();

export function updateNode<T extends object>(
  node: T,
  key: string,
  value: any,
): T {
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
      cachedValue[nodeKey] = (
        node as unknown as { [nodeKey: string]: unknown }
      )[nodeKey];
    }
    cacheForKey.set(value, cachedValue);
  }

  return cachedValue as T;
}
