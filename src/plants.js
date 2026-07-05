// src/plants.js
import { seedBacteria } from './bacteria.js';
import { ITEM_TYPES } from './items.js';
// src/plants.js
import { hero, getFocusCoordinates } from './entities.js';
import { viewport } from './viewport.js'; // 👈 IMPORTED: Allows viewport boundary checks
import { socket } from './multiplayer.js'; // 👈 ADD THIS IMPORT



if (typeof window !== 'undefined') {
    logStep("plants.js");
}

export const plants = new Map();

// Standard botanical definitions
export const PLANT_DEFS = {
    grass: { stages: [59, 58, 57, 56, 55], growthRate: 0.5, fertilityReq: 3, spreadRange: 2 },
    rose: { stages: [10, 9, 8, 7, 6], growthRate: 0.25, fertilityReq: 8, spreadRange: 2 },
    violet: { stages: [22, 21, 20, 19, 18], growthRate: 0.25, fertilityReq: 8, spreadRange: 2 },
    sunflower: { stages: [118, 117, 116, 115, 114], growthRate: 0.25, fertilityReq: 12, spreadRange: 2 },
    turnip: { stages: [4, 3, 2, 1], growthRate: 0.4, fertilityReq: 5, spreadRange: 1 },
    tomato: { 
        stages: [23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12], 
        tileset: 'cropTileset2', 
        growthRate: 0.2, 
        fertilityReq: 40, 
        spreadRange: 1,
        isCyclical: true,        
        resetGrowth: 26,         
        flowerGrowth: 34,        
        flowerFertilityCost: 15,  
        harvestWindow: 3 
    },
    eggplant: { 
        stages: [46, 45, 44, 43, 42, 41, 40, 39, 38, 37], 
        tileset: 'cropTileset2', 
        growthRate: 0.15, 
        fertilityReq: 85, 
        spreadRange: 1,
        isCyclical: true,        
        resetGrowth: 31,         
        flowerGrowth: 41,        
        flowerFertilityCost: 20  
    },
    strawberry: { 
        stages: [82, 81, 80, 79, 78, 77, 76, 75, 74, 73], 
        tileset: 'cropTileset2',
        growthRate: 0.24, 
        fertilityReq: 45, 
        spreadRange: 1,
        isCyclical: true,        
        resetGrowth: 31,         
        flowerGrowth: 41,        
        flowerFertilityCost: 10  
    },
    pumpkin: { stages: [100, 99, 98, 97], growthRate: 0.35, fertilityReq: 25, spreadRange: 1 },
    watermelon: { stages: [34, 33, 32, 31], growthRate: 0.35, fertilityReq: 28, spreadRange: 1 },
    corn: { stages: [112, 111, 110, 109], growthRate: 0.35, fertilityReq: 8, spreadRange: 1 },
    wheat: { stages: [64, 63, 62, 61], growthRate: 0.4, fertilityReq: 6, spreadRange: 1 },
    pineapple: { stages: [53, 52, 51, 50, 49], growthRate: 0.05, fertilityReq: 25, spreadRange: 1 },
    potato: { stages: [89, 88, 87, 86, 85], growthRate: 0.15, fertilityReq: 32, spreadRange: 1 }
};

// 🧠 HELPER: Deletes a plant, refunds nutrients to soil, and spawns compost
function witherPlant(plant, key, fertilityMatrix) {
    const cx = Math.floor(plant.gx / 100);
    const cy = Math.floor(plant.gy / 100);
    const lx = ((plant.gx % 100) + 100) % 100;
    const ly = ((plant.gy % 100) + 100) % 100;
    const idx = (ly * 100) + lx;

    // Instant Nutrient Refund
    if (fertilityMatrix[cx] && fertilityMatrix[cx][cy]) {
        fertilityMatrix[cx][cy][idx] = Math.min(255, fertilityMatrix[cx][cy][idx] + PLANT_DEFS[plant.type].fertilityReq);
    }

    // Wipe the bacteria anchor and drop compost
    import('./bacteria.js').then(m => {
        const bac = m.getBacteriaData(plant.gx, plant.gy);
        if (bac && bac.data) bac.data[bac.idx] = 0;
        m.seedBacteria(plant.gx, plant.gy, "grass_item", 12, 2);
    });

    plants.delete(key);
}

// Replace createPlant() in src/plants.js with this:

export function createPlant(gx, gy, fertilityMatrix = null, startingGrowth = 0, type = 'grass', leftoverTime = 0, isServerSync = false) {
    const key = `${gx}_${gy}`;
    if (plants.has(key)) return; 

    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const idx = (ly * 100) + lx; 

    if (fertilityMatrix) {
        const cell = fertilityMatrix[cx]?.[cy];
        if (cell) {
            const required = PLANT_DEFS[type].fertilityReq;
            cell[idx] = Math.max(0, cell[idx] - required); 
        }
    }

    const maxHP = (type === 'grass') ? 60 : 40;
    let initialStage = 0;
    if (startingGrowth > 30) initialStage = 1;
    if (startingGrowth > 80) initialStage = 2;
    if (startingGrowth >= 100) initialStage = 4;

    plants.set(key, {
        gx, gy,
        type: type, 
        growth: startingGrowth,
        growthRate: PLANT_DEFS[type].growthRate,    
        health: maxHP,      
        maxHealth: maxHP,   
        spriteStage: initialStage,
        seedsRemaining: Math.floor(Math.random() * 2) + 3,
        seedTimer: startingGrowth >= 100 ? (Math.random() * 200.0) : 0,
        hasFlowered: false, 
        lastUpdated: Date.now() - (leftoverTime * 1000) 
    });

    // Statically imported and executed synchronously (no Promises allocated)
    seedBacteria(gx, gy, "organic_plant", maxHP, 0);

    // Only emit to server if the plant was generated locally by a client action
    if (!isServerSync && socket && socket.connected) {
        socket.emit('registerWildPlant', { 
            gx: gx, 
            gy: gy, 
            type: type, 
            growth: startingGrowth,
            growthRate: PLANT_DEFS[type].growthRate
        });
    }
}

