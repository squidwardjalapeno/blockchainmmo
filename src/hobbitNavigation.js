// src/hobbitNavigation.js
import { getTileData } from './physics.js';
import { getObjectAt, solidTiles } from './staticObjects.js';
import { doorStates } from './multiplayer.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitNavigation.js loaded");
}

export function isTilePassable(tx, ty, worldMatrix, roomMatrix, hobbit, fromTX = null, fromTY = null) {
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    if (tx < 0 || tx >= 10000 || ty < 0 || ty >= 10000) return false;
    if (solidTiles.has(`${tx}_${ty}`)) return false;

    const staticObj = getObjectAt(tx, ty);
    if (staticObj && (staticObj.type === 'FOREST_TREE' || staticObj.type === 'INT_WALL' || staticObj.type === 'CHEST_STORAGE')) return false;

    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;

    // 🚪 1. DOOR TILES (Passable unless explicitly locked in doorStates)
    const isDoorTile = [49, 12, 35, 13].includes(data.tileID);
    if (isDoorTile) {
        const doorKey = `${tx}_${ty}`;
        const isExplicitlyLocked = doorStates.get(doorKey)?.locked === true;
        if (!isExplicitlyLocked) {
            return true;
        }

        // 🎯 A hobbit can ALWAYS access its own home door
        const isOwnDoor = (hobbit?.homeMemory && hobbit.homeMemory.doorX === tx && hobbit.homeMemory.doorY === ty);
        const hasKey = isOwnDoor || hobbit?.inventory?.some(i => i.isKey && i.houseId === data.roomID) || (hobbit?.houseId === data.roomID);
        
        return hasKey || [35, 13].includes(data.tileID);
    }

    // 🧱 2. ROOM BOUNDARY ENFORCEMENT
    // Only enforce for immediate 1-tile step transitions in pathfinding
    if (fromTX !== null && fromTY !== null && (Math.abs(fromTX - tx) + Math.abs(fromTY - ty) <= 1)) {
        const fromData = getTileData(fromTX * 16 + 8, fromTY * 16 + 8, worldMatrix, roomMatrix);
        const fromRoom = (fromData?.roomID === 9999) ? 0 : (fromData?.roomID || 0);
        const toRoom = (data.roomID === 9999) ? 0 : (data.roomID || 0);

        if (fromRoom !== toRoom) {
            const fromIsDoor = [49, 12, 35, 13].includes(fromData?.tileID);
            if (!isDoorTile && !fromIsDoor) {
                return false; // Physical wall: must cross via a door!
            }
        }
    }

    // 🏠 3. INTERIOR BUILDING FLOORS
    if (data.roomID !== 0 && data.roomID !== 9999) {
        const interiorSolids = [40, 50, 52, 27, 46, 47];
        if (interiorSolids.includes(data.tileID)) return false;
        return true;
    }

    // 🌲 4. OUTDOOR SOLIDS
    const worldSolids = [40, 48, 50, 52, 1, 3, 5, 41, 43, 27, 46, 47, 17, 18, 21, 24, 11];
    if (worldSolids.includes(data.tileID)) return false;

    return true;
}

export function getTilePath(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit, maxDepth = 60) {
    if (!Number.isFinite(startTX) || !Number.isFinite(startTY) || 
        !Number.isFinite(targetTX) || !Number.isFinite(targetTY)) {
        return null;
    }

    if (startTX === targetTX && startTY === targetTY) return [];

    const queue = [{ x: startTX, y: startTY, path: [] }];
    const visited = new Set([`${startTX}_${startTY}`]);

    const neighbors = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
    ];

    let searchSteps = 0;
    const MAX_SEARCH_STEPS = 800;

    while (queue.length > 0 && searchSteps++ < MAX_SEARCH_STEPS) {
        const curr = queue.shift();

        if (curr.path.length >= maxDepth) continue;

        for (const n of neighbors) {
            const nx = curr.x + n.dx;
            const ny = curr.y + n.dy;
            const key = `${nx}_${ny}`;

            if (nx === targetTX && ny === targetTY) {
                return [...curr.path, { x: nx, y: ny }];
            }

            if (!visited.has(key)) {
                visited.add(key);
                if (isTilePassable(nx, ny, worldMatrix, roomMatrix, hobbit, curr.x, curr.y)) {
                    queue.push({
                        x: nx,
                        y: ny,
                        path: [...curr.path, { x: nx, y: ny }]
                    });
                }
            }
        }
    }

    return null;
}