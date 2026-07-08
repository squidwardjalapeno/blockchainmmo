// src/cellDecorator.js

import { applyShorelineRules } from './terrainRules.js';
import { CONFIG } from './config.js';
import { createPlant, plants } from './plants.js'; 
import { seededRandom, setWorldSeed } from "./mapGenerator.js";
import { registerObject, getObjectAt } from './staticObjects.js';
import { getTileData } from './physics.js';
import { socket } from './multiplayer.js'; 
import { getFocusCoordinates } from './entities.js'; // 👈 🎯 ADDED THIS IMPORT TO RESOLVE BOOT CRASH

export const roomMetadata = {};
export const ecoGenerated = new Set();
export const zoneLookup = new Map();     
export const zoneWellLookup = new Map(); 
export const initializedZones = new Set(); 
export const activeFloraChunks = new Set(); // 👈 🎯 Tracks loaded flora inside the active 3x3 cells centered on the player

export let plannedBuildings = [];
export let plannedRanches = [];
export let plannedWells = [];

let nextHouseId = 1;

// ==========================================
// 🏠 INDOOR BUILDING & WORKSTATION DRAWERS
// ==========================================

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
            
            const t = cellData[idx];
            if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;
            
            cellData[idx] = 0; 
        }
    }
    return beachLength;
}

function paintCorner(cellData, hWidth, vWidth, type) {
    const size = Math.max(hWidth, vWidth, 25); 

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
                    
                    const t = cellData[idx];
                    if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;

                    cellData[idx] = 0; 
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
            
            const t = cellData[idx];
            if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;

            cellData[idx] = 63; 
            fertilityData[idx] = 12; 
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
                    
                    const t = cellData[idx];
                    if (t === 12 || t === 13 || (t >= 300 && t < 400)) continue;

                    cellData[idx] = 63; 
                    fertilityData[idx] = 12; 
                }
            }
        }
    }
}

