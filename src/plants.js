// src/plants.js
import { seedBacteria, getBacteriaData } from './bacteria.js';
import { hero, getFocusCoordinates } from './entities.js';
import { viewport } from './viewport.js'; 
import { socket } from './multiplayer.js'; 
import { getObjectAt, solidTiles } from './staticObjects.js';
import { PLANT_DEFS } from './plantDefs.js';
import { CONFIG } from './config.js';

export const plants = new Map();
// Fast spatial grid: chunkKey -> Array(10000) for 0ms screen-space rendering
export const plantChunks = new Map();

const ID_TO_TYPE = [
    'grass', 'turnip', 'tomato', 'eggplant', 'strawberry',
    'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato',
    'wheat', 'rose', 'violet', 'sunflower'
];

/**
 * 0ms Spatial Lookup: used by renderer.js to draw only visible screen tiles
 */
export function getPlantAtTile(gx, gy) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const grid = plantChunks.get(`${cx}_${cy}`);
    if (!grid) return null;
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    return grid[(ly * 100) + lx] || null;
}

/**
 * 🎯 CENTRALIZED PLANT DELETION HELPER
 * Keeps both the logical Map and the fast spatial render grid strictly in sync.
 */
export function deletePlant(gx, gy) {
    const key = `${gx}_${gy}`;
    plants.delete(key);

    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const grid = plantChunks.get(`${cx}_${cy}`);
    if (grid) {
        const lx = ((gx % 100) + 100) % 100;
        const ly = ((gy % 100) + 100) % 100;
        grid[(ly * 100) + lx] = null;
    }
}

/**
 * Loads raw binary chunk data directly into typed spatial memory,
 * silently rejecting any plants on roads, road borders, buildings, or fences.
 */
// In src/plants.js:
// In src/plants.js:
// src/plants.js (inside loadBinaryPlantsForChunk)

