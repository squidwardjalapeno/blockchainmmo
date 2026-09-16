// src/animals.js
import { seedBacteria } from './bacteria.js';
import { plants, deletePlant } from './plants.js';
import { ITEM_TYPES } from './items.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero, getFocusCoordinates } from './entities.js';
import { viewport } from './viewport.js'; 
import { findPath } from './pathfinding.js';
import { getObjectAt, solidTiles } from './staticObjects.js';

export const animals = []; 

/**
 * Spawns a free-range wild chicken anchored to the tile grid
 */
export function spawnChicken(gx, gy, id = null) {
    const chickenId = id || ('animal_' + Math.random().toString(36).substr(2, 9));
    
    // Prevent duplicate registration
    if (animals.some(a => a.id === chickenId)) return;

    const newChicken = {
        id: chickenId,
        isAnimal: true,
        // 🎯 Anchored exactly to the 16px tile grid center
        x: gx * 16, 
        y: gy * 16, 
        floor: 1, 
        speed: 35,
        
        hp: 30, 
        maxHp: 30,             
        energy: 100, 
        maxEnergy: 100,   
        
        hunger: 80, 
        eggTimer: 35.0 + Math.random() * 25.0, 
        poopTimer: 15.0 + Math.random() * 15.0,
        state: 'idle', 
        goal: 'wander', 
        path: [], 
        brainTimer: 1.0 + Math.random() * 2.5, // 3.0-4.0s cadence
        moveTimer: Math.random() * 2.0, 
        dir: 'East', 
        frame: 0,
        animTimer: 0,
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5,
        frustration: 0,
        
        hitboxLeft: 4,
        hitboxRight: 12,
        hitboxTop: 6,
        hitboxBottom: 14
    };

    animals.push(newChicken);
    return newChicken;
}

/**
 * 🧱 Checks if a specific tile coordinate is physically walkable ground:
 * Disallows deep water, building interiors, roofs, and solid physical obstacles.
 */
function isWalkable(tx, ty, worldMatrix, roomMatrix) {
    if (tx < 0 || tx >= 10000 || ty < 0 || ty >= 10000) return false;

    // 1. Static obstacles (wells, trees, closed fences)
    if (solidTiles.has(`${tx}_${ty}`)) return false;
    const obj = getObjectAt(tx, ty);
    if (obj && (obj.type === 'FOREST_TREE' || obj.type === 'INT_WALL' || obj.type === 'WELL_OBJECT')) {
        return false;
    }

    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;
    
    // 2. Deep water, oceans, lakes, and rivers
    const waterSolids = [10, 11, 17];
    if (waterSolids.includes(data.tileID)) return false;

    // 3. Buildings & Roofs (0 = wilderness, 9999 = open outdoor pasture)
    if (data.roomID !== 0 && data.roomID !== 9999) return false;

    // 4. Structural building walls & tiles
    const structuralSolids = [40, 48, 50, 52, 1, 3, 5, 41, 43, 27, 46, 47];
    if (structuralSolids.includes(data.tileID)) return false;
    
    return true;
}

/**
 * 🧠 Unified BFS pathfinder for on-screen chicken navigation
 */
function findPathToTarget(startTX, startTY, worldMatrix, roomMatrix, targetTileID = null) {
    const isWalkableFn = (tx, ty) => isWalkable(tx, ty, worldMatrix, roomMatrix);
    
    const isTargetFn = (tx, ty) => {
        if (targetTileID === null) {
            return plants.has(`${tx}_${ty}`); // Search for nearest grass or crop
        } else {
            const tileData = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
            return tileData && tileData.tileID === targetTileID; // Search for Nesting Box (Tile 44)
        }
    };

    return findPath(startTX, startTY, isWalkableFn, isTargetFn, 12);
}

/**
 * Picks a random valid neighboring tile for peaceful wandering
 */
function assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkable(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix));
    
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        chicken.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

/**
 * Helper: Drunkard's Walk for macro simulation
 */
