// src/bacteria.js
import { CONFIG } from './config.js';
import { hero, getFocusCoordinates } from './entities.js';
import { plants } from './plants.js';
import { ITEM_TYPES } from './items.js';

export const bacteriaCells = new Map();
export const chunkLastUpdated = new Map(); 

if (typeof window !== 'undefined') {
    logStep("bacteria.js");
}

export const BACTERIA_TYPES = {
    "organic_drop": 1, "fish": 1, "organic_plant": 2, "grass": 2,
    "plant_matter": 3, "chicken_poop": 4, "cooked_fish": 5,
    "turnip_item": 6, "tomato_item": 7, "eggplant_item": 8,
    "strawberry_item": 9, "pumpkin_item": 10, "watermelon_item": 11,
    "corn_item": 12, "pineapple_item": 13, "potato_item": 14,
    "wheat_item": 15, "egg": 16,     "hay": 17, 

    "grass_seed": 20, "turnip_seed": 21, "tomato_seed": 22, "eggplant_seed": 23,
    "strawberry_seed": 24, "pumpkin_seed": 25, "watermelon_seed": 26, "corn_seed": 27,
    "pineapple_seed": 28, "potato_seed": 29, "wheat_seed": 30,
    "rose_seed": 31, "violet_seed": 32, "sunflower_seed": 33,

    "fish_trout": 40, "fish_panfish": 41, "fish_mackerel": 42, 
    "fish_muskellunge": 43, "fish_trevally": 44, "fish_squid": 45, 
    "fish_octopus": 46, "fish_eel": 47, "fish_angler": 48,

    "raw_chicken": 50, 
    "weapon_dagger": 60,
    "key": 61,
};

export function handleRemoteTileUpdate(data, worldMatrix) {
    const { gx, gy, traits } = data;
    
    if (traits === 0) {
        const { data: chunkData, idx } = getBacteriaData(gx, gy);
        if (chunkData) {
            chunkData[idx] = 0;
        }
        return;
    }

    if (traits < 1000) {
        const cx = Math.floor(gx / 100);
        const cy = Math.floor(gy / 100);
        if (worldMatrix && worldMatrix[cx]?.[cy]) {
            const lx = ((gx % 100) + 100) % 100;
            const ly = ((gy % 100) + 100) % 100;
            worldMatrix[cx][cy][ly * 100 + lx] = traits;
        }
    } else {
        const { data: chunkData, idx } = getBacteriaData(gx, gy);
        if (chunkData) {
            chunkData[idx] = traits;
        }
    }
}

export function getBacteriaData(gx, gy) {
    const cx = Math.floor(gx / CONFIG.CELL_SIZE);
    const cy = Math.floor(gy / CONFIG.CELL_SIZE);
    const lx = ((gx % CONFIG.CELL_SIZE) + CONFIG.CELL_SIZE) % CONFIG.CELL_SIZE;
    const ly = ((gy % CONFIG.CELL_SIZE) + CONFIG.CELL_SIZE) % CONFIG.CELL_SIZE;

    const cellKey = `${cx}_${cy}`;
    if (!bacteriaCells.has(cellKey)) {
        bacteriaCells.set(cellKey, new Uint32Array(CONFIG.CELL_SIZE * CONFIG.CELL_SIZE));
    }
    
    const data = bacteriaCells.get(cellKey);
    const idx = (ly * CONFIG.CELL_SIZE) + lx;
    return { data, idx };
}

export function updateBacteria(worldMatrix, fertilityMatrix) {
    const focus = getFocusCoordinates();
    const heroGTX = Math.floor(focus.x / CONFIG.TILE_SIZE);
    const heroGTY = Math.floor(focus.y / CONFIG.TILE_SIZE);
    const heroCX = Math.floor(heroGTX / CONFIG.CELL_SIZE);
    const heroCY = Math.floor(heroGTY / CONFIG.CELL_SIZE);
    const now = Date.now();

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
            const targetCX = heroCX + offsetX;
            const targetCY = heroCY + offsetY;
            
            if (targetCX >= 0 && targetCX < CONFIG.MAP_SIZE && targetCY >= 0 && targetCY < CONFIG.MAP_SIZE) {
                const key = `${targetCX}_${targetCY}`;
                
                if (chunkLastUpdated.has(key)) {
                    const lastTime = chunkLastUpdated.get(key);
                    const deltaSeconds = (now - lastTime) / 1000;
                    
                    if (deltaSeconds > 3.0) {
                        catchUpChunkBacteria(targetCX, targetCY, deltaSeconds, fertilityMatrix);
                    }
                }
                
                chunkLastUpdated.set(key, now);
                processCellSpread(targetCX, targetCY, worldMatrix, fertilityMatrix);
            }
        }
    }
}

