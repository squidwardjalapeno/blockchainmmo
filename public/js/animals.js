// js/animals.js
import { seedBacteria } from './bacteria.js';
import { plants } from './plants.js';
import { ITEM_TYPES } from './items.js';
import { ctx2 } from './renderer.js';


export const animals = []; // Array to hold all chickens

/**
 * Creates a new chicken at a tile coordinate
 */
export function spawnChicken(gx, gy) {
    animals.push({
        gx: gx,
        gy: gy,
        x: gx * 16,
        y: gy * 16,
        targetX: gx * 16,
        targetY: gy * 16,
        speed: 20,
        hunger: 80,
        state: 'idle', // 'idle', 'walking', 'eating'
        moveTimer: Math.random() * 2,
        dir: 'Down'
    });
    console.log("🐣 A chicken has hatched!");
}

/**
 * The main AI loop for all animals
 */
export function updateAnimals(modifier, worldMatrix, roomMatrix) {
    animals.forEach(chicken => {
        // 1. HUNGER STEADILY RISES
        chicken.hunger += modifier * 2; 

        // 2. THE BRAIN: CHOOSE A STATE
        chicken.moveTimer -= modifier;
        if (chicken.moveTimer <= 0) {
            
            // --- 🏹 TARGETING LOGIC ---
            if (chicken.hunger >= 90) {

                ctx2.strokeStyle = "red"; // Draw a red "target" line to its food (for debugging)
    ctx2.beginPath();
    ctx2.moveTo(viewport.offset + chicken.x, viewport.offset + chicken.y);
    ctx2.lineTo(viewport.offset + chicken.targetX, viewport.offset + chicken.targetY);
    ctx2.stroke();
                // Find a plant within a 50-tile radius
                let foundFood = false;
                const tx = Math.floor(chicken.x / 16);
                const ty = Math.floor(chicken.y / 16);

                for (let ox = -50; ox <= 50; ox++) {
                    for (let oy = -50; oy <= 50; oy++) {
                        const key = `${tx + ox}_${ty + oy}`;
                        if (plants.has(key)) {
                            // SET TARGET TO PLANT COORDS
                            chicken.targetX = (tx + ox) * 16;
                            chicken.targetY = (ty + oy) * 16;
                            chicken.state = 'walking';
                            chicken.moveTimer = 2; // Focus on this for 2 seconds
                            foundFood = true;
                            break;
                        }
                    }
                    if (foundFood) break;
                }
                
                // If no food found, just wander sadly
                if (!foundFood) chicken.state = 'walking';

            } else {
                // NOT HUNGRY: Just wander or chill
                chicken.state = Math.random() > 0.3 ? 'walking' : 'idle';
                if (chicken.state === 'walking') {
                    chicken.targetX = chicken.x + (Math.random() * 64 - 32);
                    chicken.targetY = chicken.y + (Math.random() * 64 - 32);
                }
                chicken.moveTimer = 2 + Math.random() * 2;
            }
        }

        // 3. EXECUTE MOVEMENT
        if (chicken.state === 'walking') {
            const dx = chicken.targetX - chicken.x;
            const dy = chicken.targetY - chicken.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 2) {
                chicken.x += (dx / dist) * chicken.speed * modifier;
                chicken.y += (dy / dist) * chicken.speed * modifier;
            } else {
                // ARRIVED AT TARGET
                chicken.x = chicken.targetX;
                chicken.y = chicken.targetY;
                chicken.state = 'idle';

                // IF AT A PLANT AND HUNGRY: EAT IT
                const curTX = Math.floor(chicken.x / 16);
                const curTY = Math.floor(chicken.y / 16);
                const plantKey = `${curTX}_${curTY}`;

                if (chicken.hunger >= 90 && plants.has(plantKey)) {
                    plants.delete(plantKey);
                    chicken.hunger = 0;
                    console.log("🐔 MISSION ACCOMPLISHED: Chicken ate the target plant!");
                }
            }
        }

        // 4. THE POOP (The Fertilizer Loop)
        // ~1 in 500 chance per tick to drop "organic_drop"
        if (Math.random() > 0.998) {
            const tx = Math.floor((chicken.x + 8) / 16);
            const ty = Math.floor((chicken.y + 8) / 16);
            // Drop high-virulence fertilizer (Poop)
            seedBacteria(tx, ty, "chicken_poop", ITEM_TYPES.CHICKEN_POOP.baseHealth, ITEM_TYPES.CHICKEN_POOP.baseVirulence); 
            console.log("💩 Chicken drop!");
        }
    });
}