function stampBuildingFoundation(gx, gy, width, depth, worldMatrix, roomMatrix, fertilityMatrix, worldMap, typeLabel = 'STANDARD') {
    const currentId = nextHouseId++;

    roomMetadata[currentId] = { 
        type: typeLabel, 
        frontX: gx,
        frontY: gy, 
        maxOffset: -depth + 1 
    };

    for (let i = 0; i < width; i++) {
        for (let j = -(depth - 1); j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    return currentId;
}

function stampExteriorWalls(gx, gy, width, height, wallTile, doorTile, doorOffsetX, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    for (let i = 0; i < width; i++) {
        setGlobalTile(gx + i, gy - (height - 1), 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }

    for (let j = -(height - 2); j <= -2; j++) {
        for (let i = 0; i < width; i++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    for (let i = 0; i < width; i++) {
        for (let j = -1; j <= 0; j++) {
            let tile = wallTile;
            if (j === 0 && i === doorOffsetX) {
                tile = doorTile; 
            }
            setGlobalTile(gx + i, gy + j, tile, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }
}

export function drawHouse(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 4, 3, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');

    for (let i = 0; i < 4; i++) {
        setGlobalTile(gx + i, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        let wallTile = 50; 
        if (i === 1) wallTile = 49; // Closed Door
        if (i === 2) wallTile = 52; // Wall Panel
        
        setGlobalTile(gx + i, gy, wallTile, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }

    registerObject(gx + 0, gy - 1, 'CHEST_STORAGE', { houseId: currentId });
    registerObject(gx + 3, gy - 1, 'BEDROLL', { houseId: currentId });

    import('./hobbits.js').then(m => m.spawnHobbit(gx + 2, gy + 1, currentId, gx + 2, gy - 1));
}

export function drawTemple(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 4, 8, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');

    for (let i = 0; i < 4; i++) {
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

    registerObject(gx + 2, gy - 6, 'TEMPLE_ALTAR', { houseId: currentId });
}

export function drawGeneralStore(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 4, 4, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 4, 4, 3, 49, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 2, gy - 2, 'STORE_COUNTER', { houseId: currentId });
    import('./hobbits.js').then(m => m.spawnHobbit(gx + 2, gy + 1, currentId, gx + 2, gy - 1, 'Trader'));
}

export function drawVillageHall(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 11, 9, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 11, 9, 3, 49, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    const midX = 5;  
    const midY = -4; 

    for (let j = -8; j <= 0; j++) {
        if (j === -1 || j === -6) continue; 
        registerObject(gx + midX, gy + j, 'INT_WALL', { houseId: currentId });
    }

    for (let i = 0; i < 11; i++) {
        if (i === 2 || i === 8) continue; 
        registerObject(gx + i, gy + midY, 'INT_WALL', { houseId: currentId });
    }

    registerObject(gx + 2, gy - 7, 'HOBBIT_MANAGER', { houseId: currentId });
    registerObject(gx + 8, gy - 7, 'ARMORY', { houseId: currentId });
    registerObject(gx + 2, gy - 2, 'KITCHEN', { houseId: currentId });
    registerObject(gx + 8, gy - 2, 'MAP_TABLE', { houseId: currentId });
}

export function drawRootCellar(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 3, 3, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'CELLAR');

    setGlobalTile(gx, gy, 50, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy, 50, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    for (let i = 0; i < 3; i++) {
        setGlobalTile(gx + i, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 2, 367, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }

    registerObject(gx + 0, gy - 1, 'FOOD_STORAGE', { houseId: currentId });
    registerObject(gx + 2, gy - 1, 'FOOD_STORAGE', { houseId: currentId });
}

export function drawBarn(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    roomMetadata[currentId] = { type: 'STANDARD', frontX: gx, frontY: gy, maxOffset: -2 };

    for (let i = 0; i < 4; i++) {
        for (let j = -2; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }
    for (let i = 1; i <= 2; i++) {
        setGlobalTile(gx + i, gy - 3, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        plants.delete(`${gx + i}_${gy - 3}`);
    }

    setGlobalTile(gx, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy, 12, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
    setGlobalTile(gx + 2, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 3, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    setGlobalTile(gx, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 3, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    setGlobalTile(gx, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 3, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    setGlobalTile(gx + 1, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 2, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 3, gy - 1, 'HAY_STORAGE', { houseId: currentId });
    registerObject(gx + 1, gy - 1, 'HAY_TABLE', { houseId: currentId });

    import('./hobbits.js').then(m => m.spawnHobbit(gx + 2, gy + 1, currentId, gx + 2, gy - 1, 'Farmer'));
}

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
            }
        }
    }

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

    if (socket && socket.connected) {
        socket.emit('registerRanch', { gx, gy, w: width, h: height });
    }
}

export function drawStorageRoom(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 5, 5, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 5, 5, 50, 49, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 0, gy - 3, 'CHEST_STORAGE', { houseId: currentId });
    registerObject(gx + 4, gy - 3, 'CHEST_STORAGE', { houseId: currentId });
}

export function drawBarracks(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 6, 6, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 6, 6, 1, 49, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 1, gy - 5, 'MILITARY_STORAGE', { houseId: currentId });
    registerObject(gx + 3, gy - 5, 'MILITARY_STORAGE', { houseId: currentId });
    registerObject(gx + 5, gy - 5, 'MILITARY_STORAGE', { houseId: currentId });
    registerObject(gx + 5, gy - 3, 'MILITARY_STORAGE', { houseId: currentId });
}

export function drawTwoStoryHouse(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 4, 4, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'TWO_STORY');

    for (let i = 0; i < 4; i++) {
        setGlobalTile(gx + i, gy - 3, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
        setGlobalTile(gx + i, gy - 2, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
        setGlobalTile(gx + i, gy - 1, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);  
        setGlobalTile(gx + i, gy, (i === 1 ? 49 : 3), currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
    }

    registerObject(gx + 3, gy - 1, 'STAIRS_TOGGLE', { houseId: currentId, isTwoStory: true });
}

export function drawInn(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 8, 9, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'TWO_STORY');

    for (let i = 0; i < 8; i++) {
        setGlobalTile(gx + i, gy, 50, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 50, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        setGlobalTile(gx + i, gy - 8, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        for (let j = -7; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    setGlobalTile(gx + 1, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    registerObject(gx + 4, gy - 4, 'STAIRS_TOGGLE', { houseId: currentId });
}

export function drawMilitaryQuarters(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 10, 11, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'TWO_STORY');

    for (let i = 0; i < 10; i++) {
        setGlobalTile(gx + i, gy, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        setGlobalTile(gx + i, gy - 10, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        for (let j = -9; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    setGlobalTile(gx + 2, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    registerObject(gx + 5, gy - 5, 'STAIRS_TOGGLE', { houseId: currentId });
}

export function drawBlacksmith(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 6, 5, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 6, 5, 1, 49, 1, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 4, gy - 2, 'ANVIL', { houseId: currentId });
}

export function drawForge(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 5, 5, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 5, 5, 1, 49, 2, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 1, gy - 2, 'SMELTER', { houseId: currentId });
    registerObject(gx + 3, gy - 2, 'ANVIL', { houseId: currentId });
}

export function drawWorkshop(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 6, 6, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'STANDARD');
    stampExteriorWalls(gx, gy, 6, 6, 1, 49, 2, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 3, gy - 3, 'CRAFTING_TABLE', { houseId: currentId });
}

export function drawLargeBarn(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;

    roomMetadata[currentId] = { 
        type: 'LARGE_BARN', 
        frontX: gx,
        frontY: gy 
    };

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

    for (let i = 0; i < 6; i++) {
        const isMiddle = (i === 2 || i === 3);
        
        if (isMiddle) {
            setGlobalTile(gx + i, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 2, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 3, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            
            setGlobalTile(gx + i, gy - 7, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
            for (let j = -6; j <= -4; j++) {
                setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
            }
        } else {
            setGlobalTile(gx + i, gy, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            setGlobalTile(gx + i, gy - 1, 5, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            
            setGlobalTile(gx + i, gy - 5, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
            for (let j = -4; j <= -2; j++) {
                setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
            }
        }
    }

    setGlobalTile(gx + 1, gy, 12, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 3, gy - 3, 'STAIRS_TOGGLE', { houseId: currentId });
    registerObject(gx + 0, gy - 2, 'HAY_STORAGE', { houseId: currentId });
    registerObject(gx + 5, gy - 2, 'HAY_STORAGE', { houseId: currentId });
    registerObject(gx + 2, gy - 1, 'HAY_STORAGE', { houseId: currentId });
    registerObject(gx + 1, gy - 1, 'HAY_TABLE', { houseId: currentId });
}

export function drawTownHall(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = stampBuildingFoundation(gx, gy, 11, 12, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 'TWO_STORY');

    for (let i = 0; i < 11; i++) {
        setGlobalTile(gx + i, gy, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        setGlobalTile(gx + i, gy - 1, 3, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        setGlobalTile(gx + i, gy - 11, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        for (let j = -10; j <= -2; j++) {
            setGlobalTile(gx + i, gy + j, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    }

    setGlobalTile(gx + 5, gy, 49, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx + 2, gy - 2, 'KITCHEN', { houseId: currentId });
    registerObject(gx + 5, gy - 6, 'MEETING_TABLE', { houseId: currentId });
    registerObject(gx + 8, gy - 10, 'ARMORY', { houseId: currentId });
    registerObject(gx + 9, gy - 4, 'STAIRS_TOGGLE', { houseId: currentId });
}

// ==========================================
// ⛩️ REGIONAL PLANNERS
// ==========================================

export function planVillage(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const wellObj = { x: gvx, y: gvy, type: 101 }; 
    plannedWells.push(wellObj);

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
        zoneWellLookup.set(chunkKey, wellObj); 
    });

    let roadTiles = [];
    for (let x = gvx - 50; x < gvx + 50; x++) {
        for (let y = gvy - 50; y < gvy + 50; y++) {
            const tid = getTileData(x*16, y*16, worldMatrix, roomMatrix).tileID;
            if (tid === 337) roadTiles.push({x, y});
        }
    }
    const hasRoad = roadTiles.length > 0;

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

export function planTown(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const wellObj = { x: gtx, y: gty, type: 102 }; 
    plannedWells.push(wellObj);

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
        zoneWellLookup.set(chunkKey, wellObj); 
    });

    let roadTiles = [];
    for (let x = gtx - 90; x < gtx + 90; x++) {
        for (let y = gty - 90; y < gty + 90; y++) {
            const tid = getTileData(x*16, y*16, worldMatrix, roomMatrix).tileID;
            if (tid === 337 || tid === 208) roadTiles.push({x, y});
        }
    }
    const hasRoad = roadTiles.length > 0;

    const uniqueBuildings = [
        { func: drawTownHall, w: 11, h: 12, count: 1 }, { func: drawInn, w: 8, h: 9, count: 1 }, { func: drawMilitaryQuarters, w: 10, h: 11, count: 1 },
        { func: drawBarracks, w: 6, h: 6, count: 1 }, { func: drawGeneralStore, w: 4, h: 4, count: 1 }, { func: drawBlacksmith, w: 6, h: 5, count: 1 },
        { func: drawForge, w: 4, h: 5, count: 1 }, { func: drawTemple, w: 4, h: 8, count: Math.floor(seededRandom() * 3) + 3 }
    ];
    const residential = [
        { func: drawTwoStoryHouse, w: 4, h: 4, count: Math.floor(seededRandom() * 3) + 5 },
        { func: drawHouse, w: 4, h: 3, count: Math.floor(seededRandom() * 17) + 40 },
    ];
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

    placeBuildings(uniqueBuildings[0], 50, false);
    placeBuildings(uniqueBuildings[1], 50, false);
    placeBuildings(uniqueBuildings[2], 50, false);
    placeBuildings(uniqueBuildings[3], 50, false);
    placeBuildings(uniqueBuildings[4], 50, false);
    placeBuildings(uniqueBuildings[5], 50, false);
    placeBuildings(uniqueBuildings[6], 50, false);
    placeBuildings(uniqueBuildings[7], 150, false);

    placeBuildings(residential[0], 300, true);
    placeBuildings(residential[1], 1500, true);

    placeBuildings(utilities[0], 500, false);
    placeBuildings(utilities[1], 500, false);

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

export function drawCastle(gcx, gcy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    setGlobalTile(gcx - 1, gcy - 1, 30, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gcx,     gcy - 1, 31, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gcx - 1, gcy,     38, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gcx,     gcy,     39, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    drawFortifiedRing(gcx, gcy, 198, 198, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    drawFortifiedRing(gcx, gcy, 100, 100, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    drawFortifiedRing(gcx, gcy, 40, 40, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
}

function drawFortifiedRing(centerX, centerY, width, height, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    for (let x = -halfW; x < halfW; x++) {
        for (let y = -halfH; y < halfH; y++) {
            const isEdgeX = (x === -halfW || x === halfW - 1);
            const isEdgeY = (y === -halfH || y === halfH - 1);

            if (isEdgeX || isEdgeY) {
                const gx = centerX + x;
                const gy = centerY + y;

                const isGate = (y === halfH - 1 && (x === 0 || x === -1));

                if (isGate) {
                    setGlobalTile(gx, gy, 6, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
                } else {
                    setGlobalTile(gx, gy, 11, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 
                }
            }
        }
    }
}

export function drawInterCellRoad(startX, startY, endX, endY, worldMatrix, roomMatrix, fertilityMatrix, worldMap, tileID = 337, thickness = 3, avoidObstacles = false) {
    let curX = startX, curY = startY;
    let lastX = -1, lastY = -1; 
    const isCastleRoad = (thickness >= 6);

    let dx = Math.abs(endX - startX), dy = -Math.abs(endY - startY);
    let sx = startX < endX ? 1 : -1, sy = startY < endY ? 1 : -1;
    let err = dx + dy;

    const wiggleFrequency = 15;
    const wiggleAmplitude = avoidObstacles ? 1 : 2; 

    const paintTile = (targetX, targetY) => {
        const cx = Math.floor(targetX / 100), cy = Math.floor(targetY / 100);
        if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;
        const lx = ((targetX % 100) + 100) % 100, ly = ((targetY % 100) + 100) % 100;
        const idx = (ly * 100) + lx;

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

const cellMemory = new Map();
const decoratedCells = new Set();

function getInbound(i, j) {
    const top = cellMemory.get(`${i}_${j-1}`) || { outW: 16, outE: 16, lW: 4, lE: 4 };
    const left = cellMemory.get(`${i-1}_${j}`) || { outN: 16, outS: 16, lN: 4, lS: 4 };

    return {
        inWest: top.outW ?? 16, inEast: top.outE ?? 16,
        inNorth: left.outN ?? 16, inSouth: left.outS ?? 16,
        lWest: top.lW ?? 4, lEast: top.lE ?? 4,
        lNorth: left.lN ?? 4, lSouth: left.lS ?? 4
    };
}

export function decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    if (!fertilityMatrix) return;
    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return; 

    const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
    const cellType = worldMap[blueprintIdx];
    const isLand = cellType >= CONFIG.LAND_THRESHOLD || cellType >= 100;
    const cellKey = `${cx}_${cy}`;

    if (!ecoGenerated.has(cellKey)) {
        ecoGenerated.add(cellKey);

        let isForestRegion = (cellType === 104 || !isLand);

        if (cellType === 101 || cellType === 102 || cellType === 103 || cellType === 107) {
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const nx = cx + ox, ny = cy + oy;
                    if (nx >= 0 && nx < CONFIG.MAP_SIZE && ny >= 0 && ny < CONFIG.MAP_SIZE) {
                        const neighborType = worldMap[ny * CONFIG.MAP_SIZE + nx];
                        if (neighborType === 104 || neighborType < CONFIG.LAND_THRESHOLD) {
                            isForestRegion = true;
                        }
                    }
                }
            }
        }

        if (isForestRegion) {
            setWorldSeed((window.worldSeed || 1) + (cx * 1000) + cy + 777);
            
            const spawnThreshold = (cellType === 104 || cellType === 101 || cellType === 102 || cellType === 103 || cellType === 107) ? 0.55 : 0.80;
            
            for (let ly = 0; ly < 100; ly++) { 
                for (let lx = 0; lx < 100; lx++) { 
                    const idx = (ly * 100) + lx;
                    
                    if (worldMatrix[cx][cy][idx] === 63 && roomMatrix[cx][cy][idx] === 0) {
                        if (seededRandom() > spawnThreshold) { 
                            const gx = (cx * 100) + lx;
                            const gy = (cy * 100) + ly;
                            
                            if (typeof isInsideVillagePolygon === 'function' && isInsideVillagePolygon(gx, gy)) continue;
                            
                            let isClear = true;
                            for (let ox = -1; ox <= 1; ox++) {
                                if (getObjectAt(gx + ox, gy)) {
                                    isClear = false;
                                    break;
                                }
                            }

                            if (isClear) {
                                for (let ox = 0; ox <= 1; ox++) {
                                    const checkGX = gx + ox;
                                    const checkGY = gy;
                                    
                                    const tCX = Math.floor(checkGX / 100);
                                    const tCY = Math.floor(checkGY / 100);
                                    if (tCX >= 0 && tCX < CONFIG.MAP_SIZE && tCY >= 0 && tCY < CONFIG.MAP_SIZE) {
                                        if (worldMatrix[tCX] && worldMatrix[tCX][tCY]) {
                                            const tLX = ((checkGX % 100) + 100) % 100;
                                            const tLY = ((checkGY % 100) + 100) % 100;
                                            const tID = worldMatrix[tCX][tCY][tLY * 100 + tLX];
                                            const rID = roomMatrix[tCX][tCY][tLY * 100 + tLX];
                                            
                                            if (tID !== 63 || (rID !== 0 && rID !== 9999)) {
                                                isClear = false;
                                                break;
                                            }
                                        }
                                    } else {
                                        isClear = false; 
                                        break;
                                    }
                                }
                            }
                            
                            if (isClear) {
                                registerObject(gx, gy, 'FOREST_TREE');
                            }
                        }
                    }
                }
            }
        }
    }
}

export function populateWorld(worldMap) {
    const size = CONFIG.MAP_SIZE;

    for (let i = 0; i < worldMap.length; i++) {
        const isLand = worldMap[i] >= CONFIG.LAND_THRESHOLD;
        if (isLand) {
            const roll = seededRandom(); 
            if (roll > 1.99995177469) worldMap[i] = 103; 
            else if (roll > 1.99942129629) worldMap[i] = 102; 
            else if (roll > 0.9978) worldMap[i] = 107; 
            else if (roll > 0.99305555555) worldMap[i] = 101; 
        }
    }

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

export function linkVillages(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    const size = CONFIG.MAP_SIZE;
    const adjacencyList = new Map(); 

    const settlements = [];
    const seed = window.worldSeed || 1; 

    for (let i = 0; i < worldMap.length; i++) {
        if (worldMap[i] === 102 || worldMap[i] === 101 || worldMap[i] === 103) {
            const type = worldMap[i];
            const cx = i % size;
            const cy = Math.floor(i / size);
            
            let tx, ty;
            if (type === 103) {
                tx = cx * 100 + 100; ty = cy * 100 + 100; 
            } else if (type === 102) {
                tx = cx * 100 + 50; ty = cy * 100 + 50; 
            } else {
                const hash = Math.abs(Math.sin((cx + seed) * 12.9898 + (cy + seed) * 78.233) * 43758.5453);
                const offX = Math.floor(hash * 60) % 60 + 20;
                const offY = Math.floor((hash * 10) * 60) % 60 + 20;
                
                tx = cx * 100 + offX;
                ty = cy * 100 + offY;
            }

            settlements.push({ id: i, type, x: cx, y: cy, tx, ty });
        }
    }

    for (let i = 0; i < settlements.length; i++) {
        const A = settlements[i];

        for (let j = i + 1; j < settlements.length; j++) {
            const B = settlements[j];

            const dxAB = A.x - B.x;
            const dyAB = A.y - B.y;
            const distSqAB = (dxAB * dxAB) + (dyAB * dyAB);

            let maxRangeSq = 64; 
            if (A.type === 103 || B.type === 103) maxRangeSq = 2500; 
            else if (A.type === 102 && B.type === 102) maxRangeSq = 400; 

            if (distSqAB > 0 && distSqAB <= maxRangeSq) {
                let redundant = false;

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

                    for(let ox=0; ox<2; ox++) {
                        for(let oy=0; oy<2; oy++) {
                            setGlobalTile(A.tx + ox, A.ty + oy, 337, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                            setGlobalTile(B.tx + ox, B.ty + oy, 337, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                        }
                    }

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
    return []; 
}

function promotePath(startNode, endNode, adj, tileID, thickness, maxRangeSq, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const dx = startNode.x - endNode.x;
    const dy = startNode.y - endNode.y;
    if ((dx * dx + dy * dy) > maxRangeSq) return;

    let path = findPathInNetwork(startNode, endNode, adj);
    if (path && path.length > 1) {
        for (let i = 0; i < path.length - 1; i++) {
            const [segA, segB] = [path[i], path[i+1]].sort((a, b) => a.id - b.id);

            drawInterCellRoad(
                segA.tx, segA.ty, 
                segB.tx, segB.ty, 
                worldMatrix, roomMatrix, fertilityMatrix, worldMap, 
                tileID, thickness
            );
        }
    }
}

export function ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const focus = getFocusCoordinates();
    const heroCX = Math.floor(focus.x / 1600);
    const heroCY = Math.floor(focus.y / 1600);

    // Track coordinates currently in the player's centered 3x3 grid
    const current3x3Keys = new Set();

    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const cx = heroCX + ox;
            const cy = heroCY + oy;

            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) continue;

            const cellKey = `${cx}_${cy}`;
            current3x3Keys.add(cellKey);
            const zone = zoneLookup.get(cellKey);

            if (zone) {
                ensureZoneInitialized(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            } else {
                if (!decoratedCells.has(cellKey)) {
                    decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                    decoratedCells.add(cellKey);
                }
            }

            // ⚡ CENTERED 3x3 STREAMING ENGINE:
            // If a cell entering the player's centered 3x3 grid has not fetched its plants, request them now
            if (!activeFloraChunks.has(cellKey)) {
                activeFloraChunks.add(cellKey);
                if (socket && socket.connected) {
                    socket.emit('requestChunkPlants', { cx, cy });
                }
            }

            autoTileLayerChunk(cx, cy, worldMatrix, [0, 10, 11, 17], 0, 'sand');
            autoTileLayerChunk(cx, cy, worldMatrix, [208], 208, 'stone');
            autoTileLayerChunk(cx, cy, worldMatrix, [337], 337, 'dirt');
        }
    }

    // Clear cells that fall out of the player's centered 3x3 grid
    for (let key of activeFloraChunks) {
        if (!current3x3Keys.has(key)) {
            activeFloraChunks.delete(key);
        }
    }
}

function drawRiverPath(startX, startY, endX, endY, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    let curX = startX;
    let curY = startY;
    let steps = 0;
    const maxSteps = 200000; 

    while ((curX !== endX || curY !== endY) && steps < maxSteps) {
        steps++;

        if (Math.abs(curX - endX) > Math.abs(curY - endY)) {
            if (curX < endX) curX++; else curX--;
        } else {
            if (curY < endY) curY++; else curY--;
        }

        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                setGlobalTile(curX + ox, curY + oy, 17, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            }
        }
    }
}

export function linkLakes(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    if (!window.geography || !window.geography.lakes || window.geography.lakes.length < 2) return;

    const lakes = window.geography.lakes;
    const lakeCenters = [];

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
            tx: cx * 100 + 50, 
            ty: cy * 100 + 50
        });
    }

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
}

const autoTileCache = new Map();

export function autoTileLayerChunk(cx, cy, worldMatrix, baseIds, fillTileId, layerName) {
    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;
    
    if (!autoTileCache.has(layerName)) autoTileCache.set(layerName, new Set());
    const cache = autoTileCache.get(layerName);
    
    const key = `${cx}_${cy}`;
    if (cache.has(key)) return;
    cache.add(key);

    if (!worldMatrix[cx]?.[cy]) return;

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

                if (mask === 3) borderTile = 302; 
                else if (mask === 5) borderTile = 304; 
                else if (mask === 10) borderTile = 350; 
                else if (mask === 12) borderTile = 354; 
                
                else if (mask === 1) borderTile = 303; 
                else if (mask === 2) borderTile = 331; 
                else if (mask === 4) borderTile = 335; 
                else if (mask === 8) borderTile = 367; 
                
                else if (mask === 6 || mask === 9 || mask === 7 || mask === 11 || mask === 13 || mask === 14 || mask === 15) {
                    borderTile = fillTileId; 
                }
                
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

    for (const update of newTiles) {
        worldMatrix[cx][cy][update.idx] = update.tile;
        if (update.tile === fillTileId) {
            import('./plants.js').then(m => m.plants.delete(`${cx * 100 + (update.idx % 100)}_${cy * 100 + Math.floor(update.idx / 100)}`));
        }
    }
}

export function stampStructuresForChunk(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    plannedBuildings.forEach(b => {
        const bCX = Math.floor(b.args[0] / 100);
        const bCY = Math.floor(b.args[1] / 100);
        
        if (bCX === cx && bCY === cy) {
            b.func(b.args[0], b.args[1], worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });

    plannedRanches.forEach(r => {
        const rCX = Math.floor(r.gx / 100);
        const rCY = Math.floor(r.gy / 100);
        
        if (rCX === cx && rCY === cy) {
            drawRanch(r.gx, r.gy, r.w, r.h, r.gateX, r.barnType, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });

    plannedWells.forEach(w => {
        const wCX = Math.floor(w.x / 100);
        const wCY = Math.floor(w.y / 100);
        
        if (wCX === cx && wCY === cy) {
            registerObject(w.x, w.y + 1, 'WELL_OBJECT');
        }
    });
}

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

export function drawPlannedRanchRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, targetWellX = null, targetWellY = null) {
    
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

                if (rID === 9998 || [18, 21, 24].includes(tID)) return true;
            }
        }
        return false;
    }

    plannedRanches.forEach(r => {
        if (targetWellX !== null && (r.wellX !== targetWellX || r.wellY !== targetWellY)) return;
        const roadTileID = 337; 

        let targetX = r.wellX, targetY = r.wellY;
        let minDist = Math.abs(r.gx + r.gateX - r.wellX) + Math.abs(r.gy - r.wellY);

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

        let startX = gateX;
        let startY = gateY + 2; 

        if (isRanchStepBlocked(startX, startY)) return;

        let openSet = [{ x: startX, y: startY, g: 0, f: 0, path: [] }];
        let closedSet = new Set([`${startX}_${startY}`]);
        let steps = 0;
        let finalPath = null;

        while (openSet.length > 0 && steps++ < 2000) {
            let lowestIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
            }
            let curr = openSet.splice(lowestIdx, 1)[0];

            if (Math.abs(curr.x - targetX) <= 1 && Math.abs(curr.y - targetY) <= 1) {
                finalPath = curr.path;
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

        if (finalPath) {
            setGlobalTile(startX, startY, roadTileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

            let prevX = startX, prevY = startY;

            finalPath.forEach(node => {
                if (Math.abs(node.x - prevX) > 0 && Math.abs(node.y - prevY) > 0) {
                    setGlobalTile(prevX, node.y, roadTileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                }

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
        registerObject(w.x, w.y + 1, 'WELL_OBJECT');
    });
}

function isInsideVillagePolygon(gx, gy) {
    for (let i = 0; i < plannedWells.length; i++) {
        const well = plannedWells[i];

        if (well.spokes && well.spokes.length > 0) {
            const dx = gx - well.x;
            const dy = gy - well.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 600) continue;

            let angle = Math.atan2(dy, dx);
            if (angle < 0) angle += Math.PI * 2; 

            const numSpokes = well.spokes.length;
            const index = Math.round((angle / (Math.PI * 2)) * numSpokes) % numSpokes;
            const spoke = well.spokes[index];

            if (dist < spoke.r + 2.0) return true;
            continue;
        }

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

export function drawRingRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, targetWell = null) {
    const wellsToProcess = targetWell ? [targetWell] : plannedWells;

    wellsToProcess.forEach(well => {
        generateWellSpokes(well);

        if (!well.spokes) return;

        let waypoints = [];
        well.spokes.forEach(s => {
            waypoints.push({ 
                x: Math.floor(well.x + s.dx * s.r), 
                y: Math.floor(well.y + s.dy * s.r) 
            });
        });

        for (let i = 0; i < waypoints.length; i++) {
            const p1 = waypoints[i];
            const p2 = waypoints[(i + 1) % waypoints.length];
            drawInterCellRoad(p1.x, p1.y, p2.x, p2.y, worldMatrix, roomMatrix, fertilityMatrix, worldMap, 337, 1, false);
        }
    });
}

export function drawTent(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    
    for (let i = 0; i < 2; i++) {
        for (let j = -1; j <= 0; j++) {
            setGlobalTile(gx + i, gy + j, 337, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }
    
    setGlobalTile(gx, gy - 1, 46, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy - 1, 47, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    
    setGlobalTile(gx, gy, 54, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gx + 1, gy, 55, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    registerObject(gx, gy - 1, 'BEDROLL', { houseId: currentId });
}

export function drawCampfireArea(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            setGlobalTile(gx + i, gy + j, 337, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + i}_${gy + j}`);
        }
    }

    setGlobalTile(gx, gy, 62, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    const seats = [
        { dx: 0, dy: -1 }, 
        { dx: 0, dy: 1 },  
        { dx: -1, dy: 0 }, 
        { dx: 1, dy: 0 }   
    ];

    let numSeats = Math.floor(seededRandom() * 2) + 2; 
    
    for (let i = seats.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [seats[i], seats[j]] = [seats[j], seats[i]];
    }

    for (let i = 0; i < numSeats; i++) {
        const seatTile = seededRandom() > 0.5 ? 58 : 59; 
        setGlobalTile(gx + seats[i].dx, gy + seats[i].dy, seatTile, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }
}

export function drawCampDecoration(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    setGlobalTile(gx, gy, 57, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    plants.delete(`${gx}_${gy}`);
}

export function drawOreDeposit(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            setGlobalTile(gx + x, gy + y, 29, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plants.delete(`${gx + x}_${gy + y}`);
        }
    }
}

export function drawMiningArea(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    setGlobalTile(gvx, gvy, 29, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    plants.delete(`${gvx}_${gvy}`);
}

export function planMiningCamp(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    if (isAreaClear(gvx, gvy, 1, 1, worldMatrix, roomMatrix, worldMap)) {
        reserveFootprint(gvx, gvy, 1, 1, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        plannedBuildings.push({ func: drawMiningArea, args: [gvx, gvy] });
    }

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

    const numFires = Math.floor(seededRandom() * 3) + 1;
    let placedFires = 0; attempts = 0;
    while (placedFires < numFires && attempts < 50) {
        attempts++;
        const tx = gvx + Math.floor(seededRandom() * 16) - 8;
        const ty = gvx + Math.floor(seededRandom() * 16) - 8;
        if (isAreaClear(tx - 1, ty - 1, 3, 3, worldMatrix, roomMatrix, worldMap)) {
            reserveFootprint(tx - 1, ty - 1, 3, 3, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            plannedBuildings.push({ func: drawCampfireArea, args: [tx, ty] });
            placedFires++;
        }
    }

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

export function clearBlueprints(roomMatrix) {
    for (let cx = 0; cx < CONFIG.MAP_SIZE; cx++) {
        for (let cy = 0; cy < CONFIG.MAP_SIZE; cy++) {
            if (!roomMatrix[cx]?.[cy]) continue;
            for (let idx = 0; idx < 10000; idx++) {
                if (roomMatrix[cx][cy][idx] === 9998) {
                    roomMatrix[cx][cy][idx] = 0;
                }
            }
        }
    }
}

export function drawTownWalls(worldMatrix, roomMatrix, fertilityMatrix, worldMap, targetWell = null) {
    const wellsToProcess = targetWell ? [targetWell] : plannedWells;

    wellsToProcess.forEach(well => {
        if (well.type !== 102 || !well.spokes) return; 

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

        const WALL_BUFFER = 24; 
        const ROAD_BUFFER = 18;
        
        const wallWaypoints = well.spokes.map(s => {
            let r = Math.ceil((s.r + 10) / 8) * 8; 
            
            let isSafe = false;
            while (!isSafe && r < 500) { 
                isSafe = true;
                let px = well.x + s.dx * r;
                let py = well.y + s.dy * r;
                
                for (let b of boxes) {
                    if (px >= b.minX - WALL_BUFFER && px <= b.maxX + WALL_BUFFER && 
                        py >= b.minY - ROAD_BUFFER && py <= b.maxY + ROAD_BUFFER) {
                        isSafe = false;
                        r += 8; 
                        break;
                    }
                }
            }
            return { x: Math.floor(well.x + s.dx * r), y: Math.floor(well.y + s.dy * r) };
        });

        const paintWall = (tx, ty) => {
            const cx = Math.floor(tx / 100), cy = Math.floor(ty / 100);
            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;
            if (!worldMatrix[cx]?.[cy]) return;

            const lx = ((tx % 100) + 100) % 100, ly = ((ty % 100) + 100) % 100;
            const tID = worldMatrix[cx][cy][ly * 100 + lx];
            const rID = roomMatrix[cx][cy][ly * 100 + lx];

            if (rID === 9998 || tID === 17) return; 

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

export function getVillageAt(gx, gy) {
    for (let i = 0; i < plannedWells.length; i++) {
        const well = plannedWells[i];
        if (well.spokes && well.spokes.length > 0) {
            const dx = gx - well.x;
            const dy = gy - well.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 600) continue;
            let angle = Math.atan2(dy, dx);
            if (angle < 0) angle += Math.PI * 2; 
            const numSpokes = well.spokes.length;
            const index = Math.round((angle / (Math.PI * 2)) * numSpokes) % numSpokes;
            const spoke = well.spokes[index];
            if (dist < spoke.r + 2.0) return well;
        }
    }
    return null;
}

export function reserveFootprint(gx, gy, w, h, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const DUMMY_ID = 9998; 
    for (let i = 0; i < w; i++) {
        for (let j = -(h - 1); j <= 0; j++) {
            const tx = gx + i, ty = gy + j;
            const cx = Math.floor(tx / 100), cy = Math.floor(ty / 100);
            
            if (cx >= 0 && cx < CONFIG.MAP_SIZE && cy >= 0 && cy < CONFIG.MAP_SIZE) {
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

export function setGlobalTile(gx, gy, tileID, roomID, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;

    if (worldMatrix[cx][cy] === null || worldMatrix[cx][cy] === undefined) {
        const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
        const isLand = worldMap[blueprintIdx] >= CONFIG.LAND_THRESHOLD || worldMap[blueprintIdx] >= 100;

        worldMatrix[cx][cy] = new Uint16Array(10000).fill(isLand ? 63 : 17);
        roomMatrix[cx][cy] = new Uint16Array(10000).fill(0);
        fertilityMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 12 : 0);
    }

    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const idx = (ly * 100) + lx;

    worldMatrix[cx][cy][idx] = tileID;
    roomMatrix[cx][cy][idx] = roomID;
}

function isAreaClear(gx, gy, w, h, worldMatrix, roomMatrix, worldMap) {
    const buffer = 1; 
    
    for (let i = -buffer; i < w + buffer; i++) {
        for (let j = -h - buffer; j < buffer; j++) {
            const tx = gx + i;
            const ty = gy + j;

            const cx = Math.floor(tx / 100);
            const cy = Math.floor(ty / 100);
            
            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return false;

            if (!worldMatrix[cx] || !worldMatrix[cx][cy]) {
                const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
                const isLand = worldMap[blueprintIdx] >= CONFIG.LAND_THRESHOLD || worldMap[blueprintIdx] >= 100;
                if (!isLand) return false; 
                continue; 
            }

            const lx = ((tx % 100) + 100) % 100;
            const ly = ((ty % 100) + 100) % 100;
            const idx = (ly * 100) + lx;

            const tID = worldMatrix[cx][cy][idx];
            const rID = roomMatrix[cx][cy][idx];

            if (tID === 17) return false; 
            if (tID === 337) return false; 
            if (rID !== 0 && rID !== 9999) return false; 
        }
    }
    return true;
}

export function ensureZoneInitialized(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const cellKey = `${cx}_${cy}`;
    const zone = zoneLookup.get(cellKey);
    if (!zone) return;

    const zoneWell = zoneWellLookup.get(cellKey);
    if (!zoneWell) return;

    const zoneKey = `${zoneWell.x}_${zoneWell.y}`;
    if (initializedZones.has(zoneKey)) return; 
    initializedZones.add(zoneKey);

    generateWellSpokes(zoneWell);

    console.log(`🎪 LAZY INITIALIZING SETTLEMENT at Well [${zoneWell.x}, ${zoneWell.y}]`);

    zone.forEach(c => {
        const chunkKey = `${c.cx}_${c.cy}`;
        if (!decoratedCells.has(chunkKey)) {
            decorateCell(c.cx, c.cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            decoratedCells.add(chunkKey);
        }
    });

    drawRingRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, zoneWell);
    drawPlannedRanchRoads(worldMatrix, roomMatrix, fertilityMatrix, worldMap, zoneWell.x, zoneWell.y);
    drawTownWalls(worldMatrix, roomMatrix, fertilityMatrix, worldMap, zoneWell);

    zone.forEach(c => {
        stampStructuresForChunk(c.cx, c.cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });
}

export function generateWellSpokes(well) {
    if (well.spokes && well.spokes.length > 0) return; 

    let boxes = [];
    plannedBuildings.forEach(b => {
        const tx = b.args[0], ty = b.args[1];
        if (Math.hypot(tx - well.x, ty - well.y) < 200) {
            boxes.push({ minX: tx - 2, maxX: tx + 12, minY: ty - 12, maxY: ty + 2 });
        }
    });
    
    plannedRanches.forEach(r => {
        if (r.wellX === well.x && r.wellY === well.y) {
            boxes.push({ minX: r.gx, maxX: r.gx + r.w, minY: r.gy - r.h, maxY: r.gy + 1 });
        }
    });

    const numSpokes = 128;
    let rawRadii = new Array(numSpokes).fill(0);
    
    for (let i = 0; i < numSpokes; i++) {
        let angle = (i / numSpokes) * Math.PI * 2;
        let dx = Math.cos(angle);
        let dy = Math.sin(angle);
        
        let r = 10; 
        for (let rDist = 0; rDist < 350; rDist += 2) { 
            let px = well.x + dx * rDist;
            let py = well.y + dy * rDist;
            
            for (let b of boxes) {
                if (px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY) {
                    r = rDist; 
                }
            }
        }
        rawRadii[i] = r;
    }

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

    well.spokes = [];
    const ROAD_BUFFER = 18; 

    for (let i = 0; i < numSpokes; i++) {
        let angle = (i / numSpokes) * Math.PI * 2;
        let dx = Math.cos(angle);
        let dy = Math.sin(angle);
        
        let r = smoothedRadii[i] + 4; 
        
        let isSafe = false;
        while (!isSafe && r < 500) { 
            isSafe = true;
            let px = well.x + dx * r;
            let py = well.y + dy * r;
            
            for (let b of boxes) {
                if (px >= b.minX - ROAD_BUFFER && px <= b.maxX + ROAD_BUFFER && 
                    py >= b.minY - ROAD_BUFFER && py <= b.maxY + ROAD_BUFFER) {
                    isSafe = false;
                    r += 2; 
                    break;
                }
            }
        }
        well.spokes.push({ angle, dx, dy, r }); 
    }
}