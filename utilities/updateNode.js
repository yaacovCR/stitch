"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNode = updateNode;
const objectCaches = new WeakMap();
function updateNode(node, key, value) {
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
            if (nodeKey !== key) {
                cachedValue[nodeKey] = node[nodeKey];
            }
        }
        if (value !== null) {
            cachedValue[key] = value;
        }
        cacheForKey.set(value, cachedValue);
    }
    return cachedValue;
}
