
// js/cellDecorator.js
import { applyShorelineRules } from './terrainRules.js';
import { CONFIG } from './config.js'
import { createPlant, plants } from './plants.js'; // 👈 Swapped createGrass for createPlant
import { spawnChicken } from './animals.js'; // 👈 ADD THIS IMPORT
import { seededRandom, setWorldSeed } from "./mapGenerator.js";
import { registerObject } from './staticObjects.js';

// This is our global "Phone Book" for buildings
export const roomMetadata = {}; 
let nextHouseId = 1;

// 🆕 Add this near the top of your imports
export const ecoGenerated = new Set();

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





// src/cellDecorator.js

export function setGlobalTile(gx, gy, tileID, roomID, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;

    if (worldMatrix[cx][cy] === null) {
        const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
        
        // Also a quick fix: Use CONFIG.LAND_THRESHOLD instead of hardcoded 55
        const isLand = worldMap[blueprintIdx] >= CONFIG.LAND_THRESHOLD || worldMap[blueprintIdx] >= 100;

        worldMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 63 : 17);
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

function isAreaClear(gx, gy, w, h, worldMatrix, roomMatrix) {
    const buffer = 1; 
    
    for (let i = -buffer; i < w + buffer; i++) {
        for (let j = -h - buffer; j < buffer; j++) {
            const tx = gx + i;
            const ty = gy + j;

            const cx = Math.floor(tx / 100);
            const cy = Math.floor(ty / 100);
            
            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return false;

            const isInsideFootprint = (i >= 0 && i < w && j > -h && j <= 0);
            if (getRoomID(tx, ty, roomMatrix) !== 0) return false;
            
            const tid = getTileID(tx, ty, worldMatrix);
            if (tid === 17) return false;
            
            // 👇 Prevent buildings from overwriting Tile 45 (Roads)
            if (isInsideFootprint && tid === 45) return false; 
        }
    }
    return true;
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

export function drawRanch(gx, gy, width, height, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // 1. CLAIM AREA & FERTILITY
    for (let i = 0; i < width; i++) {
        for (let j = -(height - 1); j <= 0; j++) {
            const tx = gx + i;
            const ty = gy + j;
            
            setGlobalTile(tx, ty, 63, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            
            const cx = Math.floor(tx / 100);
            const cy = Math.floor(ty / 100);
            const lx = ((tx % 100) + 100) % 100;
            const ly = ((ty % 100) + 100) % 100;
            if (fertilityMatrix[cx]?.[cy]) {
                fertilityMatrix[cx][cy][(ly * 100) + lx] = 255;
            }
        }
    }

    // 2. DRAW FENCES AND INTERIOR CROPS
    const gateX = Math.floor(seededRandom() * (width - 2)) + 1;
    
    let chickensSpawned = 0;
    const maxChickens = Math.floor(seededRandom() * 2) + 1; 
    let placedNestingBox = false; // 👈 Track if we placed the box

    for (let i = 0; i < width; i++) {
        for (let j = -(height - 1); j <= 0; j++) {
            const tx = gx + i;
            const ty = gy + j;

            const isTop = (j === -(height - 1));
            const isBottom = (j === 0);
            const isLeft = (i === 0);
            const isRight = (i === width - 1);

            // --- A. THE PERIMETER (Fences) ---
            if (isTop || isBottom || isLeft || isRight) {
                let tileID = 63; 
                
                if (isLeft || isRight) tileID = 18; 
                if (isTop || isBottom) tileID = 21; 
                if ((isTop || isBottom) && (isLeft || isRight)) tileID = 24; 

                if (isBottom && i === gateX) tileID = 22; 

                setGlobalTile(tx, ty, tileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            } 
            // --- B. THE INTERIOR (Crop & Animal Spawning) ---
            else {
                setGlobalTile(tx, ty, 63, 9999, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

                // 🥚 Place ONE Nesting Box per Ranch!
                if (!placedNestingBox && seededRandom() > 0.8) {
                    setGlobalTile(tx, ty, 44, 9999, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                    placedNestingBox = true;
                    continue; // Skip planting crops on the nesting box tile
                }

                // 1. Crop Spawning
                if (seededRandom() > 0.85) {
                    const initialAge = Math.floor(seededRandom() * 100);
                    const cropList = ['turnip', 'tomato', 'eggplant', 'strawberry', 'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato', 'wheat'];
                    const randomCrop = cropList[Math.floor(seededRandom() * cropList.length)];
                    import('./plants.js').then(m => m.createPlant(tx, ty, fertilityMatrix, initialAge, randomCrop));
                }
                
                // 2. 🐔 Chicken Spawning
                if (!isTop && !isBottom && !isLeft && !isRight) {
                    if (chickensSpawned < maxChickens && seededRandom() > 0.50) {
                        spawnChicken(tx, ty);
                        chickensSpawned++;
                    }
                }
            }
        }
    }

    // 3. 🚜 SPAWN THE BARN ON THE TOP FENCE!
    if (width >= 6 && height >= 6) {
        const isLeft = seededRandom() > 0.5;
        const by = gy - height + 1;
        const bX = isLeft ? gx + 1 : gx + width - 5;
        drawBarn(bX, by, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        return true; 
    }
    
    return false; 
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

// js/cellDecorator.js

export function drawVillage(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const wellId = 999;
    setGlobalTile(gvx, gvy, 30, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gvx + 1, gvy, 31, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gvx + 1, gvy + 1, 39, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gvx, gvy + 1, 38, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    let roadTiles = [];
    for (let x = gvx - 50; x < gvx + 50; x++) {
        for (let y = gvy - 50; y < gvy + 50; y++) {
            if (getTileID(x, y, worldMatrix) === 45) roadTiles.push({x, y});
        }
    }
    const hasRoad = roadTiles.length > 0;

    const uniques = [
        { func: drawVillageHall, w: 11, h: 9 },
        { func: drawTemple, w: 4, h: 8 },
        { func: drawGeneralStore, w: 4, h: 4 }
    ];

    uniques.forEach(bp => {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 50) {
            attempts++;
            let tx, ty;
            if (hasRoad && attempts < 40) {
                const road = roadTiles[Math.floor(seededRandom() * roadTiles.length)];
                tx = road.x + (seededRandom() > 0.5 ? 4 : -4);
                ty = road.y + (seededRandom() > 0.5 ? 4 : -4);
            } else {
                tx = gvx + Math.floor(seededRandom() * 40) - 20;
                ty = gvy + Math.floor(seededRandom() * 40) - 20;
            }

            if (isAreaClear(tx, ty, bp.w, bp.h, worldMatrix, roomMatrix)) {
                bp.func(tx, ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                placed = true;
            }
        }
    });

    // --- HOUSES (Target: 8) ---
    const houseGoal = 20; 
    let housesPlaced = 0;
    let houseAttempts = 0;

    while (housesPlaced < houseGoal && houseAttempts < 100) {
        houseAttempts++;
        let tx, ty;

        if (hasRoad && houseAttempts < 80) {
            const road = roadTiles[Math.floor(seededRandom() * roadTiles.length)];
            const side = Math.floor(seededRandom() * 4);
            const offset = 2; 

            if (side === 0) { tx = road.x; ty = road.y - offset; }      
            else if (side === 1) { tx = road.x; ty = road.y + offset + 3; } 
            else if (side === 2) { tx = road.x + offset; ty = road.y; } 
            else { tx = road.x - offset - 4; ty = road.y; }            
        } else {
            tx = gvx + Math.floor(seededRandom() * 90) - 45;
            ty = gvy + Math.floor(seededRandom() * 90) - 45;
        }

        if (isAreaClear(tx, ty, 4, 3, worldMatrix, roomMatrix)) {
            drawHouse(tx, ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            housesPlaced++;
        }
    }

    // --- RANCHES & INTEGRATED BARNS ---
    let ranchesPlaced = 0;
    // Target: 4 to 6 Ranches
    const ranchGoal = Math.floor(seededRandom() * 3) + 4; 
    let ranchAttempts = 0;
    
    // Target: 2 to 4 Barns total in the village
    const maxBarnsAllowed = Math.floor(seededRandom() * 3) + 2; 
    let barnsBuilt = 0;

    while (ranchesPlaced < ranchGoal && ranchAttempts < 50) {
        ranchAttempts++;
        const rw = Math.floor(seededRandom() * 16) + 5; 
        const rh = Math.floor(seededRandom() * 16) + 5;
        const rx = Math.floor(seededRandom() * 90) - 45;
        const ry = Math.floor(seededRandom() * 90) - 45;
        
        const canBuildBarn = barnsBuilt < maxBarnsAllowed;
        
        if (isAreaClear(rx + gvx, ry + gvy, rw, rh, worldMatrix, roomMatrix)) {
            const builtBarn = drawRanch(rx + gvx, ry + gvy, rw, canBuildBarn ? rh : 5, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            if (builtBarn) barnsBuilt++;
            ranchesPlaced++;
        }
    }

    // --- UTILITIES ---
    // If the Ranches didn't build enough barns, build standalone ones to reach the goal
    const barnsNeeded = Math.max(0, maxBarnsAllowed - barnsBuilt);
    
    // Storage Rooms Target: 2 to 3
    const storageRoomCount = Math.floor(seededRandom() * 2) + 2;
    
    const utilities = [
        { func: drawStorageRoom, w: 5, h: 5, count: storageRoomCount },
        { func: drawBarn, w: 4, h: 4, count: barnsNeeded }, 
        { func: drawRootCellar, w: 2, h: 3, count: 2 }
    ];

    utilities.forEach(bp => {
        let placed = 0, attempts = 0;
        while (placed < bp.count && attempts < 50) {
            attempts++;
            const rx = Math.floor(seededRandom() * 100) - 50;
            const ry = Math.floor(seededRandom() * 100) - 50;
            if (isAreaClear(gvx + rx, gvy + ry, bp.w, bp.h, worldMatrix, roomMatrix)) {
                bp.func(gvx + rx, gvy + ry, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                placed++;
            }
        }
    });
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

    // 1. REGISTER METADATA
    roomMetadata[currentId] = { 
        type: 'STANDARD', 
        frontY: gy, 
        depth: 5 
    };

    // 2. FILL FOOTPRINT (4x5 Flooring)
    for (let i = 0; i < 4; i++) {
        for (let j = -4; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    // 3. EXTERIOR STRUCTURE
    for (let i = 0; i < 4; i++) {
        // Front Row (j=0): Heavy Stone Wall
        setGlobalTile(gx + i, gy, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Ceiling: 3 Rows
        setGlobalTile(gx + i, gy - 4, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Top
        setGlobalTile(gx + i, gy - 3, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Mid
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); // Roof Mid
    }

    // 4. DOOR (Row 0, 2nd Tile)
    setGlobalTile(gx + 1, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 5. REGISTER SMELTER
    // Placing the Smelter in the back-middle of the forge
    registerObject(gx + 2, gy - 2, 'SMELTER', { houseId: currentId });
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
export function drawTown(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    console.log(`🏰 Founding the Great City at [${gtx}, ${gty}]`);

    // 1. DIMENSIONS & WALLS (200x200)
    const half = 100;
    for (let x = -half; x <= half; x++) {
        for (let y = -half; y <= half; y++) {
            const isEdgeX = (x === -half || x === half);
            const isEdgeY = (y === -half || y === half);

            if (isEdgeX || isEdgeY) {
                // Gates at the center of each wall (6 tiles wide)
                const isGate = (Math.abs(x) < 4 && isEdgeY) || (Math.abs(y) < 4 && isEdgeX);
                let tileID = isGate ? 6 : 11; // Road (6) or Fortified Wall (11)
                setGlobalTile(gtx + x, gty + y, tileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            }
        }
    }

    // 2. CENTRAL HUB (The Well)
    const wellId = 999;
    setGlobalTile(gtx, gty, 30, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gtx + 1, gty, 31, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gtx, gty + 1, 38, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gtx + 1, gty + 1, 39, wellId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 3. ROAD SCANNING (For Snapping)
    let roadTiles = [];
    for (let x = gtx - half; x < gtx + half; x++) {
        for (let y = gty - half; y < gty + half; y++) {
            if (getTileID(x, y, worldMatrix) === 6) {
                roadTiles.push({x, y});
            }
        }
    }
    const hasRoad = roadTiles.length > 0;

    // 4. DEFINE THE BLUEPRINTS
    // Unique Icons / Infrastructure
    const uniqueBuildings = [
        { func: drawTownHall, w: 11, h: 12, count: 1 },
        { func: drawInn, w: 8, h: 9, count: 1 },
        { func: drawMilitaryQuarters, w: 10, h: 11, count: 1 },
        { func: drawBarracks, w: 6, h: 6, count: 1 },
        { func: drawGeneralStore, w: 4, h: 4, count: 1 },
        { func: drawBlacksmith, w: 6, h: 5, count: 1 },
        { func: drawForge, w: 4, h: 5, count: 1 },
        { func: drawTemple, w: 4, h: 8, count: Math.floor(seededRandom() * 3) + 3 }, // 3-5
    ];

    // Multi-Story / Residential
    const residential = [
        { func: drawTwoStoryHouse, w: 4, h: 4, count: Math.floor(seededRandom() * 3) + 5 }, // 5-7
        { func: drawLargeBarn, w: 6, h: 8, count: Math.floor(seededRandom() * 3) + 2 },     // 2-4
        { func: drawHouse, w: 4, h: 3, count: Math.floor(seededRandom() * 17) + 40 },      // 40-56
    ];

    // Utility / Outskirts
    const utilities = [
        { func: drawStorageRoom, w: 5, h: 5, count: Math.floor(seededRandom() * 5) + 6 },  // 6-10
        { func: drawBarn, w: 4, h: 4, count: Math.floor(seededRandom() * 7) + 8 },         // 8-14
        { func: drawRootCellar, w: 2, h: 3, count: Math.floor(seededRandom() * 9) + 12 },  // 12-20
    ];

    // 5. PLACEMENT PASS 1: UNIQUE BUILDINGS (High Priority)
    uniqueBuildings.forEach(bp => {
        placeBuildings(bp, 300);
    });

    // 6. PLACEMENT PASS 2: RESIDENTIAL (Prefers Roads)
    residential.forEach(bp => {
        placeBuildings(bp, 1500);
    });

    // 7. PLACEMENT PASS 3: UTILITIES (Outer Rim)
    utilities.forEach(bp => {
        placeBuildings(bp, 500);
    });

    // 8. PLACEMENT PASS 4: RANCHES (Outer Districts)
    let ranchesPlaced = 0;
    const ranchGoal = Math.floor(seededRandom() * 7) + 12; // 12-18
    let ranchAttempts = 0;
    while (ranchesPlaced < ranchGoal && ranchAttempts < 500) {
        ranchAttempts++;
        const rw = Math.floor(seededRandom() * 12) + 6; 
        const rh = Math.floor(seededRandom() * 12) + 6;
        const rx = gtx + Math.floor(seededRandom() * 180) - 90;
        const ry = gty + Math.floor(seededRandom() * 180) - 90;

        if (isAreaClear(rx, ry, rw, rh, worldMatrix, roomMatrix)) {
            drawRanch(rx, ry, rw, rh, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            ranchesPlaced++;
        }
    }

    /**
     * Internal helper to handle the road-snapping vs random logic
     */
    function placeBuildings(bp, maxAttempts) {
        let placed = 0;
        let attempts = 0;
        while (placed < bp.count && attempts < maxAttempts) {
            attempts++;
            let tx, ty;

            // Attempt road snapping for the first 75% of tries
            if (hasRoad && attempts < (maxAttempts * 0.75)) {
                const road = roadTiles[Math.floor(seededRandom() * roadTiles.length)];
                const side = Math.floor(seededRandom() * 4);
                const offset = 2;

                if (side === 0) { tx = road.x; ty = road.y - offset - bp.h; }
                else if (side === 1) { tx = road.x; ty = road.y + offset; }
                else if (side === 2) { tx = road.x + offset; ty = road.y; }
                else { tx = road.x - offset - bp.w; ty = road.y; }
            } else {
                // Random fallback within walls
                tx = gtx + Math.floor(seededRandom() * 180) - 90;
                ty = gty + Math.floor(seededRandom() * 180) - 90;
            }

            if (isAreaClear(tx, ty, bp.w, bp.h, worldMatrix, roomMatrix)) {
                bp.func(tx, ty, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                placed++;
            }
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
        drawVillage(subX, subY, worldMatrix, roomMatrix, fertilityMatrix);
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

function drawInterCellRoad(startX, startY, endX, endY, worldMatrix, roomMatrix, fertilityMatrix, worldMap, tileID = 6, thickness = 2) {
    let curX = startX;
    let curY = startY;
    let steps = 0;
    const maxSteps = 20000; // Increased for single-pixel stepping

    const isCastleRoad = (tileID === 8 || thickness >= 6);

    // 🛡️ THE FIX: Exact target matching
    while ((curX !== endX || curY !== endY) && steps < maxSteps) {
        steps++;

        // 1. MANHATTAN STEPPING (The "Diagonal Fix")
        // We only move ONE axis at a time. This ensures the brush 
        // footprint is always exactly 'thickness' wide.
        if (Math.abs(curX - endX) > Math.abs(curY - endY)) {
            if (curX < endX) curX++;
            else curX--;
        } else {
            if (curY < endY) curY++;
            else curY--;
        }

        // 2. 🛑 REMOVED Math.random() WOBBLE
        // For the 2-tile, 4-tile, and 6-tile roads to overlap perfectly,
        // they MUST follow the exact same deterministic path.
        // (Wobble can be re-added later using seededRandom(curX + curY))

        // 3. DYNAMIC THICKNESS & BRIDGE LOGIC
        const offset = Math.floor(thickness / 2);

        for (let ox = -offset; ox < (thickness - offset); ox++) {
            for (let oy = -offset; oy < (thickness - offset); oy++) {
                const targetX = curX + ox;
                const targetY = curY + oy;

                // --- 🌉 THE BRIDGE CHECK ---
                const cx = Math.floor(targetX / 100);
                const cy = Math.floor(targetY / 100);
                const lx = ((targetX % 100) + 100) % 100;
                const ly = ((targetY % 100) + 100) % 100;
                
                const globalIdx = (cy * 100 + ly) * CONFIG.MAP_SIZE + (cx * 100 + lx);
                const terrainHeight = worldMap[globalIdx];

                let finalTile = tileID;
                if (terrainHeight < CONFIG.LAND_THRESHOLD) {
                    finalTile = isCastleRoad ? 13 : 12; 
                }

                setGlobalTile(
                    targetX, targetY, finalTile, 0, 
                    worldMatrix, roomMatrix, fertilityMatrix, worldMap
                );
            }
        }
    }
}





export function drawOreDeposit(gx, gy, worldMatrix, roomMatrix, fertilityMatrix) {
    // A 2x2 cluster using Tile 30 (Ore)
    // We set roomID to 0 because ores aren't "inside" anything
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            setGlobalTile(gx + x, gy + y, 29, 0, worldMatrix, roomMatrix, fertilityMatrix);
        }
    }
}

// js/cellDecorator.js

export function drawMiningArea(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix) {
    const depositCount = Math.floor(Math.random() * 2) + 3; // 3 to 4 clusters
    
    for (let i = 0; i < depositCount; i++) {
        // Scatter the 2x2 deposits within 8 tiles of each other
        const offsetX = Math.floor(Math.random() * 16) - 8;
        const offsetY = Math.floor(Math.random() * 16) - 8;
        
        drawOreDeposit(gvx + offsetX, gvy + offsetY, worldMatrix, roomMatrix, fertilityMatrix);

        

        
    }

    setGlobalTile(gvx, gvy, 62, 0, worldMatrix, roomMatrix, fertilityMatrix);
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
            
            cellData[(ly * 100) + lx] = 0; // Paint Sand (0)
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
            // Checks if current pixel (lx, ly) is inside the arc connecting hWidth and vWidth
            const dist = (lx / vWidth) ** 2 + (ly / hWidth) ** 2;

            if (dist <= 1.0) {
                let fx = lx, fy = ly;
                // Map to the correct corner of the 100x100 cell
                if (type === "NE") fx = 99 - lx;
                if (type === "SW") fy = 99 - ly;
                if (type === "SE") { fx = 99 - lx; fy = 99 - ly; }

                // Bounds safety
                if (fx >= 0 && fx < 100 && fy >= 0 && fy < 100) {
                    cellData[(fy * 100) + fx] = 0; // Sand
                }
            }
        }
    }
}

// Add fertilityData to arguments
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
            cellData[idx] = 63; // Paint Land
            fertilityData[idx] = 12; // 👈 THE FIX: Paint Fertility
        }
    }
    return lLen;
}

// Add fertilityData to arguments
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
                    cellData[idx] = 63; // Paint Land
                    fertilityData[idx] = 12; // 👈 THE FIX: Paint Fertility
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

    // 1. MEMORY ALLOCATION (Runs if roads/buildings haven't allocated it yet)
    if (worldMatrix[cx][cy] === null) {
        worldMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 63 : 17);
        roomMatrix[cx][cy] = new Uint16Array(10000).fill(0);
        fertilityMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 12 : 0); 
    }

    // 2. ECOSYSTEM GENERATION (Runs EXACTLY ONCE when the player arrives)
    if (!ecoGenerated.has(cellKey)) {
        ecoGenerated.add(cellKey);

        // --- SHORELINES ---
        if (!isLand) {
            setWorldSeed((window.worldSeed || 1) + (cx * 1000) + cy);
            const { score } = applyShorelineRules(cx, cy, worldMap);
            const inb = getInbound(cx, cy);
            const data = worldMatrix[cx][cy];

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

            const fData = fertilityMatrix[cx][cy];
            if (score & 1) out.lN = paintLandSide(data, fData, inb.lNorth, "NORTH");
            if (score & 2) out.lW = paintLandSide(data, fData, inb.lWest, "WEST");
            if (score & 4) out.lE = paintLandSide(data, fData, inb.lEast, "EAST");
            if (score & 8) out.lS = paintLandSide(data, fData, inb.lSouth, "SOUTH");

            if (score & 16)  paintLandCorner(data, fData, inb.lNorth, inb.lWest, "NW");
            if (score & 32)  paintLandCorner(data, fData, out.lN, inb.lEast, "NE");
            if (score & 64)  paintLandCorner(data, fData, inb.lSouth, out.lW, "SW");
            if (score & 128) paintLandCorner(data, fData, out.lS, out.lE, "SE");

            cellMemory.set(cellKey, out);
        }

        // --- FLORA SPAWNER ---
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
    nextHouseId = 1;
    const size = CONFIG.MAP_SIZE; // 100

    // 1. Create the skeleton (Already in your code)
    let worldMatrix = Array.from({ length: size }, () => new Array(size).fill(null));
    let roomMatrix = Array.from({ length: size }, () => new Array(size).fill(null));
    let fertilityMatrix = Array.from({ length: size }, () => new Array(size).fill(null));

    // 2. PRE-SCAN: Decide where Villages and Castles go
    for (let i = 0; i < worldMap.length; i++) {
        const isLand = worldMap[i] >= CONFIG.LAND_THRESHOLD;

        if (isLand) {
            // Use your seededRandom() here so the locations stay the same for the same seed!
            const roll = seededRandom(); 
            console.log("🗺️ TEST");
            if (roll > 0.99995177469) {
                //worldMap[i] = 103; // Mark as CASTLE
            }
            else if (roll > 0.99942129629) {
                //worldMap[i] = 102; // Mark as TOWN
            } else if (roll > 0.97305555555) {
               worldMap[i] = 101; // Mark as VILLAGE
            }
        }
    }

    console.log("🗺️ World Blueprint planned. Villages are marked on the map!");
    return { worldMatrix, roomMatrix, fertilityMatrix, worldMap };
}

// js/worldPopulator.js

export function linkVillages(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    const size = CONFIG.MAP_SIZE;
    const adjacencyList = new Map(); // 🆕 Track who is connected to whom

    // 1. COLLECT ALL NODES (Towns and Villages)
    const settlements = [];
    for (let i = 0; i < worldMap.length; i++) {
        if (worldMap[i] === 102 || worldMap[i] === 101 || worldMap[i] === 103) {
            settlements.push({ 
                id: i, 
                type: worldMap[i], 
                x: i % size, 
                y: Math.floor(i / size) 
            });
        }
    }

    // 2. UNIFIED SMART ROAD PASS
    for (let i = 0; i < settlements.length; i++) {
        const A = settlements[i];

        for (let j = i + 1; j < settlements.length; j++) {
            const B = settlements[j];

            // Distance Check
            const dxAB = A.x - B.x;
            const dyAB = A.y - B.y;
            const distSqAB = (dxAB * dxAB) + (dyAB * dyAB);

            // --- 🆕 DYNAMIC RANGE RULES ---
            let maxRangeSq = 64; // Default Village (8 cells)
            if (A.type === 103 || B.type === 103) maxRangeSq = 2500; // 🏰 Castle (50 cells)
            else if (A.type === 102 && B.type === 102) maxRangeSq = 400; // 🏘️ Town (20 cells)

            if (distSqAB > 0 && distSqAB <= maxRangeSq) {
                let redundant = false;

                // CIRCULAR CHECK (The RNG Rule)
                for (let k = 0; k < settlements.length; k++) {
                    if (k === i || k === j) continue;
                    const C = settlements[k];

                    const dxAC = A.x - C.x;
                    const dyAC = A.y - C.y;
                    const distSqAC = (dxAC * dxAC) + (dyAC * dyAC);

                    const dxBC = B.x - C.x;
                    const dyBC = B.y - C.y;
                    const distSqBC = (dxBC * dxBC) + (dyBC * dyBC);

                    // If C is closer to both ends than they are to each other, skip direct road
                    if (distSqAC < distSqAB && distSqBC < distSqAB) {
                        redundant = true;
                        break;
                    }
                }

                // Circular Check (Keep your existing k-loop here...)
                // [Insert your existing for (let k = 0...) loop here]

               // Inside linkVillages() ...
                if (!redundant) {
                    if (!adjacencyList.has(A.id)) adjacencyList.set(A.id, []);
                    if (!adjacencyList.has(B.id)) adjacencyList.set(B.id, []);
                    adjacencyList.get(A.id).push(B);
                    adjacencyList.get(B.id).push(A);

                    const startOff = (A.type === 103) ? 100 : 50;
                    const endOff   = (B.type === 103) ? 100 : 50;

                    drawInterCellRoad(
                        A.x * 100 + startOff, A.y * 100 + startOff, 
                        B.x * 100 + endOff,   B.y * 100 + endOff, 
                        worldMatrix, roomMatrix, fertilityMatrix, worldMap, 
                        45, 2 // 👈 CHANGED: Village Roads use Tile 45
                    );
                }

            }
        }
    }

// --- STEP 2: THE PRESTIGE PASS (Cascaded) ---

// 1. ROYAL ROADS (Castle to Castle)
const castles = settlements.filter(s => s.type === 103);
castles.forEach(start => {
    castles.forEach(end => {
        if (start.id === end.id) return;
        // Search every connection in the network for Castle-to-Castle paths
        promotePath(start, end, adjacencyList, 8, 6, 2500, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });
});

// 2. TOWN HIGHWAYS (Town to Town OR Town to Castle)
const hubs = settlements.filter(s => s.type >= 102); // Towns (102) and Castles (103)
hubs.forEach(start => {
    hubs.forEach(end => {
        if (start.id === end.id) return;
        // Only promote if it's a Town-involved route (we already did Castle-to-Castle)
        if (start.type === 102 || end.type === 102) {
            promotePath(start, end, adjacencyList, 7, 4, 900, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });
});




    // 3. FINAL STAMPING PASS
    for (let i = 0; i < settlements.length; i++) {
        const S = settlements[i];
        const gx = S.x * 100 + (S.type === 103 ? 100 : 50);
        const gy = S.y * 100 + (S.type === 103 ? 100 : 50);

        if (S.type === 101) drawVillage(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        else if (S.type === 102) drawTown(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        else if (S.type === 103) drawCastle(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }
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
    if (path && path.length > 1) {
        for (let i = 0; i < path.length - 1; i++) {
            const [segA, segB] = [path[i], path[i+1]].sort((a, b) => a.id - b.id);

            const sOff = (segA.type === 103) ? 100 : 50;
            const eOff = (segB.type === 103) ? 100 : 50;

            // Now these variables will be defined!
            drawInterCellRoad(
                segA.x * 100 + sOff, segA.y * 100 + sOff, 
                segB.x * 100 + eOff, segB.y * 100 + eOff, 
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
            if (!decoratedCells.has(cellKey)) {
                // SIMPLIFIED: Just call decorateCell. 
                // It will wake up the memory AND draw structures in one go.
                decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                decoratedCells.add(cellKey);
            }
        }
    }
}











