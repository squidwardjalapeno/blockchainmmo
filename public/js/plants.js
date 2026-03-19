// js/plants.js
import { seedBacteria } from './bacteria.js';
import { ITEM_TYPES } from './items.js'; 

export const plants = new Map(); // Key: "x_y", Value: Plant Object

// js/plants.js

export function createGrass(gx, gy, fertilityMatrix) {
    const key = `${gx}_${gy}`;
    if (plants.has(key)) return; 

    // 1. Calculate Local Coordinates
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;

    // 2. Get Soil Quality (0 to 255)
    const soilF = fertilityMatrix[cx]?.[cy]?.[lx]?.[ly] || 0;

    // 3. HP Bonus: 12 (Base) + (12 * (Soil/255))
    // Max fertility (255) = 24 HP
    const maxHP = 60 + Math.floor((soilF / 255) * 12);

    plants.set(key, {
        gx, gy,
        growth: 0,
        growthRate: 0.1,
        health: maxHP,      // Buffed health!
        maxHealth: maxHP,   // Track the limit for the UI
        isDead: false,
        spriteStage: 0
    });

    // 4. Anchor the bacteria system so it knows a host is here
    seedBacteria(gx, gy, "organic_plant", maxHP, 0);
}


export function updatePlants(modifier, fertilityMatrix) {
    for (let [key, plant] of plants) {
        if (plant.growth < 100) {
            // Growth is boosted by soil fertility (we'll link this later!)
            plant.growth += plant.growthRate * (modifier * 10); 
            
            // Update visual stage based on %
            if (plant.growth > 30) plant.spriteStage = 1;
            if (plant.growth > 80) plant.spriteStage = 2;
            // Inside updatePlants() loop

        }

        if (plant.growth >= 100) {
    plant.growth = 100;
    plant.spriteStage = 4; // 🌸 Flower Stage
    
    // --- 🆕 PROPAGATION ATTEMPT ---
    // Every tick, a mature plant has a tiny chance to spread a seed
    if (Math.random() > 0.01) { // ~1 in 200 chance per tick
        console.log("🌸 Flower is attempting to spread seed!"); // 👈 CHECK FOR THIS
        spreadSeed(plant.gx, plant.gy, fertilityMatrix);
    }
}
        
        if (plant.growth > 100) plant.growth = 100;
    }
}

// js/plants.js

function spreadSeed(gx, gy, fertilityMatrix) {
    // 1. Pick a random direction (Up, Down, Left, Right) within 1 tile
    const range = 15;
    const targetX = gx + Math.floor(Math.random() * (range * 2 + 1)) - range;
    const targetY = gy + Math.floor(Math.random() * (range * 2 + 1)) - range;

    const key = `${targetX}_${targetY}`;

    // 2. Check if the spot is already taken
    if (plants.has(key)) return;

    // 3. CHECK THE SOIL (Fertility Gate)
    const cx = Math.floor(targetX / 100);
    const cy = Math.floor(targetY / 100);
    const lx = ((targetX % 100) + 100) % 100;
    const ly = ((targetY % 100) + 100) % 100;

    // 🕵️ DEBUG LOG:
    if (!fertilityMatrix) {
        console.error("❌ spreadSeed: fertilityMatrix is UNDEFINED!");
        return;
    }

    // 3. 🔍 DEFINE THE CELL (This fixes the ReferenceError!)
    const cell = fertilityMatrix[cx][cy]; 
    const soilF = fertilityMatrix[cx]?.[cy]?.[lx]?.[ly] || 0;

    // Only sprout if the soil is viable (> 3)
    if (soilF > 3) {
        // 2. CONSUME NUTRIENTS (The "Cost" of life)
        // Subtract 3, but don't let it go below 0
        cell[lx][ly] = Math.max(0, soilF - 3);

        // 🌱 A NEW LIFE BEGINS
        createGrass(targetX, targetY, fertilityMatrix);
        console.log(`✨ A new sprout appeared at [${targetX}, ${targetY}]! Soil: ${soilF}`);
    }
}