function macroWander(startX, startY, steps, worldMatrix, roomMatrix) {
    let curX = startX;
    let curY = startY;
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];

    for (let i = 0; i < steps; i++) {
        const validDirs = dirs.filter(d => isWalkable(curX + d[0], curY + d[1], worldMatrix, roomMatrix));
        if (validDirs.length > 0) {
            const pick = validDirs[Math.floor(Math.random() * validDirs.length)];
            curX += pick[0];
            curY += pick[1];
        }
    }
    return { x: curX, y: curY };
}

/**
 * ⚡ O(1) Expanding radial spiral scan for food when off-screen
 */
function findNearestPlantOffScreen(startTX, startTY, maxRange = 8) {
    for (let r = 1; r <= maxRange; r++) {
        for (let ox = -r; ox <= r; ox++) {
            for (let oy = -r; oy <= r; oy++) {
                if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
                const tx = startTX + ox;
                const ty = startTY + oy;
                if (plants.has(`${tx}_${ty}`)) {
                    return { x: tx, y: ty };
                }
            }
        }
    }
    return null;
}

/**
 * ⚡ O(1) Radial scan for nearby nesting boxes (Tile 44) off-screen
 */
function findNearestTileIDOffScreen(startTX, startTY, worldMatrix, roomMatrix, targetTileID, maxRange = 8) {
    for (let ox = -maxRange; ox <= maxRange; ox++) {
        for (let oy = -maxRange; oy <= maxRange; oy++) {
            const tx = startTX + ox;
            const ty = startTY + oy;
            const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
            if (data && data.tileID === targetTileID) {
                return { x: tx, y: ty };
            }
        }
    }
    return null;
}

/**
 * ⚡ Off-screen fast coordinate stepper
 */
function findOffScreenAnimalPath(startTX, startTY, targetTX, targetTY) {
    const path = [];
    let curX = startTX;
    let curY = startTY;
    const maxSteps = 20; 

    for (let i = 0; i < maxSteps; i++) {
        if (curX === targetTX && curY === targetTY) break;

        const dx = targetTX - curX;
        const dy = targetTY - curY;

        if (Math.abs(dx) >= Math.abs(dy)) {
            curX += Math.sign(dx);
        } else {
            curY += Math.sign(dy);
        }

        path.push({ x: curX, y: curY });
    }
    return path.length > 0 ? path : null;
}

/**
 * 🌾 SIMULATES THE CHICKEN'S FREE-RANGE DRUNKARD'S WALK SWATH OVER EXTENDED OFFLINE TIME
 * Steps tile-by-tile proportionally to elapsed time, grazing weeds, dropping manure trails,
 * laying wild eggs, and starving realistically if trapped in barren wastelands.
 */