export function catchUpChunkBacteria(cx, cy, deltaSeconds, fertilityMatrix) {
    const cellKey = `${cx}_${cy}`;
    const data = bacteriaCells.get(cellKey);
    if (!data) return;

    for (let idx = 0; idx < 10000; idx++) {
        let traits = data[idx];
        if (traits === 0) continue;

        let typeID = (traits >> 20) & 0xFF;
        if (typeID === 60 || typeID === 61 || typeID === 16 || typeID === 17) continue; 

        let h = traits & 0xFF;
        let v = (traits >> 8) & 0xFF;
        let r = (traits >> 16) & 0x0F;
        let hasPeaked = (traits >>> 31);

        let timeRemaining = deltaSeconds;

        if (h > 0) {
            const hDecay = Math.min(h, Math.floor(timeRemaining));
            h -= hDecay;
            timeRemaining -= hDecay;
        }

        if (h === 0 && timeRemaining > 0) {
            let bFert = 0;
            if (typeID === 1) bFert = ITEM_TYPES.BASS?.baseFertility || 100;
            else if (typeID === 3) bFert = ITEM_TYPES.PLANT_MATTER?.baseFertility || 20;
            else if (typeID === 4) bFert = ITEM_TYPES.CHICKEN_POOP?.baseFertility || 200;
            else if (typeID === 5) bFert = ITEM_TYPES.COOKED_BASS?.baseFertility || 80;
            else if (typeID === 16) bFert = ITEM_TYPES.EGG?.baseFertility || 15;

            const vDecayRate = 50 / 100; 
            const leakProgress = Math.min(1.0, timeRemaining / 100.0);

            if (bFert > 0 && fertilityMatrix[cx]?.[cy]) {
                const currentF = fertilityMatrix[cx][cy][idx];
                fertilityMatrix[cx][cy][idx] = Math.min(255, currentF + (bFert * leakProgress));
            }

            v = Math.max(0, v - Math.floor(timeRemaining * vDecayRate));
        }

        if (h === 0 && v === 0) {
            data[idx] = 0; 
        } else {
            data[idx] = ((h & 0xFF) | 
                        ((v & 0xFF) << 8) | 
                        ((r & 0x0F) << 16) | 
                        ((typeID & 0xFF) << 20) | 
                        (hasPeaked ? 0x80000000 : 0)) >>> 0;
        }
    }
}