export function loadBinaryPlantsForChunk(cx, cy, rawBuffer, worldMatrix, roomMatrix) {
    if (!rawBuffer) return;

    let arrayBuffer;
    if (rawBuffer instanceof ArrayBuffer) {
        arrayBuffer = rawBuffer;
    } else if (rawBuffer.buffer instanceof ArrayBuffer) {
        arrayBuffer = rawBuffer.buffer.slice(rawBuffer.byteOffset, rawBuffer.byteOffset + rawBuffer.byteLength);
    } else if (rawBuffer.data && Array.isArray(rawBuffer.data)) {
        arrayBuffer = new Uint8Array(rawBuffer.data).buffer;
    } else {
        return;
    }

    const view = new DataView(arrayBuffer);
    if (view.byteLength < 12) return;

    const plantCount = view.getUint32(8, true);
    const chunkKey = `${cx}_${cy}`;

    let grid = plantChunks.get(chunkKey);
    if (!grid) {
        grid = new Array(10000);
        plantChunks.set(chunkKey, grid);
    } else {
        grid.fill(null);
    }

    let loadedCount = 0;
    let rejectedCount = 0;
    const rejectedCoordinates = []; // 🎯 Collect phantom plants on roads/buildings

    let offset = 12;
    for (let i = 0; i < plantCount; i++) {
        if (offset + 8 > view.byteLength) break;

        const localIdx = view.getUint16(offset, true);
        const typeId = view.getUint8(offset + 2);
        const growth = view.getUint8(offset + 3);
        const seedsRemaining = view.getUint8(offset + 4);
        const generation = view.getUint8(offset + 5) |
                          (view.getUint8(offset + 6) << 8) |
                          (view.getUint8(offset + 7) << 16);

        const lx = localIdx % 100;
        const ly = Math.floor(localIdx / 100);
        const gx = cx * 100 + lx;
        const gy = cy * 100 + ly;

        const tileID = (worldMatrix && worldMatrix[cx] && worldMatrix[cx][cy]) ? worldMatrix[cx][cy][localIdx] : undefined;
        const rID = (roomMatrix && roomMatrix[cx] && roomMatrix[cx][cy]) ? roomMatrix[cx][cy][localIdx] : 0;
        const obj = getObjectAt(gx, gy);
        const isSolid = solidTiles.has(`${gx}_${gy}`);

        let isValidTile = true;

        // 1. Terrain Check (Must be natural grass 63 or 56, never roads 337/208 or road borders 300..367)
        const isNaturalLand = (tileID === 63 || tileID === 56);
        if (!isNaturalLand) {
            isValidTile = false;
        }

        // 2. Building Interior Check (0 = wilderness, 9999 = ranch pasture)
        if (rID !== 0 && rID !== 9999) {
            isValidTile = false;
        }

        // 3. Static Object Check (Trees, Fences, Wells)
        if (obj || isSolid) {
            isValidTile = false;
        }

        // 🎯 IF ON A ROAD / BUILDING / OBSTACLE: Mark for server purge
        if (!isValidTile) {
            rejectedCount++;
            rejectedCoordinates.push({ gx, gy });
            offset += 8;
            continue;
        }

        const type = ID_TO_TYPE[typeId] || 'grass';
        const key = `${gx}_${gy}`;

        const plantObj = {
            gx, gy,
            type,
            growth,
            seedsRemaining,
            generation,
            growthRate: PLANT_DEFS[type]?.growthRate || 0.4,
            health: type === 'grass' ? 60 : 40,
            seedTimer: 15.0 + Math.random() * 10.0,
            hasFlowered: growth >= 100,
            lastUpdated: Date.now()
        };

        grid[localIdx] = plantObj;
        plants.set(key, plantObj);
        loadedCount++;

        offset += 8;
    }

    // 🎯 EMIT PURGE TO SERVER: Wipe phantom road plants from memory and .bin files forever
    if (rejectedCoordinates.length > 0 && socket && socket.connected) {
        socket.emit('purgePhantomPlants', { cx, cy, tiles: rejectedCoordinates });
    }

    console.log(`🌿 Chunk [${cx}, ${cy}]: ${loadedCount} clean plants loaded, ${rejectedCount} phantom road plants purged.`);
}
function isGroundClearOfObjects(gx, gy) {
    if (solidTiles.has(`${gx}_${gy}`)) return false;
    const obj = getObjectAt(gx, gy);
    if (obj) return false; 
    return true;
}

export function createPlant(gx, gy, fertilityMatrix = null, startingGrowth = 0, type = 'grass', leftoverTime = 0, isServerSync = false) {
    const key = `${gx}_${gy}`;
    if (plants.has(key)) return; 

    if (!isGroundClearOfObjects(gx, gy)) return;

    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const localIdx = (ly * 100) + lx; 

    const req = PLANT_DEFS[type]?.fertilityReq || 3;

    // Soil chemistry deduction
    if (fertilityMatrix && fertilityMatrix[cx]?.[cy]) {
        const currentFert = fertilityMatrix[cx][cy][idxLocal(lx, ly)];
        if (currentFert < req && !isServerSync) {
            return; // Soil depleted
        }
        fertilityMatrix[cx][cy][idxLocal(lx, ly)] = Math.max(0, currentFert - req); 
    }

    const def = PLANT_DEFS[type];
    const maxHP = (type === 'grass') ? 60 : 40;

    const plantObj = {
        gx, gy,
        type, 
        growth: startingGrowth,
        growthRate: def?.growthRate || 0.5,    
        health: maxHP,      
        maxHealth: maxHP,   
        seedsRemaining: 3,
        seedTimer: startingGrowth >= 100 ? (15.0 + Math.random() * 10.0) : 0,
        hasFlowered: false, 
        lastUpdated: Date.now() - (leftoverTime * 1000) 
    };

    let grid = plantChunks.get(`${cx}_${cy}`);
    if (!grid) {
        grid = new Array(10000);
        plantChunks.set(`${cx}_${cy}`, grid);
    }
    grid[localIdx] = plantObj;
    plants.set(key, plantObj);

    seedBacteria(gx, gy, "organic_plant", maxHP, 0);

    if (!isServerSync && socket && socket.connected) {
        socket.emit('registerWildPlant', { 
            gx, gy, 
            type, 
            growth: startingGrowth,
            growthRate: def?.growthRate || 0.5
        });
    }
}

