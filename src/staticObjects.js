// src/staticObjects.js

export const staticObjects = new Map();
export const solidTiles = new Set(); // 👈 New: Tracks physical coordinate blockers

export function registerObject(gx, gy, type, metadata = {}) {
    const key = (gx * 10000) + gy;
    staticObjects.set(key, { type, ...metadata });

    // Mark specific multi-tile coordinates as physically solid
    if (type === 'FOREST_TREE') {
        // Tree trunks are 2x1 solid blocks at the bottom
        solidTiles.add(`${gx}_${gy}`);
        solidTiles.add(`${gx + 1}_${gy}`);
    } 
    else if (type === 'WELL_OBJECT') {
        // Wells are 2x2 solid blocks
        solidTiles.add(`${gx}_${gy}`);
        solidTiles.add(`${gx + 1}_${gy}`);
        solidTiles.add(`${gx}_${gy - 1}`);
        solidTiles.add(`${gx + 1}_${gy - 1}`);
    }
}

export function getObjectAt(gx, gy) {
    if (staticObjects.size === 0) return null;
    return staticObjects.get((gx * 10000) + gy);
}