function processCellSpread(cx, cy, worldMatrix, fertilityMatrix) {
    const cellKey = `${cx}_${cy}`;
    const data = bacteriaCells.get(cellKey);
    if (!data) return;

    for (let i = 0; i < 1000; i++) {
        const idx = Math.floor(Math.random() * 10000);
        let traits = data[idx];
        if (traits === 0) continue;

        let typeID = (traits >> 20) & 0xFF;
        if (typeID === 60 || typeID === 61 || typeID === 16 || typeID === 17) continue; 

        let h = traits & 0xFF;
        let v = (traits >> 8) & 0xFF;
        let r = (traits >> 16) & 0x0F;
        let hasPeaked = (traits >>> 31);

        if (h > 0 || v > 0) {
            if (typeID === 5) { 
                if (h > 0) {
                    if (Math.random() < 0.3) h = Math.max(0, h - 1); 
                } else if (!hasPeaked) {
                    v += 2;
                    if (v >= 50) { v = 50; hasPeaked = 1; }
                } else if (v > 10) {
                    v = Math.max(10, v - 2); 
                } else {
                    v = Math.max(0, v - 1); 
                }
            } 
            else if (typeID === 4) { 
                if (h > 0) {
                    if (Math.random() < 0.1) h = Math.max(0, h - 1); 
                } else {
                    if (Math.random() < 0.1) v = Math.max(0, v - 1); 
                }
            } 
            else if (typeID === 3) { 
                if (h > 0) {
                    if (Math.random() < 0.1) h = Math.max(0, h - 1);
                } else if (!hasPeaked) {
                    if (Math.random() < 0.1) v += 1;
                    if (v >= 8) { v = 8; hasPeaked = 1; }
                } else {
                    if (Math.random() < 0.1) v = Math.max(0, v - 1);
                }
            }
            else if (typeID === 2) { 
                if (v > 0 && v < 50 && Math.random() < 0.1) v += 1; 
            } 
            else if (typeID === 1 || (typeID >= 40 && typeID <= 48)) { 
                if (h > 0) {
                    h = Math.max(0, h - 1); 
                } else if (!hasPeaked) {
                    v += 2;
                    if (v >= 50) { v = 50; hasPeaked = 1; }
                } else if (v > 10) {
                    v = Math.max(10, v - 2); 
                } else {
                    v = Math.max(0, v - 1); 
                }
            }
            else {
                v = 0; 
            }

            if (h === 0 && v === 0) {
                if (data[idx] !== 0) {
                    data[idx] = 0; 
                }
            } else {
                const newTraits = ((Math.floor(h) & 0xFF) | 
                                  ((Math.floor(v) & 0xFF) << 8) | 
                                  ((r & 0x0F) << 16) | 
                                  ((typeID & 0xFF) << 20) | 
                                  (hasPeaked ? 0x80000000 : 0)) >>> 0;
                
                data[idx] = newTraits; 

                if (h === 0 && v > 0) {
                    let bFert = 0;
                    if (typeID === 1) bFert = ITEM_TYPES.BASS?.baseFertility || 100; 
                    else if (typeID === 3) bFert = ITEM_TYPES.PLANT_MATTER?.baseFertility || 20; 
                    else if (typeID === 4) bFert = ITEM_TYPES.CHICKEN_POOP?.baseFertility || 200; 
                    else if (typeID === 5) bFert = ITEM_TYPES.COOKED_BASS?.baseFertility || 80; 
                    else if (typeID === 6) bFert = ITEM_TYPES.TURNIP_ITEM?.baseFertility || 15;
                    else if (typeID === 7) bFert = ITEM_TYPES.TOMATO_ITEM?.baseFertility || 25;
                    else if (typeID === 8) bFert = ITEM_TYPES.EGGPLANT_ITEM?.baseFertility || 40;
                    else if (typeID === 9) bFert = ITEM_TYPES.STRAWBERRY_ITEM?.baseFertility || 20;
                    else if (typeID === 10) bFert = ITEM_TYPES.PUMPKIN_ITEM?.baseFertility || 20;
                    else if (typeID === 11) bFert = ITEM_TYPES.WATERMELON_ITEM?.baseFertility || 20;
                    else if (typeID === 12) bFert = ITEM_TYPES.CORN_ITEM?.baseFertility || 15;
                    else if (typeID === 13) bFert = ITEM_TYPES.PINEAPPLE_ITEM?.baseFertility || 30;
                    else if (typeID === 14) bFert = ITEM_TYPES.POTATO_ITEM?.baseFertility || 25;
                    else if (typeID === 15) bFert = ITEM_TYPES.WHEAT_ITEM?.baseFertility || 10;
                    else if (typeID === 16) bFert = ITEM_TYPES.EGG?.baseFertility || 15;

                    const nutrientLeak = bFert / 50;
                    const cell = fertilityMatrix[cx]?.[cy];
                    if (cell && cell[idx] !== undefined) {
                        const currentF = cell[idx];
                        if (currentF < 255) {
                            cell[idx] = Math.min(255, currentF + nutrientLeak);
                        }
                    }
                }

                if (v > 5 || (h === 0 && traits > 0 && typeID === 0)) {
                    if (Math.random() > 0.9) {
                        const curGX = (cx * 100) + (idx % 100);
                        const curGY = (cy * 100) + Math.floor(idx / 100);
                        const jumpX = Math.floor(curGX + (Math.random() * (r * 2 + 1)) - r);
                        const jumpY = Math.floor(curGY + (Math.random() * (r * 2 + 1)) - r);
                        attemptInfection(jumpX, jumpY, traits, worldMatrix);
                    }
                }
            }
        }
    }

    if (Math.random() > 0.9) { 
        let activeCount = 0;
        for (let j = 0; j < data.length; j++) {
            if (data[j] === 0) continue;

            const tempH = data[j] & 0xFF;
            const tempV = (data[j] >> 8) & 0xFF;
            const tempType = (data[j] >> 20) & 0xFF; 

            if (tempType === 60 || tempType === 61 || tempType === 16 || tempType === 17) {
                activeCount++;
                continue;
            }

            if (tempH === 0 && tempV === 0) {
                data[j] = 0;
            } else {
                activeCount++;
            }
        }
        if (activeCount === 0) {
            bacteriaCells.delete(cellKey);
            chunkLastUpdated.delete(cellKey); 
            console.log(`🧹 DEEP CLEAN: Chunk [${cx}, ${cy}] cleared.`);
        }
    }
}

