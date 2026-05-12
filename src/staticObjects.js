// js/staticObjects.js

// To this:
if (typeof window !== 'undefined') {
    logStep("staticObjects.js");
}

export const staticObjects = new Map(); // Key: "gx_gy", Value: { type: 'SMELTER', ...metadata }

// js/staticObjects.js

export function registerObject(gx, gy, type, metadata = {}) {
    // ⚡ USE A UNIQUE NUMBER INSTEAD OF A STRING
    // Max world size is 10k, so (gx * 10000 + gy) is always a unique number
    const key = (gx * 10000) + gy;
    staticObjects.set(key, { type, ...metadata });
}

export function getObjectAt(gx, gy) {
    if (staticObjects.size === 0) return null;
    // ⚡ NO STRINGS CREATED
    return staticObjects.get((gx * 10000) + gy);
}