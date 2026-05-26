
// js/cellDecorator.js
import { applyShorelineRules } from './terrainRules.js';
import { CONFIG } from './config.js'
import { createPlant, plants } from './plants.js'; // 👈 Swapped createGrass for createPlant
import { spawnChicken } from './animals.js'; // 👈 ADD THIS IMPORT
import { seededRandom, setWorldSeed } from "./mapGenerator.js";
import { registerObject } from './staticObjects.js';
import { getTileData } from './physics.js';


// This is our global "Phone Book" for buildings
export const roomMetadata = {}; 
let nextHouseId = 1;

// 🆕 Add this near the top of your imports
export const ecoGenerated = new Set();

// At the top of src/cellDecorator.js
export const zoneLookup = new Map();     // Key: "cx_cy", Value: Array of chunks in the zone
export const zoneWellLookup = new Map(); // Key: "cx_cy", Value: The anchor well object (O(1) Index)
export const initializedZones = new Set(); // Tracks built settlements

// To this:
if (typeof window !== 'undefined') {
    logStep("cellDecorator.js");
}

// js/cellDecorator.js

/**
 * Safely writes a tile ID and room ID to any coordinate in the 10,000x10,000 world
 */
// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// ==========================================
// 🏗️ BLUEPRINT PLANNING SYSTEM
// ==========================================
export let plannedBuildings = []; 
export let plannedRanches = [];   
export let plannedWells = [];     

export function reserveFootprint(gx, gy, w, h, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const DUMMY_ID = 9998; 
    for (let i = 0; i < w; i++) {
        for (let j = -(h - 1); j <= 0; j++) {
            const tx = gx + i, ty = gy + j;
            const cx = Math.floor(tx / 100), cy = Math.floor(ty / 100);
            
            if (cx >= 0 && cx < CONFIG.MAP_SIZE && cy >= 0 && cy < CONFIG.MAP_SIZE) {
                // 🛑 THE FIX: Initialize the chunk so we don't crash!
                if (!worldMatrix[cx][cy]) {
                    const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
                    const isLand = worldMap[blueprintIdx] >= CONFIG.LAND_THRESHOLD || worldMap[blueprintIdx] >= 100;
                    worldMatrix[cx][cy] = new Uint16Array(10000).fill(isLand ? 63 : 17);
                    roomMatrix[cx][cy] = new Uint16Array(10000).fill(0);
                    fertilityMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 12 : 0);
                }

                const lx = ((tx % 100) + 100) % 100, ly = ((ty % 100) + 100) % 100;
                roomMatrix[cx][cy][ly * 100 + lx] = DUMMY_ID; 
            }
        }
    }
}





// src/cellDecorator.js

export function setGlobalTile(gx, gy, tileID, roomID, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;

    if (worldMatrix[cx][cy] === null) {
        const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
        const isLand = worldMap[blueprintIdx] >= CONFIG.LAND_THRESHOLD || worldMap[blueprintIdx] >= 100;

        // 👇 CHANGE Uint8Array to Uint16Array
        worldMatrix[cx][cy] = new Uint16Array(10000).fill(isLand ? 63 : 17);
        roomMatrix[cx][cy] = new Uint16Array(10000).fill(0);
        
        // 👇 THE FERTILITY FIX: Changed from 3 to 12!
        fertilityMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 12 : 0);
    }

    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const idx = (ly * 100) + lx;

    worldMatrix[cx][cy][idx] = tileID;
    roomMatrix[cx][cy][idx] = roomID;
}
// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

function isAreaClear(gx, gy, w, h, worldMatrix, roomMatrix, worldMap) {
    const buffer = 1; 
    
    for (let i = -buffer; i < w + buffer; i++) {
        for (let j = -h - buffer; j < buffer; j++) {
            const tx = gx + i;
            const ty = gy + j;

            const cx = Math.floor(tx / 100);
            const cy = Math.floor(ty / 100);
            
            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return false;

            // 🛑 THE FIX: If the chunk isn't created yet, check the macro world map!
            if (!worldMatrix[cx] || !worldMatrix[cx][cy]) {
                const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
                const isLand = worldMap[blueprintIdx] >= CONFIG.LAND_THRESHOLD || worldMap[blueprintIdx] >= 100;
                if (!isLand) return false; // It's water, abort!
                continue; // It's land and empty, we are good!
            }

            const lx = ((tx % 100) + 100) % 100;
            const ly = ((ty % 100) + 100) % 100;
            const idx = (ly * 100) + lx;

            const tID = worldMatrix[cx][cy][idx];
            const rID = roomMatrix[cx][cy][idx];

            if (tID === 17) return false; // Water
            if (tID === 337) return false; // Existing Highway
            if (rID !== 0 && rID !== 9999) return false; // Existing building
        }
    }
    return true;
}

export function ensureZoneInitialized(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const cellKey = `${cx}_${cy}`;
    const zone = zoneLookup.get(cellKey);
    if (!zone) return;

    // 🎯 CONSTANT-TIME LOOKUP (Replaced the heavy loop with a simple map query!)
    const zoneWell = zoneWellLookup.get(cellKey);
    if (!zoneWell) return;

    // Check if this specific settlement has already been initialized
    const zoneKey = `${zoneWell.x}_${zoneWell.y}`;
    if (initializedZones.has(zoneKey)) return; 
    initializedZones.add(zoneKey);

    console.log(`🎪 LAZY INITIALIZING SETTLEMENT at Well [${zoneWell.x}, ${zoneWell.y}]`);

    // 1. Force-load / decorate all chunks in the zone first
    zone.forEach(c => {
        const chunkKey = `${c.cx}_${c.cy}`;
        if (!decoratedCells.has(chunkKey)) {
            decorateCell(c.cx, c.cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            decoratedCells.add(chunkKey);
        }
    });

    // 2. Stamp all buildings, ranches, and wells for all chunks in the zone
    zone.forEach(c => {
        stampStructuresForChunk(c.cx, c.cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });

    // 3. Draw the regional roads and walls (highly optimized)
    drawRingRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, zoneWell);
    drawPlannedRanchRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, zoneWell.x, zoneWell.y);
    drawTownWalls(worldMatrix, roomMatrix, fertilityMatrix, worldMap, zoneWell);
}










// js/cellDecorator.js
const cellMemory = new Map();

function getInbound(i, j) {
    const top = cellMemory.get(`${i}_${j-1}`) || { outW: 16, outE: 16, lW: 4, lE: 4 };
    const left = cellMemory.get(`${i-1}_${j}`) || { outN: 16, outS: 16, lN: 4, lS: 4 };

    return {
        inWest: top.outW ?? 16, inEast: top.outE ?? 16,
        inNorth: left.outN ?? 16, inSouth: left.outS ?? 16,
        // Land Inbounds
        lWest: top.lW ?? 4, lEast: top.lE ?? 4,
        lNorth: left.lN ?? 4, lSouth: left.lS ?? 4
    };
}
/**
 * Utility to place a single 4x3 house at a specific coordinate
 */
// js/cellDecorator.js

// js/cellDecorator.js