export function simulateChickenDrunkardsWalk(chicken, deltaSeconds, worldMatrix, roomMatrix) {
    // 1 Step every ~3.5 seconds of wander time
    const totalSteps = Math.floor(deltaSeconds / 3.5);
    if (totalSteps <= 0) return;

    let curTX = Math.floor((chicken.x + 8) / 16);
    let curTY = Math.floor((chicken.y + 8) / 16);
    let energy = chicken.energy !== undefined ? chicken.energy : 100;

    let stepsSincePoop = 0;
    let stepsSinceEgg = 0;

    const dirs = [
        { dx: 0, dy: -1, name: 'North' },
        { dx: 0, dy: 1,  name: 'South' },
        { dx: -1, dy: 0, name: 'West'  },
        { dx: 1, dy: 0,  name: 'East'  }
    ];

    for (let step = 0; step < totalSteps; step++) {
        // 1. Pick a random valid direction (No walls, roofs, or water)
        const shuffled = [...dirs].sort(() => Math.random() - 0.5);
        for (const d of shuffled) {
            const nextX = curTX + d.dx;
            const nextY = curTY + d.dy;

            if (isWalkable(nextX, nextY, worldMatrix, roomMatrix)) {
                if (d.dx !== 0) chicken.dir = d.dx > 0 ? 'East' : 'West';
                curTX = nextX;
                curTY = nextY;
                break;
            }
        }

        // 2. Metabolic Energy Drain
        energy -= 0.12;

        // 3. Grazing on wild grass/flora when hungry
        if (energy < 60) {
            const plantKey = `${curTX}_${curTY}`;
            if (plants.has(plantKey)) {
                const targetPlant = plants.get(plantKey);
                energy = Math.min(100, energy + Math.max(30, targetPlant.growth || 50));
                deletePlant(curTX, curTY);
            }
        }

        // 4. Starvation Check
        if (energy <= 0) {
            console.log(`💀 Wild Chicken ${chicken.id} starved to death during offline wandering at [${curTX}, ${curTY}].`);
            chicken.hp = 0;
            chicken.energy = 0;
            chicken.x = curTX * 16;
            chicken.y = curTY * 16;
            seedBacteria(curTX, curTY, "raw_chicken", 50, 0);
            return;
        }

        // 5. Scattering manure along the wander trail (~Every 20 steps)
        stepsSincePoop++;
        if (stepsSincePoop >= 20) {
            stepsSincePoop = 0;
            if (isWalkable(curTX, curTY, worldMatrix, roomMatrix)) {
                seedBacteria(curTX, curTY, "chicken_poop", 3, 12);
            }
        }

        // 6. Laying eggs along the wander trail (~Every 50 steps)
        stepsSinceEgg++;
        if (stepsSinceEgg >= 50 && energy >= 40) {
            stepsSinceEgg = 0;
            energy -= 20;
            if (isWalkable(curTX, curTY, worldMatrix, roomMatrix)) {
                seedBacteria(curTX, curTY, "egg", 1, 0);
            }
        }
    }

    chicken.x = curTX * 16;
    chicken.y = curTY * 16;
    chicken.energy = energy;
    chicken.path = [];
    chicken.state = 'idle';
}

/**
 * ⚡ MASTER 3-TIER ANIMAL SIMULATION LOOP (Runs at 60 FPS)
 */
