// js/plants.js
import { seedBacteria } from './bacteria.js';
import { ITEM_TYPES } from './items.js';
import { hero } from './entities.js'; 

if (typeof window !== 'undefined') {
    logStep("plants.js");
}

export const plants = new Map();

// The normal, slow growth rates!
export const PLANT_DEFS = {
    grass: { stages: [59, 58, 57, 56, 55], growthRate: 0.5, fertilityReq: 3, spreadRange: 2 },
    rose: { stages: [10, 9, 8, 7, 6], growthRate: 0.25, fertilityReq: 8, spreadRange: 2 },
    violet: { stages: [22, 21, 20, 19, 18], growthRate: 0.25, fertilityReq: 8, spreadRange: 2 },
    sunflower: { stages: [118, 117, 116, 115, 114], growthRate: 0.25, fertilityReq: 12, spreadRange: 2 },
    turnip: { stages: [4, 3, 2, 1], growthRate: 0.4, fertilityReq: 5, spreadRange: 1 },
    tomato: { stages: [28, 27, 26, 25], growthRate: 0.2, fertilityReq: 40, spreadRange: 1 },
    eggplant: { stages: [40, 39, 38, 37], growthRate: 0.15, fertilityReq: 85, spreadRange: 1 },
    strawberry: { stages: [76, 75, 74, 73], growthRate: 0.24, fertilityReq: 45, spreadRange: 1 },
    pumpkin: { stages: [100, 99, 98, 97], growthRate: 0.35, fertilityReq: 25, spreadRange: 1 },
    watermelon: { stages: [34, 33, 32, 31], growthRate: 0.35, fertilityReq: 28, spreadRange: 1 },
    corn: { stages: [112, 111, 110, 109], growthRate: 0.35, fertilityReq: 8, spreadRange: 1 },
    wheat: { stages: [64, 63, 62, 61], growthRate: 0.4, fertilityReq: 6, spreadRange: 1 },
    pineapple: { stages: [53, 52, 51, 50, 49], growthRate: 0.05, fertilityReq: 25, spreadRange: 1 },
    potato: { stages: [89, 88, 87, 86, 85], growthRate: 0.15, fertilityReq: 32, spreadRange: 1 }
};

export function createPlant(gx, gy, fertilityMatrix, startingGrowth = 0, type = 'grass', leftoverTime = 0) {
    const key = `${gx}_${gy}`;
    if (plants.has(key)) return; 

    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const idx = (ly * 100) + lx; 

    const cell = fertilityMatrix[cx]?.[cy];
    if (!cell) return;
    const soilF = cell[idx] || 0;

    const required = PLANT_DEFS[type].fertilityReq;
    if (soilF < required) return; 

    cell[idx] -= required;

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
        
        // 🕰️ TIME TRAVEL FIX: If this seed was theoretically dropped 500 seconds ago,
        // we set its "birth date" to 500 seconds in the past!
        lastUpdated: Date.now() - (leftoverTime * 1000) 
    });

    import('./bacteria.js').then(m => m.seedBacteria(gx, gy, "organic_plant", maxHP, 0));
}

export function updatePlants(modifier, fertilityMatrix, worldMatrix, roomMatrix) {
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);
    const now = Date.now();

    for (let [key, plant] of plants) {
        const plantCX = Math.floor(plant.gx / 100);
        const plantCY = Math.floor(plant.gy / 100);

        // 🧊 TIER 3 FREEZER
        // If they are outside the grid, we skip them entirely!
        // This causes their `lastUpdated` to fall behind the current time.
        if (Math.abs(plantCX - heroCX) > 1 || Math.abs(plantCY - heroCY) > 1) {
            continue; 
        }

        // 🕰️ TIME-DIFFERENTIAL CATCH-UP LOGIC
        if (!plant.lastUpdated) plant.lastUpdated = now; // Fallback for old saves
        
        let deltaSeconds = (now - plant.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0; // Safety check
        plant.lastUpdated = now;

        // How much time do we need to simulate this tick?
        // (Normally 1.0s, but if we just unfroze, it could be 600.0s!)
        let simulatedTime = deltaSeconds;

        // --- 1. GROWTH PHASE ---
        if (plant.growth < 100) {
            const ratePerSec = plant.growthRate * 0.1; 
            const growthAdded = ratePerSec * simulatedTime;
            
            // Did it reach 100% while we were gone?
            if (plant.growth + growthAdded >= 100) {
                const timeTo100 = (100 - plant.growth) / ratePerSec;
                
                plant.growth = 100;
                plant.spriteStage = 4; 
                plant.seedTimer = 100.0; 
                
                // Subtract the time it took to finish growing
                simulatedTime -= timeTo100; 
            } else {
                // Still growing normally
                plant.growth += growthAdded;
                if (plant.growth > 30) plant.spriteStage = 1;
                if (plant.growth > 80) plant.spriteStage = 2;
                
                // Used all our time, stop simulating
                simulatedTime = 0; 
            }
        } 
        
        // --- 2. SEEDING & WITHERING PHASE ---
        // If it's fully grown and we STILL have simulated time leftover!
        if (plant.growth >= 100 && simulatedTime > 0) {
            
            // Fast-forward through as many seeds/withering events as the time allows
            while (simulatedTime > 0 && plant.seedsRemaining > 0) {
                
                // Do we have enough time to drop the next seed?
                if (simulatedTime >= plant.seedTimer) {
                    simulatedTime -= plant.seedTimer;
                    
                    // 👇 Pass the REMAINING simulatedTime to the seed!
                    spreadSeed(plant, fertilityMatrix, worldMatrix, roomMatrix, simulatedTime); 
                    
                    plant.seedsRemaining--;

                    // Are we out of seeds? (Time to wither)
                    if (plant.seedsRemaining <= 0) {
                        
                        // 🍂 THE WITHERING
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
                        
                        // Stop simulating for this plant (it's dead!)
                        simulatedTime = 0; 
                        break; 
                    } else {
                        // Reset the timer for the next seed drop
                        plant.seedTimer = 100.0 + (Math.random() * 100.0);
                    }
                } else {
                    // Not enough time to drop a seed, just drain the timer
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