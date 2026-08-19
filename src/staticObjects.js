// src/staticObjects.js

export const staticObjects = new Map();
export const solidTiles = new Set(); // 👈 New: Tracks physical coordinate blockers

// Inside registerObject() in src/staticObjects.js:

// src/staticObjects.js

export function registerObject(gx, gy, type, metadata = {}) {
    const key = (gx * 10000) + gy;
    staticObjects.set(key, { type, ...metadata });

    if (type === 'WELL_OBJECT') {
        solidTiles.add(`${gx}_${gy}`);
        solidTiles.add(`${gx + 1}_${gy}`);
        solidTiles.add(`${gx}_${gy - 1}`);
        solidTiles.add(`${gx + 1}_${gy - 1}`);
    }
    
    // Add non-open fences and closed gates to the physics engine's collider set
    if (type === 'RANCH_FENCE') {
        if (metadata.fenceType !== 'G' || !metadata.open) {
            solidTiles.add(`${gx}_${gy}`);
        }
    }
}

export function setGateState(gx, gy, open) {
    const key = (gx * 10000) + gy;
    const obj = staticObjects.get(key);
    if (obj && obj.type === 'RANCH_FENCE' && obj.fenceType === 'G') {
        obj.open = open;
        if (open) {
            solidTiles.delete(`${gx}_${gy}`);
        } else {
            solidTiles.add(`${gx}_${gy}`);
        }
    }
}
export function getObjectAt(gx, gy) {
    if (staticObjects.size === 0) return null;
    return staticObjects.get((gx * 10000) + gy);
}