export function updateAnimals(modifier, worldMatrix, roomMatrix) {
    const focus = getFocusCoordinates();
    const heroCX = Math.floor(focus.x / 1600);
    const heroCY = Math.floor(focus.y / 1600);
    const now = Date.now();

    // 1. Clean up dead animals at the top of the update frame
    for (let i = animals.length - 1; i >= 0; i--) {
        if (animals[i].hp <= 0) {
            seedBacteria(
                Math.floor((animals[i].x + 8) / 16), 
                Math.floor((animals[i].y + 8) / 16), 
                "raw_chicken", 50, 0
            );
            animals.splice(i, 1);
            continue;
        }
    }

    animals.forEach(chicken => {
        // ==========================================
        // 🎯 MULTIPLAYER LERP OVERRIDE:
        // If controlled by server, coordinates glide smoothly in multiplayer.js
        // ==========================================
        if (chicken.targetX !== undefined && chicken.targetX !== null) {
            return; 
        }

        const chickenCX = Math.floor(chicken.x / 1600);
        const chickenCY = Math.floor(chicken.y / 1600);

        // ==========================================
        // ❄️ TIER 3: FROZEN ZONE (Outside 3x3 active chunks)
        // ==========================================
        const isInsideActiveChunks = Math.abs(chickenCX - heroCX) <= 1 && Math.abs(chickenCY - heroCY) <= 1;
        if (!isInsideActiveChunks) {
            return;
        }

        if (!chicken.lastUpdated) chicken.lastUpdated = now;
        let deltaSeconds = (now - chicken.lastUpdated) / 1000;
        chicken.lastUpdated = now;

        // ==========================================
        // 🕰️ TIER 3: OFFLINE DRUNKARD'S WALK CATCH-UP
        // ==========================================
        if (deltaSeconds > 2.5) {
            simulateChickenDrunkardsWalk(chicken, Math.min(deltaSeconds, 86400), worldMatrix, roomMatrix);
            return; 
        }

        // Viewport bounds calculation
        const pad = 32; 
        const screenX = chicken.x + viewport.offset[0];
        const screenY = chicken.y + viewport.offset[1];
        const inViewport = (
            screenX >= -pad && 
            screenX <= viewport.screen[0] + pad && 
            screenY >= -pad && 
            screenY <= viewport.screen[1] + pad
        );

        // ==========================================
        // ❄️ TIER 2: COLD HEARTBEAT (Off-Screen Active)
        // ==========================================
        if (!inViewport) {
            chicken.slowTickTimer -= modifier;
            if (chicken.slowTickTimer <= 0) {
                chicken.slowTickTimer = 1.5;

                chicken.energy = Math.max(0, chicken.energy - 0.75);
                chicken.eggTimer = (chicken.eggTimer || 35.0) - 1.5;
                chicken.poopTimer = (chicken.poopTimer || 15.0) - 1.5;

                const currTX = Math.floor((chicken.x + 8) / 16);
                const currTY = Math.floor((chicken.y + 8) / 16);

                if (!chicken.path || chicken.path.length === 0) {
                    if (chicken.energy < 50) {
                        const foodPos = findNearestPlantOffScreen(currTX, currTY, 8);
                        const pathToFood = foodPos ? findOffScreenAnimalPath(currTX, currTY, foodPos.x, foodPos.y) : null;
                        
                        if (pathToFood) { 
                            chicken.path = pathToFood; 
                            chicken.goal = 'food'; 
                        } else { 
                            assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix); 
                            chicken.goal = 'wander'; 
                        }
                    } 
                    else if (chicken.eggTimer <= 0 && chicken.energy >= 40) {
                        const boxPos = findNearestTileIDOffScreen(currTX, currTY, worldMatrix, roomMatrix, 44, 8);
                        const pathToBox = boxPos ? findOffScreenAnimalPath(currTX, currTY, boxPos.x, boxPos.y) : null;
                        
                        if (pathToBox) { 
                            chicken.path = pathToBox; 
                            chicken.goal = 'egg'; 
                        } else {
                            chicken.energy -= 20;
                            seedBacteria(currTX, currTY, "egg", 1, 0);
                            chicken.eggTimer = 45.0 + Math.random() * 30.0;
                            assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                            chicken.goal = 'wander';
                        }
                    } else {
                        assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                        chicken.goal = 'wander';
                    }
                }

                // Instant coordinate step-teleportation off-screen
                if (chicken.path && chicken.path.length > 0) {
                    const nextNode = chicken.path.shift();
                    chicken.x = nextNode.x * 16;
                    chicken.y = nextNode.y * 16;

                    if (chicken.path.length === 0) {
                        const key = `${nextNode.x}_${nextNode.y}`;
                        if (chicken.goal === 'food' && plants.has(key)) {
                            const targetPlant = plants.get(key);
                            chicken.energy = Math.min(100, chicken.energy + Math.max(30, targetPlant.growth || 50));
                            deletePlant(nextNode.x, nextNode.y);
                        } 
                        else if (chicken.goal === 'egg' && chicken.energy >= 40) {
                            chicken.energy -= 20;
                            seedBacteria(nextNode.x, nextNode.y, "egg", 1, 0);
                            chicken.eggTimer = 45.0 + Math.random() * 30.0;
                        }
                    }
                }

                if (chicken.poopTimer <= 0) {
                    chicken.poopTimer = 20.0 + Math.random() * 20.0;
                    if (isWalkable(currTX, currTY, worldMatrix, roomMatrix)) {
                        seedBacteria(currTX, currTY, "chicken_poop", 3, 12);
                    }
                }
            }
            return; 
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time)
        // ==========================================

        // 🏃 1. 60 FPS Grid Stepping (Exact Hobbit movement method)
        if (chicken.path && chicken.path.length > 0) {
            const nextNode = chicken.path[0];
            const nextWorldX = nextNode.x * 16;
            const nextWorldY = nextNode.y * 16;

            const dx = nextWorldX - chicken.x;
            const dy = nextWorldY - chicken.y;
            const dist = Math.hypot(dx, dy);

            // Turn body East or West based strictly on horizontal movement
            if (Math.abs(dx) > 0.5) {
                chicken.dir = dx > 0 ? 'East' : 'West';
            }

            if (dist > 1.2) {
                const step = Math.min(dist, chicken.speed * modifier);
                chicken.x += (dx / dist) * step;
                chicken.y += (dy / dist) * step;
                chicken.state = 'walking';

                chicken.animTimer = (chicken.animTimer || 0) + modifier * 10;
                chicken.frame = Math.floor(chicken.animTimer) % 4;
            } else {
                // 🎯 Arrived at exact grid tile center: snap and idle
                chicken.x = nextWorldX;
                chicken.y = nextWorldY;
                chicken.path.shift();
                chicken.state = 'idle';
                chicken.frame = 0;

                // Check for food at the reached tile
                const plantKey = `${nextNode.x}_${nextNode.y}`;
                if (chicken.energy < 60 && plants.has(plantKey)) {
                    const plant = plants.get(plantKey);
                    chicken.energy = Math.min(100, chicken.energy + Math.max(30, plant.growth || 50));
                    deletePlant(nextNode.x, nextNode.y);
                }
            }
        } else {
            chicken.state = 'idle';
            chicken.frame = 0;
        }

        // 🧠 2. 3.5-Second Tile Decision Cadence
        chicken.energy = Math.max(0, (chicken.energy || 100) - (modifier * 0.15)); 
        chicken.frustration = Math.max(0, (chicken.frustration || 0) - modifier);
        chicken.brainTimer = (chicken.brainTimer || 0) - modifier;
        chicken.eggTimer = (chicken.eggTimer || 35.0) - modifier;
        chicken.poopTimer = (chicken.poopTimer || 15.0) - modifier;

        const currTX = Math.floor((chicken.x + 8) / 16);
        const currTY = Math.floor((chicken.y + 8) / 16);

        // Poop drop
        if (chicken.poopTimer <= 0) {
            chicken.poopTimer = 20.0 + Math.random() * 20.0;
            if (isWalkable(currTX, currTY, worldMatrix, roomMatrix)) {
                seedBacteria(currTX, currTY, "chicken_poop", 3, 12);
            }
        }

        // Egg drop
        if (chicken.eggTimer <= 0 && chicken.energy >= 40) {
            chicken.eggTimer = 45.0 + Math.random() * 30.0;
            chicken.energy -= 20;
            if (isWalkable(currTX, currTY, worldMatrix, roomMatrix)) {
                seedBacteria(currTX, currTY, "egg", 1, 0);
            }
        }

        // When brain timer hits 0: pick 1 adjacent tile and set path
        if (chicken.brainTimer <= 0 && (!chicken.path || chicken.path.length === 0)) {
            chicken.brainTimer = 3.2 + Math.random() * 0.8; // 3.2 to 4.0s pause

            let chosenTile = null;

            // Food seeking when hungry
            if (chicken.energy < 60 && chicken.frustration <= 0) {
                const pathToFood = findPathToTarget(currTX, currTY, worldMatrix, roomMatrix, null);
                if (pathToFood && pathToFood.length > 0) {
                    chosenTile = pathToFood[0]; // Take 1 step along the path to food
                }
            } 
            // Egg box seeking when ready to lay
            else if (chicken.eggTimer <= 0 && chicken.energy >= 40) {
                const pathToBox = findPathToTarget(currTX, currTY, worldMatrix, roomMatrix, 44);
                if (pathToBox && pathToBox.length > 0) {
                    chosenTile = pathToBox[0];
                }
            }

            // Otherwise pick 1 random walkable neighbor
            if (!chosenTile) {
                const neighbors = [
                    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
                    { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
                    { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
                ];
                const validNeighbors = neighbors.filter(n => isWalkable(currTX + n.dx, currTY + n.dy, worldMatrix, roomMatrix));
                if (validNeighbors.length > 0) {
                    const pick = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                    chosenTile = { x: currTX + pick.dx, y: currTY + pick.dy };
                }
            }

            if (chosenTile) {
                chicken.path = [chosenTile];
            }
        }
    });
}