// A simple stamper for our 2x3 tree (IDs 380, 381 / 392, 393 / 404, 405)
export function drawTree(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    
    setGlobalTile(gx, gy + 2, 406, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy + 2, 407, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
}

export function drawHouse(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    for (let i = 0; i < 4; i++) {
        for (let j = -2; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    for (let i = 0; i < 4; i++) {
        setGlobalTile(gx + i, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        let foundTile = 50; 
        if (i === 1) foundTile = 49; 
        if (i === 2) foundTile = 52; 
        
        setGlobalTile(gx + i, gy, foundTile, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // --- NEW: LOGIC REGISTRATION ---
        // Register the Smelter (Left side wall)
        if (i === 0) {
            registerObject(gx + i, gy - 1, 'CHEST_STORAGE', { houseId: currentId });
        }
        // Register the Bedroll (Right side floor/wall)
        if (i === 3) {
            registerObject(gx + i, gy - 1, 'BEDROLL', { houseId: currentId });
            //registerObject(gx + i, gy, 'BEDROLL', { houseId: currentId });
        }
    }
}

// js/cellDecorator.js

// js/cellDecorator.js -> Inside drawTemple

export function drawTemple(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++; 

    // 1. Footprint
    for (let i = 0; i < 4; i++) {
        for (let j = -7; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    // 2. Exterior / Facade
    for (let i = 0; i < 4; i++) {
        // Back Exterior Row (Roof edge)
        setGlobalTile(gx + i, gy - 7, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        for (let j = -6; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }

        for (let j = -1; j <= 0; j++) {
            let tileID = 1; 
            if (j === 0 && i === 1) tileID = 49; 
            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // --- 🛑 REMOVED THE TILE 41 OVERWRITE HERE ---

    // 3. Logic Registry
    registerObject(gx + 2, gy - 6, 'TEMPLE_ALTAR', { houseId: currentId });
}

// js/cellDecorator.js

export function drawGeneralStore(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    console.log(`🏪 Building General Store at ${gx}, ${gy} (ID: ${currentId})`);

    // 1. FILL FOOTPRINT (4 wide x 4 deep)
    for (let i = 0; i < 4; i++) {
        for (let j = -3; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    // 2. EXTERIOR STRUCTURE
    for (let i = 0; i < 4; i++) {
        // --- BACK ROOF ROW (j = -3) ---
        setGlobalTile(gx + i, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // --- SECOND ROOF ROW (j = -2) ---
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // --- FRONT WALLS (j = -1 and 0) ---
        for (let j = -1; j <= 0; j++) {
            let tileID = 3; // General Store Wall (Tile 3)

            // Standard Door placement (Row 0, col 1)
            if (j === 0 && i === 1) {
                tileID = 49;
            }

            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 3. LOGIC REGISTRY
    // Register the Trade Counter (Tile 34) at the back of the store
    // We'll place it at gx+2 (middle-right) and gy-2 (the row before the back wall)
    registerObject(gx + 2, gy - 2, 'STORE_COUNTER', { houseId: currentId });
}

// js/cellDecorator.js

// js/cellDecorator.js

export function drawVillageHall(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    const width = 11;
    const depth = 9;

    // 1. FILL ENTIRE FOOTPRINT (Flooring)
    for (let i = 0; i < width; i++) {
        for (let j = -(depth-1); j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 2. EXTERIOR ROOF & FACADE
    for (let i = 0; i < width; i++) {
        setGlobalTile(gx + i, gy - 8, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        for (let j = -7; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
        for (let j = -1; j <= 0; j++) {
            let tileID = 3;
            if (j === 0 && i === 1) tileID = 49; 
            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 3. INTERNAL 2x2 PARTITIONS (The Cross)
    const midX = 5;  // Vertical divider
    const midY = -4; // Horizontal divider

    // Vertical Divider (North-South)
    for (let j = -8; j <= 0; j++) {
        if (j === -1) continue; // Doorway to connect front rooms
        if (j === -6) continue; // Doorway to connect back rooms
        registerObject(gx + midX, gy + j, 'INT_WALL', { houseId: currentId });
    }

    // Horizontal Divider (East-West)
    for (let i = 0; i < width; i++) {
        if (i === 2 || i === 8) continue; // Doorways into the quadrants
        registerObject(gx + i, gy + midY, 'INT_WALL', { houseId: currentId });
    }

    // 4. QUADRANT FURNITURE
    // Top-Left: Master Bed
    registerObject(gx + 2, gy - 7, 'SAFE_ZONE', { houseId: currentId });
    // Top-Right: Armory
    registerObject(gx + 8, gy - 7, 'ARMORY', { houseId: currentId });
    // Bottom-Left: Kitchen
    registerObject(gx + 2, gy - 2, 'KITCHEN', { houseId: currentId });
    // Bottom-Right: Meeting Table
    registerObject(gx + 8, gy - 2, 'MAP_TABLE', { houseId: currentId });
}

// js/cellDecorator.js

export function drawRootCellar(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    console.log(`🕳️ Digging Root Cellar at ${gx}, ${gy} (ID: ${currentId})`);

    // 1. FILL FOOTPRINT (2 wide x 3 deep)
    for (let i = 0; i <= 2; i++) {
        for (let j = -2; j <= 0; j++) {
            // Interior Floor (Tile 42)
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    // 2. EXTERIOR STRUCTURE
    for (let i = 0; i <= 2; i++) {
        for (let j = -2; j <= 0; j++) {
            let tileID = 63; // Most of the cellar is hidden under Grass

            // Door placement (First row, first tile)
            if (j === 0 && i === 1) {
                tileID = 49;
            }

            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 3. LOGIC REGISTRY
    // We register a storage spot at the back row
    registerObject(gx + 0, gy - 1, 'FOOD_STORAGE', { houseId: currentId });
    registerObject(gx + 1, gy - 1, 'FOOD_STORAGE', { houseId: currentId });
}

// js/cellDecorator.js

export function drawBarn(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    console.log(`🚜 Building Barn at ${gx}, ${gy} (ID: ${currentId})`);

    // 1. FILL FOOTPRINT (T-Shape Flooring)
    // Base 4x3 area
    for (let i = 0; i < 4; i++) {
        for (let j = -2; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }
    // Top Middle 2x1 segment (The "High Wall" area)
    for (let i = 1; i <= 2; i++) {
        setGlobalTile(gx + i, gy - 3, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        plants.delete(`${gx + i}_${gy - 3}`);
    }

    // 2. EXTERIOR STRUCTURE (Row by Row)
    
    // Row 0 (Front): [5, 12, 5, 5]
    setGlobalTile(gx, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy, 12, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Barn Door
    setGlobalTile(gx + 2, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 3, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // Row -1: [48, 5, 5, 48]
    setGlobalTile(gx, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 3, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // Row -2: [40, 48, 48, 40]
    setGlobalTile(gx, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 3, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // Row -3 (Top segment): [none, 40, 40, none]
    setGlobalTile(gx + 1, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 3. LOGIC REGISTRY
    // Let's add some hay storage in the barn
    registerObject(gx + 3, gy - 1, 'HAY_STORAGE', { houseId: currentId });

    // 🆕 ADD THE HAY TABLE
    registerObject(gx + 1, gy - 1, 'HAY_TABLE', { houseId: currentId });
}

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// src/cellDecorator.js

// ... Ensure you import createPlant and spawnChicken at the top ...

// ==========================================
// 🐴 DRAW RANCH
// ==========================================
export function drawRanch(gx, gy, width, height, gateX, barnType, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    for (let i = 0; i < width; i++) {
        for (let j = -(height - 1); j <= 0; j++) {
            const tx = gx + i, ty = gy + j;
            setGlobalTile(tx, ty, 63, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            const cx = Math.floor(tx / 100), cy = Math.floor(ty / 100);
            const lx = ((tx % 100) + 100) % 100, ly = ((ty % 100) + 100) % 100;
            if (fertilityMatrix[cx]?.[cy]) fertilityMatrix[cx][cy][(ly * 100) + lx] = 255;
        }
    }

    let chickensSpawned = 0;
    const maxChickens = Math.floor(seededRandom() * 2) + 1; 
    let placedNestingBox = false;

    for (let i = 0; i < width; i++) {
        for (let j = -(height - 1); j <= 0; j++) {
            const tx = gx + i, ty = gy + j;
            const isTop = (j === -(height - 1)), isBottom = (j === 0);
            const isLeft = (i === 0), isRight = (i === width - 1);

            if (isTop || isBottom || isLeft || isRight) {
                let tileID = 63; 
                if (isLeft || isRight) tileID = 18; 
                if (isTop || isBottom) tileID = 21; 
                if ((isTop || isBottom) && (isLeft || isRight)) tileID = 24; 
                if (isBottom && i === gateX) tileID = 22; 
                setGlobalTile(tx, ty, tileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            } else {
                setGlobalTile(tx, ty, 63, 9999, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                if (!placedNestingBox && seededRandom() > 0.8) {
                    setGlobalTile(tx, ty, 44, 9999, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                    placedNestingBox = true; continue; 
                }
                if (seededRandom() > 0.85) {
                    const initialAge = Math.floor(seededRandom() * 100);
                    const cropList = ['turnip', 'tomato', 'eggplant', 'strawberry', 'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato', 'wheat'];
                    const randomCrop = cropList[Math.floor(seededRandom() * cropList.length)];
                    import('./plants.js').then(m => m.createPlant(tx, ty, fertilityMatrix, initialAge, randomCrop));
                }
                if (!isTop && !isBottom && !isLeft && !isRight) {
                    if (chickensSpawned < maxChickens && seededRandom() > 0.50) {
                        import('./animals.js').then(m => m.spawnChicken(tx, ty));
                        chickensSpawned++;
                    }
                }
            }
        }
    }

    // 🌟 CORRECTED BARN LOGIC: Double checks width to prevent crashing bounds!
    if (barnType === 'LARGE_BARN') {
        const isLeft = seededRandom() > 0.5;
        const by = gy - height + 1;
        const bX = isLeft ? gx + 1 : gx + width - 7;
        if (width >= 8) drawLargeBarn(bX, by, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        else if (width >= 6) drawBarn(bX, by, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    } else if (barnType === 'BARN') {
        const isLeft = seededRandom() > 0.5;
        const by = gy - height + 1;
        const bX = isLeft ? gx + 1 : gx + width - 5;
        if (width >= 6) drawBarn(bX, by, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }
}
// js/cellDecorator.js

export function drawStorageRoom(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    console.log(`📦 Building Storage Room at ${gx}, ${gy} (ID: ${currentId})`);

    // 1. FILL FOOTPRINT (5 wide x 5 deep)
    for (let i = 0; i < 5; i++) {
        for (let j = -4; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 2. EXTERIOR STRUCTURE
    for (let i = 0; i < 5; i++) {
        // --- ROOF (Top 3 Rows) ---
        setGlobalTile(gx + i, gy - 4, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Top
        setGlobalTile(gx + i, gy - 3, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Mid
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Bottom Roof

        // --- WALLS (Front 2 Rows) ---
        for (let j = -1; j <= 0; j++) {
            let tileID = 50; // Stone Wall/Foundation style

            // Door placement (Front row, second tile)
            if (j === 0 && i === 1) {
                tileID = 49;
            }

            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 3. LOGIC REGISTRY
    // Register the Chest (Tile 36) in the back corners
    registerObject(gx + 0, gy - 3, 'CHEST_STORAGE', { houseId: currentId });
    registerObject(gx + 4, gy - 3, 'CHEST_STORAGE', { houseId: currentId });
}










/**
 * Stamps a cluster of houses and a central well
 */
// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

export function planVillage(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const wellObj = { x: gvx, y: gvy, type: 101 }; // Create reference object
    plannedWells.push(wellObj);

    // ==========================================
    // 🎪 ZONE REGISTRATION (3x3 Constant-Time Indexing)
    // ==========================================
    const cx = Math.floor(gvx / 100);
    const cy = Math.floor(gvy / 100);
    const villageChunks = [];

    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const tCX = cx + ox;
            const tCY = cy + oy;
            if (tCX >= 0 && tCX < CONFIG.MAP_SIZE && tCY >= 0 && tCY < CONFIG.MAP_SIZE) {
                villageChunks.push({ cx: tCX, cy: tCY });
            }
        }
    }

    villageChunks.forEach(c => {
        const chunkKey = `${c.cx}_${c.cy}`;
        zoneLookup.set(chunkKey, villageChunks);
        zoneWellLookup.set(chunkKey, wellObj); // 👈 Direct O(1) link to the well
    });

    // Gather existing roads
    let roadTiles = [];
    for (let x = gvx - 50; x < gvx + 50; x++) {
        for (let y = gvy - 50; y < gvy + 50; y++) {
            const tid = getTileData(x*16, y*16, worldMatrix, roomMatrix).tileID;
            if (tid === 337) roadTiles.push({x, y});
        }
    }
    const hasRoad = roadTiles.length > 0;

    // 1. Plan Uniques
    const uniques = [
        { func: drawVillageHall, w: 11, h: 9 }, 
        { func: drawTemple, w: 4, h: 8 }, 
        { func: drawGeneralStore, w: 4, h: 4 }
    ];
    uniques.forEach(bp => {
        let placed = false, attempts = 0;
        while (!placed && attempts < 50) {
            attempts++;
            let tx = gvx + Math.floor(seededRandom() * 40) - 20;
            let ty = gvy + Math.floor(seededRandom() * 40) - 20;
            if (isAreaClear(tx, ty, bp.w, bp.h, worldMatrix, roomMatrix, worldMap)) {
                reserveFootprint(tx, ty, bp.w, bp.h, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                plannedBuildings.push({ func: bp.func, args: [tx, ty] });
                placed = true;
            }
        }
    });

    // 2. Plan Houses
    const houseGoal = 20; 
    let housesPlaced = 0, houseAttempts = 0;
    while (housesPlaced < houseGoal && houseAttempts < 100) {
        houseAttempts++;
        let tx = gvx + Math.floor(seededRandom() * 90) - 45;
        let ty = gvy + Math.floor(seededRandom() * 90) - 45;
        
        if (hasRoad && houseAttempts < 80) {
            const road = roadTiles[Math.floor(seededRandom() * roadTiles.length)];
            const side = Math.floor(seededRandom() * 4);
            const offset = 2;
            if (side === 0) { tx = road.x; ty = road.y - offset - 3; }      
            else if (side === 1) { tx = road.x; ty = road.y + offset; } 
            else if (side === 2) { tx = road.x + offset; ty = road.y; } 
            else { tx = road.x - offset - 4; ty = road.y; }            
        }

        if (isAreaClear(tx, ty, 4, 3, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(tx, ty, 4, 3, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plannedBuildings.push({ func: drawHouse, args: [tx, ty] });
            housesPlaced++;
        }
    }

    // 3. Plan Utilities
    const utilities = [
        { func: drawStorageRoom, w: 5, h: 5, count: Math.floor(seededRandom() * 2) + 2 },
        { func: drawRootCellar, w: 2, h: 3, count: 2 }
    ];
    utilities.forEach(bp => {
        let placed = 0, attempts = 0;
        while (placed < bp.count && attempts < 50) {
            attempts++;
            const rx = gvx + Math.floor(seededRandom() * 100) - 50;
            const ry = gvy + Math.floor(seededRandom() * 100) - 50;
            if (isAreaClear(rx, ry, bp.w, bp.h, worldMatrix, roomMatrix, worldMap)) {
                reserveFootprint(rx, ry, bp.w, bp.h, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                plannedBuildings.push({ func: bp.func, args: [rx, ry] });
                placed++;
            }
        }
    });

    // 4. Plan Ranches
    let ranchesPlaced = 0, ranchAttempts = 0;
    const ranchGoal = Math.floor(seededRandom() * 3) + 4; 
    let barnsPlaced = 0;
    const maxBarns = Math.floor(seededRandom() * 3) + 2; 

    while (ranchesPlaced < ranchGoal && ranchAttempts < 50) {
        ranchAttempts++;
        const rw = Math.floor(seededRandom() * 16) + 5; 
        const rh = Math.floor(seededRandom() * 16) + 5;
        const rx = gvx + Math.floor(seededRandom() * 90) - 45;
        const ry = gvy + Math.floor(seededRandom() * 90) - 45;
        
        if (isAreaClear(rx, ry, rw, rh, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(rx, ry, rw, rh, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            const gateX = Math.floor(seededRandom() * (rw - 2)) + 1;
            
            let barnType = 'NONE';
            if (barnsPlaced < maxBarns && rw >= 6 && rh >= 6) { 
                barnType = 'BARN'; 
                barnsPlaced++; 
            }

            plannedRanches.push({ gx: rx, gy: ry, w: rw, h: rh, gateX, barnType, wellX: gvx, wellY: gvy });
            ranchesPlaced++;
        }
    }
}


function getTileID(gx, gy, worldMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    // 🛡️ THE FIX: Use CONFIG.MAP_SIZE
    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return 17;
    
    if (!worldMatrix[cx] || worldMatrix[cx][cy] === null) return 63; 

    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    return worldMatrix[cx][cy][(ly * 100) + lx];
}

function getRoomID(gx, gy, roomMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    // 🛡️ THE FIX: Use CONFIG.MAP_SIZE
    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return 1;

    if (!roomMatrix[cx] || roomMatrix[cx][cy] === null) return 0;

    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    return roomMatrix[cx][cy][(ly * 100) + lx];
}





/**
 * Spawns "Suburban" houses in the surrounding area
 */
function drawSuburbs(cellMatrix) {
    const extraHouses = Math.floor(Math.random() * 2) + 3; // 3 to 4 houses
    for (let i = 0; i < extraHouses; i++) {
        const rx = Math.floor(Math.random() * 80) + 10;
        const ry = Math.floor(Math.random() * 80) + 10;
        drawHouse(cellMatrix, rx, ry);
    }
}

// js/cellDecorator.js

// js/cellDecorator.js

export function drawBarracks(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    const width = 6;
    const depth = 6;

    // 1. FILL FOOTPRINT (6x6)
    for (let i = 0; i < width; i++) {
        for (let j = -(depth - 1); j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 2. EXTERIOR STRUCTURE
    for (let i = 0; i < width; i++) {
        // --- ROOF (Top 4 Rows) ---
        setGlobalTile(gx + i, gy - 5, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Top
        setGlobalTile(gx + i, gy - 4, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 3, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // --- STONE WALLS (Front 2 Rows) ---
        for (let j = -1; j <= 0; j++) {
            let tileID = 1; // Heavy Stone Style

            // Door placement (Front row, second tile)
            if (j === 0 && i === 1) {
                tileID = 49;
            }

            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 3. LOGIC REGISTRY
    // Place military storage racks along the back and side walls
    registerObject(gx + 1, gy - 5, 'MILITARY_STORAGE', { houseId: currentId });
    registerObject(gx + 3, gy - 5, 'MILITARY_STORAGE', { houseId: currentId });
    registerObject(gx + 5, gy - 5, 'MILITARY_STORAGE', { houseId: currentId });
    
    // Also a rack on the side wall
    registerObject(gx + 5, gy - 3, 'MILITARY_STORAGE', { houseId: currentId });
}

// js/cellDecorator.js

// js/cellDecorator.js

export function drawTwoStoryHouse(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    roomMetadata[currentId] = { type: 'TWO_STORY', frontY: gy, maxOffset: -3 };

    
    // 1. Draw 4x4 Floor
    for (let i = 0; i < 4; i++) {
        for (let j = -3; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 2. Exterior Roof/Walls
    for (let i = 0; i < 4; i++) {
        setGlobalTile(gx + i, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Top
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Mid
        setGlobalTile(gx + i, gy - 1, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);  // Wall
        setGlobalTile(gx + i, gy, (i === 1 ? 49 : 3), currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Door
    }

    // 3. Register a "Toggle" Staircase in the center
    // We tag the metadata so the renderer knows this is a two-story building
    registerObject(gx + 3, gy - 1, 'STAIRS_TOGGLE', { houseId: currentId, isTwoStory: true });
}

// js/cellDecorator.js

export function drawInn(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    // 1. REGISTER DYNAMIC METADATA
    roomMetadata[currentId] = { 
        type: 'TWO_STORY', 
        frontY: gy, 
        maxOffset: -8 // Because it is 9 tiles deep (0 to -8)
    };

    // 2. FILL FOOTPRINT (Flooring)
    for (let i = 0; i < 8; i++) {
        for (let j = -8; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 3. EXTERIOR STRUCTURE
    for (let i = 0; i < 8; i++) {
        // Foundation/Stone Walls (Bottom 2 rows)
        setGlobalTile(gx + i, gy, 50, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 50, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Top (Row -8)
        setGlobalTile(gx + i, gy - 8, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Mid (Rows -7 down to -2)
        for (let j = -7; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 4. DOOR (Row 0, 2nd Tile)
    setGlobalTile(gx + 1, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 5. STAIRCASE (Toggle style, in the middle of the room)
    registerObject(gx + 4, gy - 4, 'STAIRS_TOGGLE', { houseId: currentId });
}

// js/cellDecorator.js

export function drawMilitaryQuarters(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    // 1. REGISTER DYNAMIC METADATA
    // Depth is 11, so tiles go from 0 down to -10.
    roomMetadata[currentId] = { 
        type: 'TWO_STORY', 
        frontY: gy, 
        maxOffset: -10 
    };

    // 2. FILL FOOTPRINT (Interior Floor)
    for (let i = 0; i < 10; i++) {
        for (let j = -10; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 3. EXTERIOR STRUCTURE
    for (let i = 0; i < 10; i++) {
        // Standard Walls (Bottom 2 rows - j=0 and j=-1)
        setGlobalTile(gx + i, gy, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Top (Row -10)
        setGlobalTile(gx + i, gy - 10, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Mid (Rows -9 down to -2)
        for (let j = -9; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 4. DOOR (Row 0, 3rd Tile)
    setGlobalTile(gx + 2, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 5. STAIRCASE (Toggle style, centered in the large room)
    registerObject(gx + 5, gy - 5, 'STAIRS_TOGGLE', { houseId: currentId });
}

// js/cellDecorator.js

export function drawBlacksmith(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    // 1. REGISTER METADATA
    roomMetadata[currentId] = { 
        type: 'STANDARD', 
        frontY: gy, 
        depth: 5 
    };

    // 2. FILL FOOTPRINT (6x5 Flooring)
    for (let i = 0; i < 6; i++) {
        for (let j = -4; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 3. EXTERIOR STRUCTURE
    for (let i = 0; i < 6; i++) {
        // Heavy Stone Walls (Bottom 2 rows: j=0, j=-1)
        setGlobalTile(gx + i, gy, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Top (Row -4)
        setGlobalTile(gx + i, gy - 4, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Mid (Rows -3, -2)
        setGlobalTile(gx + i, gy - 3, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }

    // 4. DOOR (Row 0, 2nd Tile)
    setGlobalTile(gx + 1, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 5. REGISTER ANVIL
    // We place it near the back-right of the room
    registerObject(gx + 4, gy - 2, 'ANVIL', { houseId: currentId });
}

// js/cellDecorator.js

export function drawForge(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    roomMetadata[currentId] = { type: 'STANDARD', frontY: gy, depth: 5 };

    for (let i = 0; i < 5; i++) {
        for (let j = -4; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    for (let i = 0; i < 5; i++) {
        setGlobalTile(gx + i, gy - 4, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 3, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        
        for (let j = -1; j <= 0; j++) {
            let tileID = 1; // Default house exterior
            if (j === 0 && i === 2) tileID = 49; 
            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // Place the Smelter and Anvil
    registerObject(gx + 1, gy - 2, 'SMELTER', { houseId: currentId });
    registerObject(gx + 3, gy - 2, 'ANVIL', { houseId: currentId });
}

export function drawWorkshop(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    roomMetadata[currentId] = { type: 'STANDARD', frontY: gy, depth: 6 };

    for (let i = 0; i < 6; i++) {
        for (let j = -5; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    for (let i = 0; i < 6; i++) {
        setGlobalTile(gx + i, gy - 5, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 4, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 3, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        for (let j = -2; j <= 0; j++) {
            let tileID = 1; // Default exterior
            if (j === 0 && i === 2) tileID = 49; 
            setGlobalTile(gx + i, gy + j, tileID, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // Place the Crafting Table (Tile 100 from keyTileset)
    registerObject(gx + 3, gy - 3, 'CRAFTING_TABLE', { houseId: currentId });
}

// js/cellDecorator.js

export function drawLargeBarn(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    // 1. REGISTER METADATA
    // We'll use a special type to handle the unique T-shape logic
    roomMetadata[currentId] = { 
        type: 'LARGE_BARN', 
        frontX: gx,
        frontY: gy 
    };

    // 2. FILL FOOTPRINT (6x6 Base + 2x2 Top Middle)
    for (let i = 0; i < 6; i++) {
        for (let j = -5; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }
    for (let i = 2; i <= 3; i++) {
        for (let j = -7; j <= -6; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 3. EXTERIOR STRUCTURE (Column by Column for the T-Shape)
    for (let i = 0; i < 6; i++) {
        const isMiddle = (i === 2 || i === 3);
        
        if (isMiddle) {
            // Middle columns extend walls up to j=-3 and roof up to j=-7
            setGlobalTile(gx + i, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 2, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 3, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            
            setGlobalTile(gx + i, gy - 7, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Top
            for (let j = -6; j <= -4; j++) {
                setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Mid
            }
        } else {
            // Side columns have walls up to j=-1 and roof up to j=-5
            setGlobalTile(gx + i, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            
            setGlobalTile(gx + i, gy - 5, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Top
            for (let j = -4; j <= -2; j++) {
                setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Mid
            }
        }
    }

    // 4. DOOR (Row 0, 2nd Tile)
    setGlobalTile(gx + 1, gy, 12, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 5. OBJECTS
    registerObject(gx + 3, gy - 3, 'STAIRS_TOGGLE', { houseId: currentId });
    registerObject(gx + 0, gy - 2, 'HAY_STORAGE', { houseId: currentId });
    registerObject(gx + 5, gy - 2, 'HAY_STORAGE', { houseId: currentId });
    registerObject(gx + 2, gy - 1, 'HAY_STORAGE', { houseId: currentId });

    // 🆕 ADD THE HAY TABLE
    registerObject(gx + 1, gy - 1, 'HAY_TABLE', { houseId: currentId });
}

// js/cellDecorator.js

export function drawTownHall(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    // 1. REGISTER METADATA
    // Depth is 12, so offsets are 0 down to -11
    roomMetadata[currentId] = { 
        type: 'TWO_STORY', 
        frontY: gy, 
        maxOffset: -11 
    };

    // 2. FILL FOOTPRINT (11x12 Flooring)
    for (let i = 0; i < 11; i++) {
        for (let j = -11; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 3. EXTERIOR STRUCTURE
    for (let i = 0; i < 11; i++) {
        // Town Hall uses Wall Tile 3 for the bottom two rows
        setGlobalTile(gx + i, gy, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Top (Row -11)
        setGlobalTile(gx + i, gy - 11, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Roof Mid (Rows -10 down to -2)
        for (let j = -10; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    // 4. ENTRANCE (Centered Door)
    setGlobalTile(gx + 5, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 5. OBJECTS & FURNITURE
    // Ground Floor / Shared Floor items
    registerObject(gx + 2, gy - 2, 'KITCHEN', { houseId: currentId });
    registerObject(gx + 5, gy - 6, 'MEETING_TABLE', { houseId: currentId });
    registerObject(gx + 8, gy - 10, 'ARMORY', { houseId: currentId });

    // Stairs (Placed in the hallway area, middle-right)
    registerObject(gx + 9, gy - 4, 'STAIRS_TOGGLE', { houseId: currentId });
}

// js/cellDecorator.js

/**
 * Stamps a massive 200x200 Fortified Town with road-snapping logic
 * and a full residential/industrial district.
 */
export function planTown(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const wellObj = { x: gtx, y: gty, type: 102 }; // Create reference object
    plannedWells.push(wellObj);

    // ==========================================
    // 🎪 ZONE REGISTRATION (5x5 Constant-Time Indexing)
    // ==========================================
    const cx = Math.floor(gtx / 100);
    const cy = Math.floor(gty / 100);
    const townChunks = [];

    for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
            const tCX = cx + ox;
            const tCY = cy + oy;
            if (tCX >= 0 && tCX < CONFIG.MAP_SIZE && tCY >= 0 && tCY < CONFIG.MAP_SIZE) {
                townChunks.push({ cx: tCX, cy: tCY });
            }
        }
    }

    townChunks.forEach(c => {
        const chunkKey = `${c.cx}_${c.cy}`;
        zoneLookup.set(chunkKey, townChunks);
        zoneWellLookup.set(chunkKey, wellObj); // 👈 Direct O(1) link to the well
    });

    let roadTiles = [];
    for (let x = gtx - 90; x < gtx + 90; x++) {
        for (let y = gty - 90; y < gty + 90; y++) {
            const tid = getTileData(x*16, y*16, worldMatrix, roomMatrix).tileID;
            if (tid === 337 || tid === 208) roadTiles.push({x, y});
        }
    }
    const hasRoad = roadTiles.length > 0;

    // 1. Plan Uniques
    const uniqueBuildings = [
        { func: drawTownHall, w: 11, h: 12, count: 1 }, { func: drawInn, w: 8, h: 9, count: 1 }, { func: drawMilitaryQuarters, w: 10, h: 11, count: 1 },
        { func: drawBarracks, w: 6, h: 6, count: 1 }, { func: drawGeneralStore, w: 4, h: 4, count: 1 }, { func: drawBlacksmith, w: 6, h: 5, count: 1 },
        { func: drawForge, w: 4, h: 5, count: 1 }, { func: drawTemple, w: 4, h: 8, count: Math.floor(seededRandom() * 3) + 3 }
    ];
    // 2. Plan Residential
    const residential = [
        { func: drawTwoStoryHouse, w: 4, h: 4, count: Math.floor(seededRandom() * 3) + 5 },
        { func: drawHouse, w: 4, h: 3, count: Math.floor(seededRandom() * 17) + 40 },
    ];
    // 3. Plan Utilities
    const utilities = [
        { func: drawStorageRoom, w: 5, h: 5, count: Math.floor(seededRandom() * 5) + 6 }, 
        { func: drawRootCellar, w: 2, h: 3, count: Math.floor(seededRandom() * 9) + 12 },
    ];

    const placeBuildings = (bp, maxAttempts, snapToRoad) => {
        let placed = 0, attempts = 0;
        while (placed < bp.count && attempts < maxAttempts) {
            attempts++;
            let tx = gtx + Math.floor(seededRandom() * 180) - 90;
            let ty = gty + Math.floor(seededRandom() * 180) - 90;
            
            if (snapToRoad && hasRoad && attempts < maxAttempts * 0.75) {
                const road = roadTiles[Math.floor(seededRandom() * roadTiles.length)];
                const side = Math.floor(seededRandom() * 4);
                const offset = 2;
                if (side === 0) { tx = road.x; ty = road.y - offset - bp.h; }
                else if (side === 1) { tx = road.x; ty = road.y + offset; }
                else if (side === 2) { tx = road.x + offset; ty = road.y; }
                else { tx = road.x - offset - bp.w; ty = road.y; }
            }

            if (isAreaClear(tx, ty, bp.w, bp.h, worldMatrix, roomMatrix, worldMap)) {
                reserveFootprint(tx, ty, bp.w, bp.h, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                plannedBuildings.push({ func: bp.func, args: [tx, ty] });
                placed++;
            }
        }
    };

    uniqueBuildings.forEach(bp => placeBuildings(bp, 300, false));
    residential.forEach(bp => placeBuildings(bp, 1500, true));
    utilities.forEach(bp => placeBuildings(bp, 500, false));

    let ranchesPlaced = 0, ranchAttempts = 0;
    const ranchGoal = Math.floor(seededRandom() * 17) + 16; 
    
    let barnsPlaced = 0;
    const maxBarns = Math.floor(seededRandom() * 7) + 8; 
    
    let largeBarnsPlaced = 0;
    const maxLargeBarns = Math.floor(seededRandom() * 3) + 4; 

    while (ranchesPlaced < ranchGoal && ranchAttempts < 500) {
        ranchAttempts++;
        const rw = Math.floor(seededRandom() * 56) + 5; 
        const rh = Math.floor(seededRandom() * 56) + 5;
        const rx = gtx + Math.floor(seededRandom() * 180) - 90;
        const ry = gty + Math.floor(seededRandom() * 180) - 90;

        if (isAreaClear(rx, ry, rw, rh, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(rx, ry, rw, rh, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            const gateX = Math.floor(seededRandom() * (rw - 2)) + 1;
            
            let r_barnType = 'NONE';
            if (rw >= 20 && rh >= 20 && largeBarnsPlaced < maxLargeBarns) {
                r_barnType = 'LARGE_BARN';
                largeBarnsPlaced++;
            } else if (rw >= 6 && rh >= 6 && barnsPlaced < maxBarns && seededRandom() > 0.5) {
                r_barnType = 'BARN';
                barnsPlaced++;
            }

            plannedRanches.push({ gx: rx, gy: ry, w: rw, h: rh, gateX, barnType: r_barnType, wellX: gtx, wellY: gty });
            ranchesPlaced++;
        }
    }
}

/**
 * Spawns 3 smaller villages around the main town
 */
function drawTownSuburbs(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix) {
    for (let i = 0; i < 3; i++) {
        // 100 tiles = 1 Cell. 4-6 cells = 400-600 tiles.
        const dist = (Math.floor(Math.random() * 2) + 4) * 100;
        const angle = (Math.PI * 2 / 3) * i; // Distribute them in a triangle
        
        const subX = Math.floor(gtx + Math.cos(angle) * dist);
        const subY = Math.floor(gty + Math.sin(angle) * dist);

        // Reuse your existing village logic!
        //drawVillage(subX, subY, worldMatrix, roomMatrix, fertilityMatrix);
        console.log(` 🛖 Town Suburb ${i+1} spawned at [${subX}, ${subY}]`);
    }
}

// js/cellDecorator.js

// js/cellDecorator.js
export function drawCastle(gcx, gcy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // gcx/gcy = (cx * 100) + 100. This is the "Crosshair" of the 4 cells.

    // 1. THE 4-CELL WELL (SPLIT)
    // Top-Left Tile (In Cell TL)
    setGlobalTile(gcx - 1, gcy - 1, 30, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Top-Right Tile (In Cell TR)
    setGlobalTile(gcx,     gcy - 1, 31, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Bottom-Left Tile (In Cell BL)
    setGlobalTile(gcx - 1, gcy,     38, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Bottom-Right Tile (In Cell BR)
    setGlobalTile(gcx,     gcy,     39, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 2. MASSIVE FORTIFICATIONS (Centered on the well)
    // Outer Wall (200x200 footprint)
    drawFortifiedRing(gcx, gcy, 198, 198, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Inner Ward (100x100)
    drawFortifiedRing(gcx, gcy, 100, 100, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // The Keep (40x40)
    drawFortifiedRing(gcx, gcy, 40, 40, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
}


/**
 * Helper to draw a square wall with a gate
 */
function drawFortifiedRing(centerX, centerY, width, height, worldMatrix, roomMatrix) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    for (let x = -halfW; x < halfW; x++) {
        for (let y = -halfH; y < halfH; y++) {
            const isEdgeX = (x === -halfW || x === halfW - 1);
            const isEdgeY = (y === -halfH || y === halfH - 1);

            if (isEdgeX || isEdgeY) {
                const gx = centerX + x;
                const gy = centerY + y;

                // Create a 2-tile "Gate" at the South of every wall
                const isGate = (y === halfH - 1 && (x === 0 || x === -1));

                if (isGate) {
                    setGlobalTile(gx, gy, 6, 0, worldMatrix, roomMatrix); // Road
                } else {
                    setGlobalTile(gx, gy, 11, 0, worldMatrix, roomMatrix); // Wall
                }
            }
        }
    }
}



/**
 * Logic for a 2-tile wide path
 */
function drawSimpleRoad(gx, gy, dx, dy, length, worldMatrix, roomMatrix, fertilityMatrix) {
    let curX = gx;
    let curY = gy;

    for (let i = 0; i < length; i++) {

        // 1. FIRST: Calculate the coordinates (This defines cx, cy, lx, ly)
        const cx = Math.floor(curX / 100);
        const cy = Math.floor(curY / 100);
        const lx = ((curX % 100) + 100) % 100;
        const ly = ((curY % 100) + 100) % 100;

        // 2. 🛡️ THE WATER STOPPER (The Fix)
        // We check the specific tile [lx][ly] inside the cell [cx][cy]
        const currentTile = worldMatrix[cx]?.[cy]?.[lx]?.[ly];
        
        // If we hit Water (17) or Undefined (Edge of World), STOP the road immediately
        if (currentTile === 17 || currentTile === undefined) {
            console.log("🌊 Road hit water/edge at:", curX, curY);
            break; 
        }
        // Paint 2 tiles (The road width)
        // If moving vertically (dy), we paint 2 tiles horizontally
        // If moving horizontally (dx), we paint 2 tiles vertically
        for (let j = 0; j < 2; j++) {
            const rx = (dy !== 0) ? curX + j : curX;
            const ry = (dx !== 0) ? curY + j : curY;
            
            // Tile 42 is our "Path" tile
            setGlobalTile(rx, ry, 6, 0, worldMatrix, roomMatrix, fertilityMatrix);
        }

        // --- 🎲 PROCEDURAL "WOBBLE" ---
        // 10% chance to turn 90 degrees (Elbow)
        if (Math.random() < 0.10) {
            const oldDx = dx;
            dx = dy;
            dy = oldDx;
        }

        curX += dx;
        curY += dy;
        
        
    }
}

// ==========================================
// 🛣️ UPDATED ROAD PAINTER
// ==========================================
// ==========================================
// 🛣️ HIGH-SPEED ROAD PAINTER (Fixed Diagonals)
// ==========================================
// ==========================================
// 🛣️ HIGH-SPEED ROAD PAINTER
// ==========================================
export function drawInterCellRoad(startX, startY, endX, endY, worldMatrix, roomMatrix, fertilityMatrix, worldMap, tileID = 337, thickness = 3, avoidObstacles = false) {
    let curX = startX, curY = startY;
    let lastX = -1, lastY = -1; 
    const isCastleRoad = (thickness >= 6);

    let dx = Math.abs(endX - startX), dy = -Math.abs(endY - startY);
    let sx = startX < endX ? 1 : -1, sy = startY < endY ? 1 : -1;
    let err = dx + dy;

    // Organic Wiggle Settings
    const wiggleFrequency = 15;
    const wiggleAmplitude = avoidObstacles ? 1 : 2; // Tighter wiggle if dodging things

    const paintTile = (targetX, targetY) => {
        const cx = Math.floor(targetX / 100), cy = Math.floor(targetY / 100);
        if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;
        const lx = ((targetX % 100) + 100) % 100, ly = ((targetY % 100) + 100) % 100;
        const idx = (ly * 100) + lx;

        // Inside drawInterCellRoad -> paintTile()
        // 🛑 OBSTACLE AVOIDANCE: 4x4 check (1-tile buffer)
        if (avoidObstacles) {
            for (let ox = -1; ox <= 1; ox++) {
                for (let oy = -1; oy <= 1; oy++) {
                    const checkX = targetX + ox;
                    const checkY = targetY + oy;
                    const cCX = Math.floor(checkX / 100), cCY = Math.floor(checkY / 100);
                    if (worldMatrix[cCX]?.[cCY]) {
                        const cLX = ((checkX % 100) + 100) % 100;
                        const cLY = ((checkY % 100) + 100) % 100;
                        const rID = roomMatrix[cCX][cCY][cLY * 100 + cLX];
                        const tID = worldMatrix[cCX][cCY][cLY * 100 + cLX];
                        if (rID === 9998 || [18, 21, 24].includes(tID)) return;
                    }
                }
            }
        }

        const globalIdx = (cy * 100 + ly) * CONFIG.MAP_SIZE + (cx * 100 + lx);
        let finalTile = tileID;
        if (worldMap[globalIdx] < CONFIG.LAND_THRESHOLD) finalTile = isCastleRoad ? 13 : 12; 
        
        setGlobalTile(targetX, targetY, finalTile, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    };

    let steps = 0;
    while (steps++ < 20000) {
        const wave = Math.sin(steps / wiggleFrequency) * wiggleAmplitude;
        let brushX = curX;
        let brushY = curY;

        if (Math.abs(dx) > Math.abs(dy)) brushY += Math.floor(wave);
        else brushX += Math.floor(wave);

        if (curX !== lastX || curY !== lastY) {
            if (thickness <= 2) {
                for (let ox = 0; ox < thickness; ox++) {
                    for (let oy = 0; oy < thickness; oy++) paintTile(brushX + ox, brushY + oy);
                }
            } else {
                const radius = Math.floor(thickness / 2);
                for (let ox = -radius - 1; ox <= radius + 1; ox++) {
                    for (let oy = -radius - 1; oy <= radius + 1; oy++) {
                        if (ox * ox + oy * oy <= radius * radius + 1) paintTile(brushX + ox, brushY + oy);
                    }
                }
            }
            lastX = curX; lastY = curY;
        }

        if (curX === endX && curY === endY) break;
        let e2 = 2 * err;
        if (e2 >= dy) { err += dy; curX += sx; }
        if (e2 <= dx) { err += dx; curY += sy; }
    }
}



function paintSide(cellData, startVal, side) {
    let beachLength = startVal;

    for (let i = 0; i < 100; i++) {
        let outOf2 = Math.floor(seededRandom() * 2) + 1;
        if (outOf2 == 1 && beachLength < CONFIG.WOBBLE_MAX) beachLength++;
        if (outOf2 == 2 && beachLength > 2) beachLength--;

        for (let j = 0; j < beachLength; j++) {
            let lx, ly;
            if (side === "NORTH") { lx = i; ly = j; }
            if (side === "SOUTH") { lx = i; ly = 99 - j; }
            if (side === "WEST")  { lx = j; ly = i; }
            if (side === "EAST")  { lx = 99 - j; ly = i; }
            
            const idx = (ly * 100) + lx;
            
            // 🛡️ PROTECTION: Do not overwrite Roads or Bridges with Sand
            const t = cellData[idx];
            if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;
            
            cellData[idx] = 0; // Paint Sand (0)
        }
    }
    return beachLength;
}

function paintCorner(cellData, hWidth, vWidth, type) {
    // We check a square area large enough to cover the beach widths
    const size = Math.max(hWidth, vWidth, 25); 

    for (let ly = 0; ly < size; ly++) {
        for (let lx = 0; lx < size; lx++) {
            // THE SMOOTHING MATH: Elliptical Distance
            const dist = (lx / vWidth) ** 2 + (ly / hWidth) ** 2;

            if (dist <= 1.0) {
                let fx = lx, fy = ly;
                // Map to the correct corner of the 100x100 cell
                if (type === "NE") fx = 99 - lx;
                if (type === "SW") fy = 99 - ly;
                if (type === "SE") { fx = 99 - lx; fy = 99 - ly; }

                // Bounds safety
                if (fx >= 0 && fx < 100 && fy >= 0 && fy < 100) {
                    const idx = (fy * 100) + fx;
                    
                    // 🛡️ PROTECTION: Do not overwrite Roads or Bridges with Sand
                    const t = cellData[idx];
                    if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;

                    cellData[idx] = 0; // Sand
                }
            }
        }
    }
}

function paintLandSide(cellData, fertilityData, startVal, side) {
    let lLen = startVal;
    for (let i = 0; i < 100; i++) {
        let outOf2 = Math.floor(seededRandom() * 2) + 1;
        if (outOf2 == 1 && lLen < 15) lLen++;
        if (outOf2 == 2 && lLen > 1) lLen--;

        for (let j = 0; j < lLen; j++) {
            let lx, ly;
            if (side === "NORTH") { lx = i; ly = j; }
            if (side === "SOUTH") { lx = i; ly = 99 - j; }
            if (side === "WEST")  { lx = j; ly = i; }
            if (side === "EAST")  { lx = 99 - j; ly = i; }
            
            const idx = (ly * 100) + lx;
            
            // 🛡️ PROTECTION: Do not overwrite Roads or Bridges with Grass
            const t = cellData[idx];
            if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;

            cellData[idx] = 63; // Paint Land
            fertilityData[idx] = 12; // Paint Fertility
        }
    }
    return lLen;
}

function paintLandCorner(cellData, fertilityData, hWidth, vWidth, type) {
    const size = Math.max(hWidth, vWidth, 15);

    for (let ly = 0; ly < size; ly++) {
        for (let lx = 0; lx < size; lx++) {
            const dist = (lx / vWidth) ** 2 + (ly / hWidth) ** 2;

            if (dist <= 1.0) {
                let fx = lx, fy = ly;
                if (type === "NE") fx = 99 - lx;
                if (type === "SW") fy = 99 - ly;
                if (type === "SE") { fx = 99 - lx; fy = 99 - ly; }

                if (fx >= 0 && fx < 100 && fy >= 0 && fy < 100) {
                    const idx = (fy * 100) + fx;
                    
                    // 🛡️ PROTECTION: Do not overwrite Roads or Bridges with Grass
                    const t = cellData[idx];
                    if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;

                    cellData[idx] = 63; // Paint Land
                    fertilityData[idx] = 12; // Paint Fertility
                }
            }
        }
    }
}

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// src/cellDecorator.js


// ... scroll down to decorateCell ...

export function decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    if (!fertilityMatrix) return;
    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return; 

    const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
    const cellType = worldMap[blueprintIdx];
    const isLand = cellType >= CONFIG.LAND_THRESHOLD || cellType >= 100;
    const cellKey = `${cx}_${cy}`;

    // ECOSYSTEM GENERATION (Runs EXACTLY ONCE when the player arrives at this chunk)
    if (!ecoGenerated.has(cellKey)) {
        ecoGenerated.add(cellKey);

        // 🏗️ LAZY STRUCTURE STAMPING (Constructs buildings for this chunk only)
        stampStructuresForChunk(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // ==========================================
        // 🌲 TREE SPAWNER (Forests, Coastlines, & Settlements)
        // ==========================================
        
        // 1. Determine if this cell belongs to a Forest region
        let isForestRegion = (cellType === 104 || !isLand);

        // 2. If it's a settlement or camp, check its neighbors to see what biome it sits inside!
        if (cellType === 101 || cellType === 102 || cellType === 103 || cellType === 107) {
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const nx = cx + ox, ny = cy + oy;
                    if (nx >= 0 && nx < CONFIG.MAP_SIZE && ny >= 0 && ny < CONFIG.MAP_SIZE) {
                        const neighborType = worldMap[ny * CONFIG.MAP_SIZE + nx];
                        // If it touches a Forest or Water, it gets trees!
                        if (neighborType === 104 || neighborType < CONFIG.LAND_THRESHOLD) {
                            isForestRegion = true;
                        }
                    }
                }
            }
        }

        // 3. Only spawn trees if we confirmed we are in a forest region
        if (isForestRegion) {
            setWorldSeed((window.worldSeed || 1) + (cx * 1000) + cy + 777);
            
            // Denser inside the forest/village, slightly sparser on deep coastlines
            const spawnThreshold = (cellType === 104 || cellType === 101 || cellType === 102 || cellType === 103 || cellType === 107) ? 0.55 : 0.80;
            
            for (let ly = 0; ly < 100; ly++) { 
                for (let lx = 0; lx < 100; lx++) { 
                    const idx = (ly * 100) + lx;
                    
                    if (worldMatrix[cx][cy][idx] === 63 && roomMatrix[cx][cy][idx] === 0) {
                        
                        if (seededRandom() > spawnThreshold) { 
                            const gx = (cx * 100) + lx;
                            const gy = (cy * 100) + ly;
                            
                            // Check if this tile is inside the protected Ring Road polygon!
                            if (typeof isInsideVillagePolygon === 'function' && isInsideVillagePolygon(gx, gy)) continue;
                            
                            // Allow trees to overlap each other (406, 407), but stay away from roads/buildings!
                            let isClear = true;
                            for (let ox = -1; ox <= 2; ox++) {
                                for (let oy = 0; oy <= 3; oy++) {
                                    const tCX = Math.floor((gx + ox) / 100);
                                    const tCY = Math.floor((gy + oy) / 100);
                                    
                                    if(tCX >= 0 && tCX < CONFIG.MAP_SIZE && tCY >= 0 && tCY < CONFIG.MAP_SIZE) {
                                        if(worldMatrix[tCX] && worldMatrix[tCX][tCY]) {
                                            const tLX = (((gx + ox) % 100) + 100) % 100;
                                            const tLY = (((gy + oy) % 100) + 100) % 100;
                                            const tID = worldMatrix[tCX][tCY][tLY * 100 + tLX];
                                            
                                            if (tID !== 63 && tID !== 406 && tID !== 407) {
                                                isClear = false;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            if (isClear) {
                                registerObject(gx, gy, 'FOREST_TREE');
                                setGlobalTile(gx, gy + 2, 406, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                                setGlobalTile(gx + 1, gy + 2, 407, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // 🌻 FLORA SPAWNER
        // ==========================================
        setWorldSeed((window.worldSeed || 1) + (cx * 1000) + cy + 999);
        
        for (let ly = 0; ly < 100; ly++) {
            for (let lx = 0; lx < 100; lx++) {
                const idx = (ly * 100) + lx;
                const rID = roomMatrix[cx][cy][idx];

                // ONLY spawn plants on natural grass (63) and outdoors
                if (worldMatrix[cx][cy][idx] === 63 && (rID === 0 || rID === 9999)) {
                    if (seededRandom() > 0.50) {
                        const initialAge = Math.floor(seededRandom() * 100);
                        const roll = seededRandom();

                        let plantType = 'grass'; 
                        if (roll > 0.95) plantType = 'sunflower'; 
                        else if (roll > 0.85) plantType = 'rose'; 
                        else if (roll > 0.70) plantType = 'violet'; 

                        let requiredFertility = 3; 
                        if (plantType === 'sunflower') requiredFertility = 12;
                        if (plantType === 'rose' || plantType === 'violet') requiredFertility = 8;

                        if (fertilityMatrix[cx][cy][idx] >= requiredFertility) {
                            createPlant((cx * 100) + lx, (cy * 100) + ly, fertilityMatrix, initialAge, plantType);
                        }
                    }
                }
            }
        }
    }
}










/**
 * Main function to turn a 1-100 map into a Tile-ID map
 */
// js/cellDecorator.js

// js/worldPopulator.js

export function populateWorld(worldMap) {
    const size = CONFIG.MAP_SIZE;

    // 1. PRE-SCAN: Decide where Villages, Towns, and Camps go
    for (let i = 0; i < worldMap.length; i++) {
        const isLand = worldMap[i] >= CONFIG.LAND_THRESHOLD;
        if (isLand) {
            const roll = seededRandom(); 
            if (roll > 1.99995177469) worldMap[i] = 103; // Castle
            else if (roll > 1.99942129629) worldMap[i] = 102; // Town
            else if (roll > 0.9978) worldMap[i] = 107; // MINING CAMP
            else if (roll > 0.99305555555) worldMap[i] = 101; // Village
        }
    }

    // 2. 🌟 NEW: GLOBALLY INITIALIZE ALL CHUNKS!
    let worldMatrix = Array.from({ length: size }, () => new Array(size));
    let roomMatrix = Array.from({ length: size }, () => new Array(size));
    let fertilityMatrix = Array.from({ length: size }, () => new Array(size));

    for (let cx = 0; cx < size; cx++) {
        for (let cy = 0; cy < size; cy++) {
            const isLand = worldMap[(cy * size) + cx] >= CONFIG.LAND_THRESHOLD || worldMap[(cy * size) + cx] >= 100;
            worldMatrix[cx][cy] = new Uint16Array(10000).fill(isLand ? 63 : 17);
            roomMatrix[cx][cy] = new Uint16Array(10000).fill(0);
            fertilityMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 12 : 0);
        }
    }

    console.log("🗺️ World Blueprint and Chunks Initialized!");
    return { worldMatrix, roomMatrix, fertilityMatrix, worldMap };
}

// js/worldPopulator.js

export function linkVillages(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    const size = CONFIG.MAP_SIZE;
    const adjacencyList = new Map(); 

    // 1. COLLECT ALL NODES & CALCULATE EXACT POSITIONS
    // This uses the exact same logic as building placement so the roads lead to the correct spots
    const settlements = [];
    const seed = window.worldSeed || 1; 

    for (let i = 0; i < worldMap.length; i++) {
        if (worldMap[i] === 102 || worldMap[i] === 101 || worldMap[i] === 103) {
            const type = worldMap[i];
            const cx = i % size;
            const cy = Math.floor(i / size);
            
            let tx, ty;
            if (type === 103) {
                // Castle center (Split across 4 cells)
                tx = cx * 100 + 100; ty = cy * 100 + 100; 
            } else if (type === 102) {
                // Town center (Dead center of chunk)
                tx = cx * 100 + 50; ty = cy * 100 + 50; 
            } else {
                // Village: Deterministic random position within the chunk
                const hash = Math.abs(Math.sin((cx + seed) * 12.9898 + (cy + seed) * 78.233) * 43758.5453);
                const offX = Math.floor(hash * 60) % 60 + 20;
                const offY = Math.floor((hash * 10) * 60) % 60 + 20;
                
                tx = cx * 100 + offX;
                ty = cy * 100 + offY;
            }

            settlements.push({ id: i, type, x: cx, y: cy, tx, ty });
        }
    }

    // 2. UNIFIED SMART ROAD PASS
    // Connects nearby settlements into a network
    for (let i = 0; i < settlements.length; i++) {
        const A = settlements[i];

        for (let j = i + 1; j < settlements.length; j++) {
            const B = settlements[j];

            const dxAB = A.x - B.x;
            const dyAB = A.y - B.y;
            const distSqAB = (dxAB * dxAB) + (dyAB * dyAB);

            // Distance rules: Castles connect far, Towns medium, Villages close
            let maxRangeSq = 64; 
            if (A.type === 103 || B.type === 103) maxRangeSq = 2500; 
            else if (A.type === 102 && B.type === 102) maxRangeSq = 400; 

            if (distSqAB > 0 && distSqAB <= maxRangeSq) {
                let redundant = false;

                // Relative Neighborhood Graph check: Only connect if no closer settlement exists between A and B
                for (let k = 0; k < settlements.length; k++) {
                    if (k === i || k === j) continue;
                    const C = settlements[k];

                    const dxAC = A.x - C.x; const dyAC = A.y - C.y;
                    const distSqAC = (dxAC * dxAC) + (dyAC * dyAC);

                    const dxBC = B.x - C.x; const dyBC = B.y - C.y;
                    const distSqBC = (dxBC * dxBC) + (dyBC * dyBC);

                    if (distSqAC < distSqAB && distSqBC < distSqAB) {
                        redundant = true;
                        break;
                    }
                }

                if (!redundant) {
                    if (!adjacencyList.has(A.id)) adjacencyList.set(A.id, []);
                    if (!adjacencyList.has(B.id)) adjacencyList.set(B.id, []);
                    adjacencyList.get(A.id).push(B);
                    adjacencyList.get(B.id).push(A);

                    // 🌟 YOUR FIX: Stamp a 2x2 dirt pad ONLY because a road is connecting!
                    for(let ox=0; ox<2; ox++) {
                        for(let oy=0; oy<2; oy++) {
                            setGlobalTile(A.tx + ox, A.ty + oy, 337, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                            setGlobalTile(B.tx + ox, B.ty + oy, 337, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                        }
                    }

                    // Draw the base highway (Thickness 5)
                    drawInterCellRoad(
                        A.tx, A.ty, 
                        B.tx, B.ty, 
                        worldMatrix, roomMatrix, fertilityMatrix, worldMap, 
                        337, 2
                    );
                }
            }
        }
    }

    // 3. THE PRESTIGE PASS (Cascaded Upgrades)
    // Upgrades the road thickness/style for main paths between cities
    const castles = settlements.filter(s => s.type === 103);
    castles.forEach(start => {
        castles.forEach(end => {
            if (start.id === end.id) return;
            promotePath(start, end, adjacencyList, 8, 6, 2500, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        });
    });

    const hubs = settlements.filter(s => s.type >= 102); 
    hubs.forEach(start => {
        hubs.forEach(end => {
            if (start.id === end.id) return;
            if (start.type === 102 || end.type === 102) {
                promotePath(start, end, adjacencyList, 208, 2, 900, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            }
        });
    });

    // NOTE: Buildings are now stamped by calling stampSettlements(worldMap...) 
    // after this function finishes in game.js mainInit sequence.
}


function findNearestInBlueprint(startX, startY, targetType, maxRange, worldMap, size, selfIdx = -1) {
    let nearest = null;
    let minDist = maxRange + 1;

    for (let i = 0; i < worldMap.length; i++) {
        if (i === selfIdx) continue;
        if (worldMap[i] === targetType) {
            const tx = i % size;
            const ty = Math.floor(i / size);
            const dist = Math.abs(startX - tx) + Math.abs(startY - ty);
            
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: tx, y: ty };
            }
        }
    }
    return nearest;
}

function findPathInNetwork(start, target, adj) {
    let queue = [[start]];
    let visited = new Set([start.id]);

    while (queue.length > 0) {
        let path = queue.shift();
        let node = path[path.length - 1];

        if (node.id === target.id) return path;

        for (let neighbor of (adj.get(node.id) || [])) {
            if (!visited.has(neighbor.id)) {
                visited.add(neighbor.id);
                queue.push([...path, neighbor]);
            }
        }
    }
    return []; // No path found
}

// Add worldMatrix, roomMatrix, fertilityMatrix, worldMap to the end
function promotePath(startNode, endNode, adj, tileID, thickness, maxRangeSq, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const dx = startNode.x - endNode.x;
    const dy = startNode.y - endNode.y;
    if ((dx * dx + dy * dy) > maxRangeSq) return;

    let path = findPathInNetwork(startNode, endNode, adj);
    // Find `promotePath` and update the drawInterCellRoad call:
    if (path && path.length > 1) {
        for (let i = 0; i < path.length - 1; i++) {
            const [segA, segB] = [path[i], path[i+1]].sort((a, b) => a.id - b.id);

            // 👇 THE FIX: Use segA.tx instead of segA.x * 100
            drawInterCellRoad(
                segA.tx, segA.ty, 
                segB.tx, segB.ty, 
                worldMatrix, roomMatrix, fertilityMatrix, worldMap, 
                tileID, thickness
            );
        }
    }
}






const decoratedCells = new Set(); 

export function ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);

    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const cx = heroCX + ox;
            const cy = heroCY + oy;

            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) continue;

            const cellKey = `${cx}_${cy}`;
            const zone = zoneLookup.get(cellKey);

            // ==========================================
            // 🎪 STEP 1: LAZY LOADING / STRUCTURE STAMPING
            // ==========================================
            if (zone) {
                const zoneWell = zoneWellLookup.get(cellKey);
                if (zoneWell) {
                    const zoneKey = `${zoneWell.x}_${zoneWell.y}`;
                    
                    // 🎯 CONSTANT-TIME GATE: Only call init if this zone is brand new!
                    if (!initializedZones.has(zoneKey)) {
                        ensureZoneInitialized(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                    }
                }
            } else {
                // WILDERNESS LOADING: Load this single chunk normally
                if (!decoratedCells.has(cellKey)) {
                    decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                    decoratedCells.add(cellKey);
                }
            }

            // ==========================================
            // 🌟 STEP 2: MODULAR AUTO-TILING LAZY LOAD
            // ==========================================
            autoTileLayerChunk(cx, cy, worldMatrix, [0, 10, 11, 17], 0, 'sand');
            autoTileLayerChunk(cx, cy, worldMatrix, [208], 208, 'stone');
            autoTileLayerChunk(cx, cy, worldMatrix, [337], 337, 'dirt');
        }
    }
}

// A simple function to physically carve a 3-tile wide river of water (Tile 17)
function drawRiverPath(startX, startY, endX, endY, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    let curX = startX;
    let curY = startY;
    let steps = 0;
    const maxSteps = 200000; // Big enough to cross the map

    while ((curX !== endX || curY !== endY) && steps < maxSteps) {
        steps++;

        // Simple Manhattan Stepping
        if (Math.abs(curX - endX) > Math.abs(curY - endY)) {
            if (curX < endX) curX++; else curX--;
        } else {
            if (curY < endY) curY++; else curY--;
        }

        // A simple 3x3 brush of physical Water (Tile 17)
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                // We use your existing setGlobalTile function to safely place Water!
                setGlobalTile(curX + ox, curY + oy, 17, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            }
        }
    }
}

// Connects the lakes using actual physical Tile coordinates
export function linkLakes(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    if (!window.geography || !window.geography.lakes || window.geography.lakes.length < 2) return;

    const lakes = window.geography.lakes;
    const lakeCenters = [];

    // 1. Get the center TILE coordinate of each lake
    for (let i = 0; i < lakes.length; i++) {
        let sumX = 0, sumY = 0;
        for (let idx of lakes[i]) {
            sumX += idx % CONFIG.MAP_SIZE;
            sumY += Math.floor(idx / CONFIG.MAP_SIZE);
        }
        const cx = Math.floor(sumX / lakes[i].length);
        const cy = Math.floor(sumY / lakes[i].length);

        lakeCenters.push({
            id: i,
            // Convert chunk coordinates to exact Tile coordinates (center of the chunk)
            tx: cx * 100 + 50, 
            ty: cy * 100 + 50
        });
    }

    // 2. Connect each lake to its closest neighbor
    for (let i = 0; i < lakeCenters.length; i++) {
        const lakeA = lakeCenters[i];
        let closestLake = null;
        let shortestDist = Infinity;

        for (let j = 0; j < lakeCenters.length; j++) {
            if (i === j) continue;
            
            const dist = Math.abs(lakeA.tx - lakeCenters[j].tx) + Math.abs(lakeA.ty - lakeCenters[j].ty);
            if (dist < shortestDist) {
                shortestDist = dist;
                closestLake = lakeCenters[j];
            }
        }

        if (closestLake) {
            drawRiverPath(lakeA.tx, lakeA.ty, closestLake.tx, closestLake.ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }
    console.log("🌊 Lakes connected with physical rivers.");
}

// ==========================================
// 🛣️ AUTO-TILING SYSTEM
// ==========================================
// 🛣️ UNIFIED MODULAR AUTO-TILING
// ==========================================
const autoTileCache = new Map();

export function autoTileLayerChunk(cx, cy, worldMatrix, baseIds, fillTileId, layerName) {
    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;
    
    // Setup a specific cache for this layer (sand, stone, dirt, etc.)
    if (!autoTileCache.has(layerName)) autoTileCache.set(layerName, new Set());
    const cache = autoTileCache.get(layerName);
    
    const key = `${cx}_${cy}`;
    if (cache.has(key)) return;
    cache.add(key);

    if (!worldMatrix[cx]?.[cy]) return;

    // Helper: Is the neighbor one of our target base layers?
    const isBase = (gx, gy) => {
        const tCX = Math.floor(gx / 100), tCY = Math.floor(gy / 100);
        if (tCX < 0 || tCX >= CONFIG.MAP_SIZE || tCY < 0 || tCY >= CONFIG.MAP_SIZE) return false;
        if (!worldMatrix[tCX]?.[tCY]) return false;
        const lx = ((gx % 100) + 100) % 100, ly = ((gy % 100) + 100) % 100;
        return baseIds.includes(worldMatrix[tCX][tCY][ly * 100 + lx]);
    };

    const newTiles = [];

    for (let ly = 0; ly < 100; ly++) {
        for (let lx = 0; lx < 100; lx++) {
            const gx = cx * 100 + lx;
            const gy = cy * 100 + ly;

            // ONLY run on GRASS (63) tiles that are NEXT to the base layer
            if (worldMatrix[cx][cy][ly * 100 + lx] === 63 && !isBase(gx, gy)) {
                
                const n = isBase(gx, gy - 1) ? 1 : 0;
                const s = isBase(gx, gy + 1) ? 8 : 0;
                const e = isBase(gx + 1, gy) ? 4 : 0;
                const w = isBase(gx - 1, gy) ? 2 : 0;

                const nw = isBase(gx - 1, gy - 1);
                const ne = isBase(gx + 1, gy - 1);
                const sw = isBase(gx - 1, gy + 1);
                const se = isBase(gx + 1, gy + 1);

                const mask = n | w | e | s;
                let borderTile = null;

                // EXACT USER MAPPING FOR CORNERS
                if (mask === 3) borderTile = 302; 
                else if (mask === 5) borderTile = 304; 
                else if (mask === 10) borderTile = 350; 
                else if (mask === 12) borderTile = 354; 
                
                // EXACT USER MAPPING FOR SIDES
                else if (mask === 1) borderTile = 303; 
                else if (mask === 2) borderTile = 331; 
                else if (mask === 4) borderTile = 335; 
                else if (mask === 8) borderTile = 367; 
                
                // SQUEEZED GAPS -> Fill with the solid Base Tile
                else if (mask === 6 || mask === 9 || mask === 7 || mask === 11 || mask === 13 || mask === 14 || mask === 15) {
                    borderTile = fillTileId; 
                }
                
                // EXACT USER MAPPING FOR INNER ELBOWS
                else if (mask === 0) {
                    if (nw) borderTile = 313;      
                    else if (ne) borderTile = 315; 
                    else if (sw) borderTile = 351; 
                    else if (se) borderTile = 353; 
                }

                if (borderTile !== null) {
                    newTiles.push({ idx: ly * 100 + lx, tile: borderTile });
                }
            }
        }
    }

    // Apply all changes at once!
    for (const update of newTiles) {
        worldMatrix[cx][cy][update.idx] = update.tile;
        
        // Clear plants if the auto-tiler filled the gap with solid base layer!
        if (update.tile === fillTileId) {
            import('./plants.js').then(m => m.plants.delete(`${cx * 100 + (update.idx % 100)}_${cy * 100 + Math.floor(update.idx / 100)}`));
        }
    }
}


// Add this helper function near the top or bottom of cellDecorator.js

export function stampStructuresForChunk(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // 1. Construct standard buildings (Houses, Halls, Temples, Shops, etc.)
    plannedBuildings.forEach(b => {
        const bCX = Math.floor(b.args[0] / 100);
        const bCY = Math.floor(b.args[1] / 100);
        
        // If the building's origin coordinate falls inside this chunk, construct it
        if (bCX === cx && bCY === cy) {
            b.func(b.args[0], b.args[1], worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });

    // 2. Construct Ranches
    plannedRanches.forEach(r => {
        const rCX = Math.floor(r.gx / 100);
        const rCY = Math.floor(r.gy / 100);
        
        if (rCX === cx && rCY === cy) {
            drawRanch(r.gx, r.gy, r.w, r.h, r.gateX, r.barnType, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });

    // 3. Construct Wells
    plannedWells.forEach(w => {
        const wCX = Math.floor(w.x / 100);
        const wCY = Math.floor(w.y / 100);
        
        if (wCX === cx && wCY === cy) {
            const currentTile = getTileData(w.x * 16, w.y * 16, worldMatrix, roomMatrix).tileID;
            const wellId = (currentTile >= 300 && currentTile < 400) ? 998 : 999;
            
            setGlobalTile(w.x, w.y, 30, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(w.x + 1, w.y, 31, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(w.x, w.y + 1, 38, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(w.x + 1, w.y + 1, 39, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });
}

// ==========================================
// 🧠 SMART PATHFINDING HELPERS
// ==========================================
// ==========================================

// ==========================================
// 🏗️ PIPELINE EXECUTORS
// ==========================================

export function planAllSettlements(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    plannedBuildings = []; plannedRanches = []; plannedWells = [];
    const size = CONFIG.MAP_SIZE;
    const seed = window.worldSeed || 1; 

    for (let i = 0; i < worldMap.length; i++) {
        const type = worldMap[i];
        
        if (type === 101 || type === 102 || type === 103 || type === 107) {
            const cx = i % size, cy = Math.floor(i / size);
            let tx, ty;
            
            if (type === 103) { tx = cx * 100 + 100; ty = cy * 100 + 100; } 
            else if (type === 102) { tx = cx * 100 + 50; ty = cy * 100 + 50; } 
            else {
                const hash = Math.abs(Math.sin((cx + seed) * 12.9898 + (cy + seed) * 78.233) * 43758.5453);
                tx = cx * 100 + (Math.floor(hash * 60) % 60 + 20);
                ty = cy * 100 + (Math.floor((hash * 10) * 60) % 60 + 20);
            }

            if (type === 101) planVillage(tx, ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            else if (type === 102) planTown(tx, ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            else if (type === 103) {
                reserveFootprint(tx - 100, ty - 100, 200, 200, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                plannedBuildings.push({ func: drawCastle, args: [tx, ty] });
            }
            else if (type === 107) {
                planMiningCamp(tx, ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            }
        }
    }
}

// ==========================================
// 🚜 PLANNED RANCH ROADS (Obstacle Aware)
// ==========================================
// ==========================================
// 🚜 PLANNED RANCH ROADS (Clean Driveways)
// ==========================================
// ==========================================
// 🚜 PLANNED RANCH ROADS
// ==========================================
// ==========================================
// 🚜 PLANNED RANCH ROADS (Clean Driveways)
// ==========================================
// ==========================================
// 🚜 PLANNED RANCH ROADS (No Driveway, 1-Tile Buffer)
// ==========================================
// 🛤️ INTERNAL SETTLEMENT ROADS
// ==========================================
// 🚜 PLANNED RANCH ROADS
// ==========================================
export function drawPlannedRanchRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, targetWellX = null, targetWellY = null) {
    
    // 🚀 Helper: 1x1 Road + 1-Tile Buffer = 3x3 Check
    function isRanchStepBlocked(tx, ty) {
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                const x = tx + ox, y = ty + oy;
                const cx = Math.floor(x / 100), cy = Math.floor(y / 100);
                if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return true;
                if (!worldMatrix[cx]?.[cy]) continue;

                const lx = ((x % 100) + 100) % 100, ly = ((y % 100) + 100) % 100;
                const tID = worldMatrix[cx][cy][ly * 100 + lx];
                const rID = roomMatrix[cx][cy][ly * 100 + lx];

                // 🛑 Block on Blueprints (9998), Water (17), or Fences (18, 21, 24)
                if (rID === 9998 || [17, 18, 21, 24].includes(tID)) return true;
            }
        }
        return false;
    }

    plannedRanches.forEach(r => {
        // 🛑 FILTER: Skip ranches that do not belong to the target well being initialized
        if (targetWellX !== null && (r.wellX !== targetWellX || r.wellY !== targetWellY)) return;
        // 🌟 DYNAMIC TILE FIX: Check if the well belongs to a Town (102) to use paved road (208)
        const well = plannedWells.find(w => w.x === r.wellX && w.y === r.wellY);
        const roadTileID = 337; // Always use organic dirt for ranch driveways


        let targetX = r.wellX, targetY = r.wellY;
        let minDist = Math.abs(r.gx + r.gateX - r.wellX) + Math.abs(r.gy - r.wellY);

        // 1. Scan for nearest highway (337), paved road (208), or old road (6) to merge into
        for (let ox = -30; ox <= 30; ox++) {
            for (let oy = -30; oy <= 30; oy++) {
                const checkX = r.gx + r.gateX + ox, checkY = r.gy + oy;
                const cx = Math.floor(checkX / 100), cy = Math.floor(checkY / 100);
                
                if (cx >= 0 && cx < CONFIG.MAP_SIZE && cy >= 0 && cy < CONFIG.MAP_SIZE) {
                    if (worldMatrix[cx]?.[cy]) {
                        const lx = ((checkX % 100) + 100) % 100, ly = ((checkY % 100) + 100) % 100;
                        const tID = worldMatrix[cx][cy][ly * 100 + lx];
                        if (tID === 337 || tID === 208 || tID === 6) {
                            const d = Math.abs(ox) + Math.abs(oy);
                            if (d < minDist) { 
                                minDist = d; 
                                targetX = checkX; 
                                targetY = checkY; 
                            }
                        }
                    }
                }
            }
        }

        const gateX = r.gx + r.gateX;
        const gateY = r.gy;

        // Start EXACTLY 2 tiles below the gate.
        let startX = gateX;
        let startY = gateY + 2; 

        // If the start tile itself is somehow blocked by another building's buffer, abort to prevent a crash
        if (isRanchStepBlocked(startX, startY)) return;

        let openSet = [{ x: startX, y: startY, g: 0, f: 0, path: [] }];
        let closedSet = new Set([`${startX}_${startY}`]);
        let steps = 0;
        let finalPath = null;

        // 2. TRUE A* PATHFINDING
        while (openSet.length > 0 && steps++ < 2000) {
            let lowestIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
            }
            let curr = openSet.splice(lowestIdx, 1)[0];

            if (Math.abs(curr.x - targetX) <= 1 && Math.abs(curr.y - targetY) <= 1) {
                finalPath = curr.path;
                // 🌟 FIX 1: Push the final target so the road touches the highway seamlessly!
                finalPath.push({ x: targetX, y: targetY }); 
                break;
            }

            const neighbors = [
                {x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0},
                {x:1, y:1}, {x:-1, y:-1}, {x:1, y:-1}, {x:-1, y:1}
            ];

            for (let n of neighbors) {
                let nx = curr.x + n.x, ny = curr.y + n.y;
                let key = `${nx}_${ny}`;

                if (!closedSet.has(key) && !isRanchStepBlocked(nx, ny)) {
                    closedSet.add(key);
                    let cost = (n.x !== 0 && n.y !== 0) ? 1.4 : 1; 
                    let g = curr.g + cost;
                    let h = Math.abs(nx - targetX) + Math.abs(ny - targetY); 
                    openSet.push({ x: nx, y: ny, g: g, f: g + h, path: [...curr.path, {x: nx, y: ny}] });
                }
            }
        }

        // 3. DRAW THE ROAD
        if (finalPath) {
            // 🌟 FIX 2: Manually paint the starting tile so it doesn't leave a gap at the gate!
            setGlobalTile(startX, startY, roadTileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

            let prevX = startX, prevY = startY;

            finalPath.forEach(node => {
                // If we moved diagonally, fill the corner (L-Shape) to prevent 1-tile fractures
                if (Math.abs(node.x - prevX) > 0 && Math.abs(node.y - prevY) > 0) {
                    setGlobalTile(prevX, node.y, roadTileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                }

                // Stamp the actual 1x1 road node (Removed the redundant ox < 1 loops!)
                setGlobalTile(node.x, node.y, roadTileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                
                prevX = node.x;
                prevY = node.y;
            });
        }
    });
}

export function buildPlannedStructures(worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    plannedBuildings.forEach(b => {
        b.func(b.args[0], b.args[1], worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });
    plannedRanches.forEach(r => {
        drawRanch(r.gx, r.gy, r.w, r.h, r.gateX, r.barnType, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });
}
export function buildPlannedWells(worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    plannedWells.forEach(w => {
        // Check what is currently on the ground
        const currentTile = getTileData(w.x * 16, w.y * 16, worldMatrix, roomMatrix).tileID;
        
        // If it is Dirt (337) or a road border (300-399), mark it as Connected (998)
        // If it is Grass (63), mark it as Isolated (999)
        const wellId = (currentTile >= 300 && currentTile < 400) ? 998 : 999;
        
        setGlobalTile(w.x, w.y, 30, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(w.x + 1, w.y, 31, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(w.x, w.y + 1, 38, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(w.x + 1, w.y + 1, 39, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });
}

// ==========================================
// ⭕ VILLAGE RING ROADS
// ==========================================
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS
// ==========================================
// ==========================================
// 🌲 POINT-IN-POLYGON HELPER (Ray-Casting)
// ==========================================
// 🌲 TREE CULLING HELPER (Radial Ray-Casting)
// ==========================================
function isInsideVillagePolygon(gx, gy) {
    for (let i = 0; i < plannedWells.length; i++) {
        const well = plannedWells[i];

        // 1. FAST RADIAL CHECK (Uses the Ring Road's exact mathematical shape)
        if (well.spokes && well.spokes.length > 0) {
            const dx = gx - well.x;
            const dy = gy - well.y;
            const dist = Math.hypot(dx, dy);

            // If it's ridiculously far away, skip math
            if (dist > 600) continue;

            let angle = Math.atan2(dy, dx);
            if (angle < 0) angle += Math.PI * 2; // Normalize to 0 - 2PI

            // Find which spoke this tree aligns with
            const numSpokes = well.spokes.length;
            const index = Math.round((angle / (Math.PI * 2)) * numSpokes) % numSpokes;
            const spoke = well.spokes[index];

            // If the tree's distance is LESS than the road's radius, it is inside town. Cull it!
            // (If dist > spoke.r, it's outside the road, so we keep the tree!)
            if (dist < spoke.r) return true;
            continue;
        }

        // 2. FALLBACK POLYGON CHECK (For small villages without spokes)
        const poly = well.polygon;
        if (!poly) continue;

        let inside = false;
        for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
            const xi = poly[j].x, yi = poly[j].y;
            const xj = poly[k].x, yj = poly[k].y;
            const intersect = ((yi > gy) !== (yj > gy)) && (gx < (xj - xi) * (gy - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        if (inside) return true;
    }
    return false;
}

// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS
// ==========================================
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Steering Fix)
// ==========================================
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Shrink-Wrap Fix)
// ==========================================
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Reverted to Polygon)
// ==========================================
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Shrink-Wrap)
// ==========================================
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Shrink-Wrap)
// ==========================================
// ==========================================
// 🚀 1-TILE BUFFER OBSTACLE CHECK
// ==========================================
// 🚀 1-TILE BUFFER OBSTACLE CHECK


// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Organic Smooth Blob)
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Organic & Safe)
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Organic & Safe)
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Organic & Safe)
// ==========================================
// ⭕ DYNAMIC PERIMETER ROADS (Organic & Safe)
// ==========================================
export function drawRingRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, targetWell = null) {
    const wellsToProcess = targetWell ? [targetWell] : plannedWells;

    wellsToProcess.forEach(well => {
        let boxes = [];

        // 1. Collect Exact Bounding Boxes for normal buildings
        plannedBuildings.forEach(b => {
            const tx = b.args[0], ty = b.args[1];
            if (Math.hypot(tx - well.x, ty - well.y) < 200) {
                boxes.push({ minX: tx - 2, maxX: tx + 12, minY: ty - 12, maxY: ty + 2 });
            }
        });

        // 2. Collect Exact Bounding Boxes for Ranches (Reverted back to strict ownership)
        plannedRanches.forEach(r => {
            if (r.wellX === well.x && r.wellY === well.y) {
                // Ensure we cover the absolute bounds of the ranch fencing
                boxes.push({ minX: r.gx, maxX: r.gx + r.w, minY: r.gy - r.h, maxY: r.gy + 1 });
            }
        });

        // 3. Cast 128 Rays (High resolution)
        const numSpokes = 128;
        let rawRadii = new Array(numSpokes).fill(0);
        
        for (let i = 0; i < numSpokes; i++) {
            let angle = (i / numSpokes) * Math.PI * 2;
            let dx = Math.cos(angle);
            let dy = Math.sin(angle);
            
            let maxR = 10; 
            for (let r = 0; r < 350; r += 2) { 
                let px = well.x + dx * r;
                let py = well.y + dy * r;
                
                for (let b of boxes) {
                    if (px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY) {
                        maxR = r; 
                    }
                }
            }
            rawRadii[i] = maxR;
        }

        // 4. SMOOTHING (Averages the jagged jumps into a natural curve)
        let smoothedRadii = new Array(numSpokes);
        for(let passes = 0; passes < 4; passes++) { 
            for (let i = 0; i < numSpokes; i++) {
                let prev = rawRadii[(i - 1 + numSpokes) % numSpokes];
                let curr = rawRadii[i];
                let next = rawRadii[(i + 1) % numSpokes];
                smoothedRadii[i] = (prev + curr * 2 + next) / 4; 
            }
            for(let i = 0; i < numSpokes; i++) rawRadii[i] = smoothedRadii[i];
        }

        // 5. THE SAFETY GUARANTEE
        well.spokes = [];
        let waypoints = [];
        
        // 👈 INCREASED BUFFER: Massively thickened to force the curve outward!
        // Must be less than WALL_BUFFER (18) so they don't crash.
        const ROAD_BUFFER = 18; 

        for (let i = 0; i < numSpokes; i++) {
            let angle = (i / numSpokes) * Math.PI * 2;
            let dx = Math.cos(angle);
            let dy = Math.sin(angle);
            
            let r = smoothedRadii[i] + 4; // Start with the smoothed radius + a tiny base padding
            
            let isSafe = false;
            // 👈 INCREASED LIMIT: Raised to 500 so the massive buffer has room to push!
            while (!isSafe && r < 500) { 
                isSafe = true;
                let px = well.x + dx * r;
                let py = well.y + dy * r;
                
                // If the organic curve cuts a corner into a building buffer, push it outward!
                for (let b of boxes) {
                    if (px >= b.minX - ROAD_BUFFER && px <= b.maxX + ROAD_BUFFER && 
                        py >= b.minY - ROAD_BUFFER && py <= b.maxY + ROAD_BUFFER) {
                        isSafe = false;
                        r += 2; // Nudge it outward safely past the ranch fence
                        break;
                    }
                }
            }
            
            well.spokes.push({ angle, dx, dy, r }); 
            waypoints.push({ x: Math.floor(well.x + dx * r), y: Math.floor(well.y + dy * r) });
        }

        // 6. Draw the organic dirt road connecting the safe waypoints
        for (let i = 0; i < waypoints.length; i++) {
            const p1 = waypoints[i];
            const p2 = waypoints[(i + 1) % waypoints.length];
            drawInterCellRoad(p1.x, p1.y, p2.x, p2.y, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 337, 1, false);
        }
    });
}

// ==========================================
// 🚜 PLANNED RANCH ROADS (Reverted to 337)

// ==========================================
// ⛏️ MINING CAMP BUILDERS
// ==========================================

export function drawTent(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    
    // 1. Fill the 2x2 footprint with Dirt Floor (337)
    for (let i = 0; i < 2; i++) {
        for (let j = -1; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 337, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }
    
    // 2. Draw the 2x2 Tent Sprite
    // Top Row (46, 47)
    setGlobalTile(gx, gy - 1, 46, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy - 1, 47, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    
    // Bottom Row (54, 55 - Entrance)
    setGlobalTile(gx, gy, 54, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy, 55, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 3. Place the Bedroll inside (back left)
    registerObject(gx, gy - 1, 'BEDROLL', { houseId: currentId });
}

export function drawCampfireArea(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // 3x3 Clearing of Dirt around the fire
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            setGlobalTile(gx + i, gy + j, 337, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // Center: Campfire (62)
    setGlobalTile(gx, gy, 62, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // Seating: Place stools/stumps randomly around the fire (1 tile away)
    const seats = [
        { dx: 0, dy: -1 }, // North
        { dx: 0, dy: 1 },  // South
        { dx: -1, dy: 0 }, // West
        { dx: 1, dy: 0 }   // East
    ];

    let numSeats = Math.floor(seededRandom() * 2) + 2; // 2 to 3 seats per fire
    
    // Shuffle the seats array so seating positions are random
    for (let i = seats.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [seats[i], seats[j]] = [seats[j], seats[i]];
    }

    for (let i = 0; i < numSeats; i++) {
        const seatTile = seededRandom() > 0.5 ? 58 : 59; // 50/50 Stool vs Stump
        setGlobalTile(gx + seats[i].dx, gy + seats[i].dy, seatTile, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }
}

export function drawCampDecoration(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // Draw an Elk Skull (57) randomly
    setGlobalTile(gx, gy, 57, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    plants.delete(`${gx}_${gy}`);
}

export function drawOreDeposit(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // A 2x2 cluster using Tile 29 (Ore)
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            setGlobalTile(gx + x, gy + y, 29, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + x}_${gy + y}`);
        }
    }
}

export function drawMiningArea(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // 🌟 THE FIX: A single 1x1 Ore Deposit dead center
    setGlobalTile(gvx, gvy, 29, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    plants.delete(`${gvx}_${gvy}`);
}

export function planMiningCamp(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // 1. Center Ore Deposit (Reserve a 1x1 area dead center)
    if (isAreaClear(gvx, gvy, 1, 1, worldMatrix, roomMatrix, worldMap)) {
        reserveFootprint(gvx, gvy, 1, 1, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        plannedBuildings.push({ func: drawMiningArea, args: [gvx, gvy] });
    }

    // 2. Scatter Tents (3 to 5 tents)
    const numTents = Math.floor(seededRandom() * 3) + 3; 
    let placedTents = 0, attempts = 0;
    while (placedTents < numTents && attempts < 100) {
        attempts++;
        const angle = seededRandom() * Math.PI * 2;
        const dist = 6 + (seededRandom() * 6);
        const tx = gvx + Math.floor(Math.cos(angle) * dist);
        const ty = gvy + Math.floor(Math.sin(angle) * dist);

        if (isAreaClear(tx, ty, 2, 2, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(tx, ty, 2, 2, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plannedBuildings.push({ func: drawTent, args: [tx, ty] });
            placedTents++;
        }
    }

    // 3. Scatter Campfires (1 to 3 fires)
    const numFires = Math.floor(seededRandom() * 3) + 1;
    let placedFires = 0; attempts = 0;
    while (placedFires < numFires && attempts < 50) {
        attempts++;
        const tx = gvx + Math.floor(seededRandom() * 16) - 8;
        const ty = gvy + Math.floor(seededRandom() * 16) - 8;
        if (isAreaClear(tx - 1, ty - 1, 3, 3, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(tx - 1, ty - 1, 3, 3, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plannedBuildings.push({ func: drawCampfireArea, args: [tx, ty] });
            placedFires++;
        }
    }

    // 4. Scatter Elk Skulls (2 to 4 skulls)
    const numSkulls = Math.floor(seededRandom() * 3) + 2;
    let placedSkulls = 0; attempts = 0;
    while (placedSkulls < numSkulls && attempts < 30) {
        attempts++;
        const tx = gvx + Math.floor(seededRandom() * 20) - 10;
        const ty = gvy + Math.floor(seededRandom() * 20) - 10;
        if (isAreaClear(tx, ty, 1, 1, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(tx, ty, 1, 1, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plannedBuildings.push({ func: drawCampDecoration, args: [tx, ty] });
            placedSkulls++;
        }
    }
}

// ==========================================
// 🧹 BLUEPRINT CLEANUP
// ==========================================
export function clearBlueprints(roomMatrix) {
    for (let cx = 0; cx < CONFIG.MAP_SIZE; cx++) {
        for (let cy = 0; cy < CONFIG.MAP_SIZE; cy++) {
            if (!roomMatrix[cx]?.[cy]) continue;
            for (let idx = 0; idx < 10000; idx++) {
                // If it is still 9998, reset it back to Wilderness (0)
                if (roomMatrix[cx][cy][idx] === 9998) {
                    roomMatrix[cx][cy][idx] = 0;
                }
            }
        }
    }
}

// ==========================================
// 🧱 TOWN FORTIFICATIONS (L-Shape Walls)
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Classic L-Shape Walls)
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Classic L-Shape Walls)
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Classic L-Shape Walls)
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Classic L-Shape Walls)
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Blocky & Fracture-Free)
// ==========================================
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Thick Buffer & Fracture-Free)
// ==========================================
// 🧱 TOWN FORTIFICATIONS (Thick Buffer & Fracture-Free)
// ==========================================
export function drawTownWalls(worldMatrix, roomMatrix, fertilityMatrix, worldMap, targetWell = null) {
    const wellsToProcess = targetWell ? [targetWell] : plannedWells;

    wellsToProcess.forEach(well => {
        if (well.type !== 102 || !well.spokes) return; 

        // We need the boxes again to guarantee the wall doesn't clip buildings!
        let boxes = [];
        plannedBuildings.forEach(b => {
            const tx = b.args[0], ty = b.args[1];
            if (Math.hypot(tx - well.x, ty - well.y) < 200) {
                boxes.push({ minX: tx - 2, maxX: tx + 12, minY: ty - 12, maxY: ty + 2 });
            }
        });
        plannedRanches.forEach(r => {
            if (r.wellX === well.x && r.wellY === well.y) {
                boxes.push({ minX: r.gx, maxX: r.gx + r.w, minY: r.gy - r.h, maxY: r.gy });
            }
        });

        // 👈 INCREASED: Boosted by 6 to stay very far away from buildings!
        const WALL_BUFFER = 24; 
        
        // 1. Generate Wall Waypoints (Blocky Radius Snapping)
        const wallWaypoints = well.spokes.map(s => {
            let r = Math.ceil((s.r + 10) / 8) * 8; 
            
            let isSafe = false;
            // 👈 INCREASED: Bumped limit to 500 so the wall can push way outward if needed
            while (!isSafe && r < 500) { 
                isSafe = true;
                let px = well.x + s.dx * r;
                let py = well.y + s.dy * r;
                
                for (let b of boxes) {
                    if (px >= b.minX - WALL_BUFFER && px <= b.maxX + WALL_BUFFER && 
                        py >= b.minY - WALL_BUFFER && py <= b.maxY + WALL_BUFFER) {
                        isSafe = false;
                        r += 8; // Push outward in blocky chunks!
                        break;
                    }
                }
            }
            return { x: Math.floor(well.x + s.dx * r), y: Math.floor(well.y + s.dy * r) };
        });

        // 2. The Continuous Wall Painter
        const paintWall = (tx, ty) => {
            const cx = Math.floor(tx / 100), cy = Math.floor(ty / 100);
            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;
            if (!worldMatrix[cx]?.[cy]) return;

            const lx = ((tx % 100) + 100) % 100, ly = ((ty % 100) + 100) % 100;
            const tID = worldMatrix[cx][cy][ly * 100 + lx];
            const rID = roomMatrix[cx][cy][ly * 100 + lx];

            if (rID === 9998 || tID === 17) return; // Never crush houses or water

            // 🌟 FRACTURE FIX: Check a tight 3x3 area (-1 to 1). 
            // This leaves exactly a 3-tile gate for roads to pass through,
            // but stops the wall from shattering if a road runs parallel nearby!
            for(let ox = -1; ox <= 1; ox++) {
                for(let oy = -1; oy <= 1; oy++) {
                    const nCX = Math.floor((tx+ox) / 100), nCY = Math.floor((ty+oy) / 100);
                    if(worldMatrix[nCX]?.[nCY]) {
                        const nLX = (((tx+ox) % 100) + 100) % 100, nLY = (((ty+oy) % 100) + 100) % 100;
                        const nTID = worldMatrix[nCX][nCY][nLY * 100 + nLX];
                        if (nTID === 337 || nTID === 208 || nTID === 12 || nTID === 13 || nTID === 6) return; 
                    }
                }
            }
            setGlobalTile(tx, ty, 11, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        };

        // 3. Bresenham's Line Algorithm (Replaces L-Shapes)
        for (let i = 0; i < wallWaypoints.length; i++) {
            const p1 = wallWaypoints[i];
            const p2 = wallWaypoints[(i + 1) % wallWaypoints.length];
            
            let x0 = p1.x, y0 = p1.y;
            let x1 = p2.x, y1 = p2.y;
            
            let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
            let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
            let err = dx + dy;
            
            while (true) {
                paintWall(x0, y0);
                if (x0 === x1 && y0 === y1) break;
                let e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        }
    });
}
// ==========================================
// 🏖️ AUTO-TILING SAND SHORELINES
// ==========================================
// 🏖️ AUTO-TILING SAND SHORELINES




// ==========================================
// 🌊 GLOBAL SHORELINE GENERATOR
// ==========================================
export function generateGlobalShorelines(worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    console.log("🌊 Generating Global Shorelines...");
    
    for (let cx = 0; cx < CONFIG.MAP_SIZE; cx++) {
        for (let cy = 0; cy < CONFIG.MAP_SIZE; cy++) {
            const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
            const cellType = worldMap[blueprintIdx];
            const isLand = cellType >= CONFIG.LAND_THRESHOLD || cellType >= 100;

            if (!isLand) {
                setWorldSeed((window.worldSeed || 1) + (cx * 1000) + cy);
                const { score } = applyShorelineRules(cx, cy, worldMap);
                const inb = getInbound(cx, cy);
                const data = worldMatrix[cx][cy];
                const fData = fertilityMatrix[cx][cy];

                let out = { 
                    outW: inb.inWest, outE: inb.inEast, outN: inb.inNorth, outS: inb.inSouth,
                    lW: inb.lWest, lE: inb.lEast, lN: inb.lNorth, lS: inb.lSouth 
                };

                if (score & 1) out.outN = paintSide(data, inb.inNorth, "NORTH");
                if (score & 2) out.outW = paintSide(data, inb.inWest,  "WEST");
                if (score & 4) out.outE = paintSide(data, inb.inEast,  "EAST");
                if (score & 8) out.outS = paintSide(data, inb.inSouth, "SOUTH");

                if (score & 16)  paintCorner(data, inb.inNorth, inb.inWest, "NW");
                if (score & 32)  paintCorner(data, out.outN, inb.inEast, "NE");
                if (score & 64)  paintCorner(data, inb.inSouth, out.outW, "SW");
                if (score & 128) paintCorner(data, out.outS, out.outE, "SE");

                if (score & 1) out.lN = paintLandSide(data, fData, inb.lNorth, "NORTH");
                if (score & 2) out.lW = paintLandSide(data, fData, inb.lWest, "WEST");
                if (score & 4) out.lE = paintLandSide(data, fData, inb.lEast, "EAST");
                if (score & 8) out.lS = paintLandSide(data, fData, inb.lSouth, "SOUTH");

                if (score & 16)  paintLandCorner(data, fData, inb.lNorth, inb.lWest, "NW");
                if (score & 32)  paintLandCorner(data, fData, out.lN, inb.lEast, "NE");
                if (score & 64)  paintLandCorner(data, fData, inb.lSouth, out.lW, "SW");
                if (score & 128) paintLandCorner(data, fData, out.lS, out.lE, "SE");

                cellMemory.set(`${cx}_${cy}`, out);
            }
        }
    }
}