function idxLocal(lx, ly) {
    return (ly * 100) + lx;
}

function witherPlant(plant, key, fertilityMatrix) {
    const cx = Math.floor(plant.gx / 100);
    const cy = Math.floor(plant.gy / 100);
    const lx = ((plant.gx % 100) + 100) % 100;
    const ly = ((plant.gy % 100) + 100) % 100;
    const localIdx = (ly * 100) + lx;

    // 1. Return ancestral humus to the soil
    if (fertilityMatrix && fertilityMatrix[cx] && fertilityMatrix[cx][cy]) {
        const refund = PLANT_DEFS[plant.type]?.fertilityReq || 3;
        fertilityMatrix[cx][cy][localIdx] = Math.min(255, fertilityMatrix[cx][cy][localIdx] + refund);
    }

    // 2. Clear bacteria slot
    const bac = getBacteriaData(plant.gx, plant.gy);
    if (bac && bac.data) bac.data[bac.idx] = 0;

    // 3. Remove from fast grid and map using unified helper
    deletePlant(plant.gx, plant.gy);

    // 4. Synchronize with server
    if (socket && socket.connected) {
        socket.emit('syncTile', { gx: plant.gx, gy: plant.gy, traits: 0 });
        socket.emit('plantWithered', { gx: plant.gx, gy: plant.gy });
    }
}

/**
 * 🌾 LIVE SEED DISPERSAL: Plants cast seeds into neighboring tiles across chunks
 */
function spreadSeed(parentPlant, fertilityMatrix, worldMatrix, roomMatrix, leftoverTime = 0) {
    const range = PLANT_DEFS[parentPlant.type]?.spreadRange || 2;
    const targetX = parentPlant.gx + Math.floor(Math.random() * (range * 2 + 1)) - range;
    const targetY = parentPlant.gy + Math.floor(Math.random() * (range * 2 + 1)) - range;

    if (targetX === parentPlant.gx && targetY === parentPlant.gy) return;

    const key = `${targetX}_${targetY}`;
    if (plants.has(key)) return;
    
    // 🛡️ Ensure target coordinate is clear of fences, gates, trees, and wells
    if (!isGroundClearOfObjects(targetX, targetY)) return;

    const cx = Math.floor(targetX / 100);
    const cy = Math.floor(targetY / 100);
    const lx = ((targetX % 100) + 100) % 100;
    const ly = ((targetY % 100) + 100) % 100;
    const localIdx = (ly * 100) + lx; 

    if (!worldMatrix || !worldMatrix[cx] || !worldMatrix[cx][cy]) return;
    // Must be natural soil/grass (Tile 63), blocking roads and road borders
    if (worldMatrix[cx][cy][localIdx] !== 63) return; 
    
    const rID = roomMatrix[cx] && roomMatrix[cx][cy] ? roomMatrix[cx][cy][localIdx] : 0;
    if (rID !== 0 && rID !== 9999) return; // Cannot germinate inside houses

    // Soil check: tile fertility must support seed
    const reqFert = PLANT_DEFS[parentPlant.type]?.fertilityReq || 3;
    if (fertilityMatrix && fertilityMatrix[cx]?.[cy] && fertilityMatrix[cx][cy][localIdx] < reqFert) {
        return;
    }

    createPlant(targetX, targetY, fertilityMatrix, 0, parentPlant.type, leftoverTime);
}

/**
 * ⚡ REAL-TIME SIMULATION LOOP (Runs every 1s tick)
 */
