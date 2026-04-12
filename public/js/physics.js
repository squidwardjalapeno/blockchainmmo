// js/physics.js
import { CONFIG } from './config.js';

// 1. Define this at the top so every part of the file can see it
const isWalkableInside = (id) => id === 35 || id === 42;

// HELPER: One place to handle the 100x100 cell math
// js/physics.js

export function getTileData(pxX, pxY, worldMatrix, roomMatrix) {
    // 1. Convert Pixels to Global Tiles (16px per tile)
    const gx = Math.floor(pxX / 16);
    const gy = Math.floor(pxY / 16);

    // 2. Convert Global Tiles to Cell Coordinates (100 tiles per cell)
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    // 3. Local Tiles inside that 100x100 cell
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;

    // 4. THE FLAT INDEX (The Big Fix)
    const cellIdx = (ly * 100) + lx;

    // 5. Safely check if the Cell exists in the 20x20 world
    const cell = worldMatrix[cx]?.[cy];
    const room = roomMatrix[cx]?.[cy];

    return {
        tileID: cell ? cell[cellIdx] : undefined,
        roomID: room ? room[cellIdx] : 0,
        gx, gy, cx, cy, lx, ly
    };
}


// js/physics.js

// js/physics.js

// js/physics.js

// js/physics.js

export function checkCollision(x, y, worldMatrix, roomMatrix, hero) {
    let target = getTileData(x, y, worldMatrix, roomMatrix);
    const current = getTileData(hero.x + 8, hero.y + 14, worldMatrix, roomMatrix);

    if (target.tileID === undefined) return false;

    // 1. DOOR OPENER (Keep as is)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const near = getTileData(x + (dx * 8), y + (dy * 8), worldMatrix, roomMatrix);
        
        // THE FIX: Calculate the 1D index
        const nearIdx = (near.ly * 100) + near.lx;

        if (near.tileID === 49) {
            // Write to the flat index, not a 2D coordinate
            worldMatrix[near.cx][near.cy][nearIdx] = 35;
        }

        }
    }

    // B. CLOSE: If we are NO LONGER near a door, turn it back to 49
    // We check a slightly wider area (2 tiles) so it doesn't slam on your heels
    const DISTANCE_TO_CLOSE = 32; 
    const doorCheckX = hero.x + 8;
    const doorCheckY = hero.y + 14;

    // Scan a small area around the player's PREVIOUS position
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            const near = getTileData(doorCheckX + (dx * 16), doorCheckY + (dy * 16), worldMatrix, roomMatrix);
            
            // ... B. CLOSE DOOR LOGIC ...
if (near.tileID === 35) {
    const dist = Math.sqrt(Math.pow(near.gx * 16 - doorCheckX, 2) + Math.pow(near.gy * 16 - doorCheckY, 2));
    
    if (dist > 24) {
        // THE FIX: Calculate the 1D index here too
        const nearIdx = (near.ly * 100) + near.lx;
        worldMatrix[near.cx][near.cy][nearIdx] = 49;
    }
}
        }
    }

    target = getTileData(x, y, worldMatrix, roomMatrix);

    // 2. THE UNIVERSAL DOOR RULE (The Exit Fix)
    // If you are stepping ON a door, OR standing ON a door:
    // Ignore all room IDs and solids. The door is a "Free Pass".
    if (target.tileID === 35 || current.tileID === 35) {
        return true; 
    }

        // 3. INSIDE THE HOUSE (Room ID > 0)
    if (current.roomID !== 0) {
        // A. THE ONLY REAL STOPPER: The Roof (40)
        // By removing 48 (Wall) from this list, your head can overlap the wall,
        // which lets your FEET move up one more tile into the 2nd row.
        const hardSolids = [40, 41, 43]; 
        if (hardSolids.includes(target.tileID)) return false;

        // B. THE ROOM CHECK
        // Allow movement on Floor (42), Wall (48), and Foundations (50/52)
        if (target.roomID === current.roomID) return true;
        
        return false; 
    }


    // 4. OPEN WORLD RULES
    const worldSolids = [40, 48, 50, 52, 0, 17];
    if (worldSolids.includes(target.tileID)) return false;

    // 5. PERIMETER GUARD (Final Safety)
    if (current.roomID !== target.roomID) return false;

    return true; 
}