export function updatePlants(modifier, fertilityMatrix, worldMatrix, roomMatrix) {
    const focus = getFocusCoordinates();
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);
    const now = Date.now();

    for (let [key, plant] of plants) {
        const plantCX = Math.floor(plant.gx / 100);
        const plantCY = Math.floor(plant.gy / 100);

        // ==========================================
        // ❄️ TIER 3: FROZEN ZONE (Outside 3x3 Chunks)
        // ==========================================
        const isInsideActiveChunks = Math.abs(plantCX - heroCX) <= 1 && Math.abs(plantCY - heroCY) <= 1;
        if (!isInsideActiveChunks) {
            // Purge distant plants from client memory to prevent unbound RAM leakage
            plants.delete(key); 
            continue; 
        }

        // Initialize elapsed duration
        if (!plant.lastUpdated) plant.lastUpdated = now;
        let deltaSeconds = (now - plant.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0;

        // Viewport check
        const pad = 32; 
        const screenX = (plant.gx * 16) + viewport.offset[0];
        const screenY = (plant.gy * 16) + viewport.offset[1];
        const inViewport = (
            screenX >= -pad && 
            screenX <= viewport.screen[0] + pad && 
            screenY >= -pad && 
            screenY <= viewport.screen[1] + pad
        );

        // ==========================================
        // ❄️ TIER 2: COLD HEARTBEAT (Off-Screen Active)
        // ==========================================
        if (!inViewport && deltaSeconds < 1.5) {
            continue; 
        }

        plant.lastUpdated = now;
        let simulatedTime = deltaSeconds;

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time / Catch-up)
        // ==========================================

        // --- 1. GROWTH PHASE ---
        if (plant.growth < 100) {
            // 🎯 THE FIX: Restored the * 0.1 multiplier
            const ratePerSec = plant.growthRate * 0.1; 
            const growthAdded = ratePerSec * simulatedTime;
            const def = PLANT_DEFS[plant.type];

            // Cyclical flower drain
            if (def.isCyclical && !plant.hasFlowered && plant.growth >= def.flowerGrowth) {
                plant.hasFlowered = true;
                
                const cx = Math.floor(plant.gx / 100);
                const cy = Math.floor(plant.gy / 100);
                const lx = ((plant.gx % 100) + 100) % 100;
                const ly = ((plant.gy % 100) + 100) % 100;
                
                if (fertilityMatrix[cx] && fertilityMatrix[cx][cy]) {
                    const idx = (ly * 100) + lx;
                    fertilityMatrix[cx][cy][idx] = Math.max(0, fertilityMatrix[cx][cy][idx] - def.flowerFertilityCost);
                }
                console.log(`🌸 ${plant.type} flowered! Drained ${def.flowerFertilityCost} fertility.`);
            }
            
            if (plant.growth + growthAdded >= 100) {
                const timeTo100 = (100 - plant.growth) / ratePerSec;
                plant.growth = 100;
                plant.spriteStage = def.stages.length - 1; 
                plant.seedTimer = 100.0; 
                simulatedTime -= timeTo100; 
            } else {
                plant.growth += growthAdded;
                simulatedTime = 0; 
            }
        }
        
        // --- 2. SEEDING & WITHERING PHASE ---
        if (plant.growth >= 100 && simulatedTime > 0) {
            while (simulatedTime > 0 && plant.seedsRemaining > 0) {
                if (simulatedTime >= plant.seedTimer) {
                    simulatedTime -= plant.seedTimer;
                    spreadSeed(plant, fertilityMatrix, worldMatrix, roomMatrix, simulatedTime); 
                    plant.seedsRemaining--;

                    if (plant.seedsRemaining <= 0) {
                        witherPlant(plant, key, fertilityMatrix);
                        simulatedTime = 0; 
                        break; 
                    } else {
                        plant.seedTimer = 100.0 + (Math.random() * 100.0);
                    }
                } else {
                    plant.seedTimer -= simulatedTime;
                    simulatedTime = 0; 
                }
            }
        }
    }
}

function spreadSeed(parentPlant, fertilityMatrix, worldMatrix, roomMatrix, leftoverTime = 0) {
    const range = PLANT_DEFS[parentPlant.type].spreadRange || 2;
    const targetX = parentPlant.gx + Math.floor(Math.random() * (range * 2 + 1)) - range;
    const targetY = parentPlant.gy + Math.floor(Math.random() * (range * 2 + 1)) - range;

    if (targetX === parentPlant.gx && targetY === parentPlant.gy) return;

    const key = `${targetX}_${targetY}`;
    if (plants.has(key)) return;

    const cx = Math.floor(targetX / 100);
    const cy = Math.floor(targetY / 100);
    const lx = ((targetX % 100) + 100) % 100;
    const ly = ((targetY % 100) + 100) % 100;
    const idx = (ly * 100) + lx; 

    if (!worldMatrix || !worldMatrix[cx] || !worldMatrix[cx][cy]) return;
    if (worldMatrix[cx][cy][idx] !== 63) return;
    
    const rID = roomMatrix[cx] && roomMatrix[cx][cy] ? roomMatrix[cx][cy][idx] : 0;
    if (rID !== 0 && rID !== 9999) return;

    createPlant(targetX, targetY, fertilityMatrix, 0, parentPlant.type, leftoverTime);
}