export function updatePlants(modifier, fertilityMatrix, worldMatrix, roomMatrix) {
    const focus = getFocusCoordinates();
    const focusCX = Math.floor(focus.x / 1600);
    const focusCY = Math.floor(focus.y / 1600); 
    const now = Date.now();

    // Prevent boot-time chunk culling while the hero initializes
    if (focusCX === 0 && focusCY === 0 && hero.x > 1600) return;

    for (let [key, plant] of plants) {
        if (plant.health <= 0) {
            witherPlant(plant, key, fertilityMatrix);
            continue;
        }

        const plantCX = Math.floor(plant.gx / 100);
        const plantCY = Math.floor(plant.gy / 100);

        // Chunk culling outside active 3x3 window
        if (Math.abs(plantCX - focusCX) > 1 || Math.abs(plantCY - focusCY) > 1) {
            deletePlant(plant.gx, plant.gy);
            continue; 
        }

        if (!plant.lastUpdated) plant.lastUpdated = now;
        let deltaSeconds = (now - plant.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0;

        // Cap local time step to 2 seconds to prevent withering avalanches during lag
        if (deltaSeconds > 2.0) {
            deltaSeconds = 2.0;
        }

        const pad = 32; 
        const screenX = (plant.gx * 16) + viewport.offset[0];
        const screenY = (plant.gy * 16) + viewport.offset[1];
        const inViewport = (
            screenX >= -pad && 
            screenX <= viewport.screen[0] + pad && 
            screenY >= -pad && 
            screenY <= viewport.screen[1] + pad
        );

        if (!inViewport && deltaSeconds < 1.5) {
            continue; 
        }

        plant.lastUpdated = now;
        
        const speed = CONFIG.PLANT_LIFECYCLE_SPEED || 1.0;
        let simulatedTime = deltaSeconds * speed;
        const def = PLANT_DEFS[plant.type];

        let tileVirulence = 0;
        const bac = getBacteriaData(plant.gx, plant.gy);
        if (bac && bac.data) {
            tileVirulence = (bac.data[bac.idx] >> 8) & 0xFF;
        }
        const virulenceBoost = 1.0 + (tileVirulence * 0.025);

        // --- 1. GROWTH PHASE ---
        if (plant.growth < 100) {
            const ratePerSec = (plant.growthRate || 0.4) * 0.1 * virulenceBoost; 
            const growthAdded = ratePerSec * simulatedTime;

            if (def?.isCyclical && !plant.hasFlowered && plant.growth >= def.flowerGrowth) {
                plant.hasFlowered = true;
                const cx = Math.floor(plant.gx / 100);
                const cy = Math.floor(plant.gy / 100);
                const lx = ((plant.gx % 100) + 100) % 100;
                const ly = ((plant.gy % 100) + 100) % 100;
                
                if (fertilityMatrix && fertilityMatrix[cx] && fertilityMatrix[cx][cy]) {
                    const localIdx = (ly * 100) + lx;
                    fertilityMatrix[cx][cy][localIdx] = Math.max(0, fertilityMatrix[cx][cy][localIdx] - def.flowerFertilityCost);
                }
            }
            
            if (plant.growth + growthAdded >= 100) {
                const timeTo100 = (100 - plant.growth) / ratePerSec;
                plant.growth = 100;
                plant.seedTimer = 15.0 + Math.random() * 10.0;
                simulatedTime -= timeTo100; 
            } else {
                plant.growth += growthAdded;
                simulatedTime = 0; 
            }
        }
        
        // --- 2. SEEDING & WITHERING PHASE ---
        if (plant.growth >= 100 && simulatedTime > 0) {
            // Cyclical crops (tomatoes, etc.) stay mature with harvestable fruit
            if (def?.isCyclical) {
                simulatedTime = 0;
                continue;
            }

            // Wild flora casts seeds and eventually withers
            while (simulatedTime > 0 && plant.seedsRemaining > 0) {
                if (simulatedTime >= plant.seedTimer) {
                    simulatedTime -= plant.seedTimer;
                    spreadSeed(plant, fertilityMatrix, worldMatrix, roomMatrix, simulatedTime / speed); 
                    plant.seedsRemaining--;

                    if (plant.seedsRemaining <= 0) {
                        witherPlant(plant, key, fertilityMatrix);
                        simulatedTime = 0; 
                        break; 
                    } else {
                        plant.seedTimer = 20.0 + (Math.random() * 10.0);
                    }
                } else {
                    plant.seedTimer -= simulatedTime;
                    simulatedTime = 0; 
                }
            }
        }
    }
}