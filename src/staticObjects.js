// src/staticObjects.js

export const staticObjects = new Map();
export const solidTiles = new Set(); // 👈 New: Tracks physical coordinate blockers

// Inside registerObject() in src/staticObjects.js:

export function registerObject(gx, gy, type, metadata = {}) {
    const key = (gx * 10000) + gy;
    staticObjects.set(key, { type, ...metadata });

    // 🎯 Only register the WELL as a solid tile block (4 full squares)
    if (type === 'WELL_OBJECT') {
        solidTiles.add(`${gx}_${gy}`);
        solidTiles.add(`${gx + 1}_${gy}`);
        solidTiles.add(`${gx}_${gy - 1}`);
        solidTiles.add(`${gx + 1}_${gy - 1}`);
    }
    // (Trees are now bypassed here and handled with sub-pixel precision instead!)
}

export function getObjectAt(gx, gy) {
    if (staticObjects.size === 0) return null;
    return staticObjects.get((gx * 10000) + gy);
}