export function attemptInfection(gx, gy, attackerTraits, worldMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const plantKey = `${ix}_${iy}`; 

    if (cx < 0 || cx >= 100 || cy < 0 || cy >= 100) return;
    if (!worldMatrix[cx] || !worldMatrix[cx][cy]) return;
    
    const groundTileID = worldMatrix[cx][cy][ly * 100 + lx];
    if (groundTileID !== 63) return;  

    const cellKey = `${cx}_${cy}`;
    if (!bacteriaCells.has(cellKey)) {
        bacteriaCells.set(cellKey, new Uint32Array(10000));
    }
    const data = bacteriaCells.get(cellKey);
    const idx = (ly * 100) + lx;
    const defenderTraits = data[idx];

    const aVir = (attackerTraits >> 8) & 0xFF;
    const aRange = (attackerTraits >> 16) & 0x0F;
    const aHealth = attackerTraits & 0xFF;

    let dTypeID = (defenderTraits >> 20) & 0xFF; 
    if (dTypeID === 60 || dTypeID === 61) return; 

    let dHealth = defenderTraits & 0xFF;
    let dVir    = (defenderTraits >> 8) & 0xFF;
    let dPeak   = (defenderTraits >>> 31);

    if (defenderTraits === 0) {
        const existingPlant = plants.get(plantKey);
        if (existingPlant) {
            dTypeID = 2;   
            dHealth = existingPlant.health; 
        } else {
            dTypeID = 0;   
            dHealth = 0;   
        }
        dVir = 0;
        dPeak = 0;
    }

    const infectionStrength = Math.floor(aVir * 0.20);
    
    if (aHealth === 0 && dTypeID !== 0) {
        dHealth = Math.max(0, dHealth - infectionStrength);

        const targetPlant = plants.get(plantKey);
        if (targetPlant) {
            targetPlant.health = dHealth;
        }
    }

    let newVir = Math.min(255, dVir + infectionStrength);
    const newRange = Math.max(aRange, (defenderTraits >> 16) & 0x0F);

    if (dTypeID === 2 && dHealth === 0) {
        dTypeID = 3;
        plants.delete(plantKey); 
        console.log(`💀 Plant at [${ix},${iy}] withered into rotting mulch.`);
    }

    data[idx] = ((Math.floor(dHealth) & 0xFF) | 
                ((newVir & 0xFF) << 8) | 
                ((newRange & 0x0F) << 16) | 
                ((dTypeID & 0x0F) << 20) | 
                (dPeak << 31)) >>> 0;
}

export function seedBacteria(gx, gy, typeName, health, virulence, isRemote = false) {
    const { data, idx } = getBacteriaData(gx, gy);
    const typeId = BACTERIA_TYPES[typeName] || 0;
    
    let range = 2;
    let packed = 0;

    if (typeId === 61) { 
        const houseId = health; 
        packed = (
            (houseId & 0xFFFF) |           
            ((typeId & 0xFF) << 20)        
        ) >>> 0;
    } 
    else {
        packed = (
            (Math.floor(health) & 0xFF) | 
            ((Math.floor(virulence) & 0xFF) << 8) | 
            ((range & 0x0F) << 16) | 
            ((typeId & 0xFF) << 20) 
        ) >>> 0;
    }

    data[idx] = packed;
}