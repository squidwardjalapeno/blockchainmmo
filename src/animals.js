// src/animals.js
import { seedBacteria } from './bacteria.js';
import { plants } from './plants.js';
import { ITEM_TYPES } from './items.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero, getFocusCoordinates } from './entities.js';
import { viewport } from './viewport.js'; 
import { findPath } from './pathfinding.js'; // 👈 Loaded from pathfinding.js

export const animals = []; 

export function spawnChicken(gx, gy) {
    animals.push({
        id: 'animal_' + Math.random().toString(36).substr(2, 9),
        isAnimal: true, // Identifies them to the combat system
        x: gx * 16, y: gy * 16, floor: 1, inventory: [], speed: 35,
        
        hp: 30, maxHp: 30,             
        energy: 100, maxEnergy: 100,   
        
        hunger: 80, eggTimer: 10.0, state: 'idle', goal: 'wander', path: [], 
        moveTimer: Math.random() * 2, dir: 'East', lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5 // Tracks cold-heartbeat updates
    });
}

// 🧠 HELPER: Checks if a specific tile coordinate is physically walkable
function isWalkable(tx, ty, worldMatrix, roomMatrix) {
    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;
    
    const solids = [40, 48, 50, 52, 17, 18, 19, 21, 22, 24, 27, 1, 3];
    if (solids.includes(data.tileID)) return false;
    
    return true;
}

/**
 * 🧠 REFURBISHED: Leverages the unified findPath utility
 */
function findPathToTarget(startTX, startTY, worldMatrix, roomMatrix, targetTileID = null) {
    const isWalkableFn = (tx, ty) => isWalkable(tx, ty, worldMatrix, roomMatrix);
    
    const isTargetFn = (tx, ty) => {
        if (targetTileID === null) {
            return plants.has(`${tx}_${ty}`); // Search for any growing plant
        } else {
            const tileData = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
            return tileData && tileData.tileID === targetTileID; // Search for specific tile ID (e.g. Nesting Box 44)
        }
    };

    return findPath(startTX, startTY, isWalkableFn, isTargetFn, 8); // 🎯 Reduced maxDepth to 8 tiles for on-screen search
}

// 🧠 HELPER: Pick a random nearby walkable tile for wandering
function assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkable(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix));
    
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        chicken.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

// 🧠 HELPER: Drunkard's Walk (For Macro Simulation)
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
 * ⚡ HIGH-PERFORMANCE OFF-SCREEN CHICKEN GRID RADIAL SCAN
 * Directly checks map keys in a expanding coordinate spiral. Runs in O(1) time.
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
 * ⚡ HIGH-PERFORMANCE STATIC TILE SCAN FOR NEST BOXES OFF-SCREEN
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
 * ⚡ HIGH-PERFORMANCE ANIMAL CATCH-UP / OFF-SCREEN VECTOR STEP GENERATOR
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

export function updateAnimals(modifier, worldMatrix, roomMatrix) {
    const focus = getFocusCoordinates();
    const heroCX = Math.floor(focus.x / 1600);
    const heroCY = Math.floor(focus.y / 1600);
    const now = Date.now();

    // 1. CLEANUP DEAD ANIMALS AT THE VERY TOP
    for (let i = animals.length - 1; i >= 0; i--) {
        if (animals[i].hp <= 0) {
            import('./bacteria.js').then(m => m.seedBacteria(
                Math.floor(animals[i].x / 16), 
                Math.floor(animals[i].y / 16), 
                "raw_chicken", 50, 0
            ));
            animals.splice(i, 1);
            continue;
        }
    }

    animals.forEach(chicken => {
        // ==========================================
        // 🎯 ONLINE MODE: Real-Time 60fps smoothing
        // ==========================================
        if (chicken.targetX !== undefined && chicken.targetY !== undefined) {
            chicken.x += (chicken.targetX - chicken.x) * 15 * modifier;
            chicken.y += (chicken.targetY - chicken.y) * 15 * modifier;
            return; // 🎯 Bypass offline local AI loops
        }

        const chickenCX = Math.floor(chicken.x / 1600);
        const chickenCY = Math.floor(chicken.y / 1600);

        // ==========================================
        // ❄️ TIER 3: FROZEN ZONE (Outside 3x3 Chunks)
        // ==========================================
        const isInsideActiveChunks = Math.abs(chickenCX - heroCX) <= 1 && Math.abs(chickenCY - heroCY) <= 1;
        if (!isInsideActiveChunks) {
            return; // Completely skip calculations. Animal is frozen.
        }

        // Initialize elapsed time
        if (!chicken.lastUpdated) chicken.lastUpdated = now;
        let deltaSeconds = (now - chicken.lastUpdated) / 1000;
        chicken.lastUpdated = now;

        // ==========================================
        // 🕰️ TIER 3: CATCH-UP (Step-In Fast Forward)
        // ==========================================
        if (deltaSeconds > 2.0) {
            let timeRemaining = Math.min(deltaSeconds, 86400); // Max 24 hours
            let simX = Math.floor(chicken.x / 16);
            let simY = Math.floor(chicken.y / 16);
            let poopsToDrop = Math.floor(timeRemaining * 0.0133);
            if (poopsToDrop > 20) poopsToDrop = 20; 
            
            while (timeRemaining > 0) {
                const stepTime = Math.min(30.0, timeRemaining);
                timeRemaining -= stepTime;

                chicken.energy = Math.max(0, chicken.energy - (stepTime * 2.0));
                chicken.eggTimer -= stepTime;

                // Hunger
                if (chicken.energy < 50) {
                    let foundFood = false;
                    let bestPlantKey = null;
                    let foodX, foodY;

                    // ⚡ O(1) OPTIMIZATION: Coordinate checks instead of iterating the global plants Map
                    for (let ox = -5; ox <= 5; ox++) {
                        for (let oy = -5; oy <= 5; oy++) {
                            const checkKey = `${simX + ox}_${simY + oy}`;
                            if (plants.has(checkKey)) {
                                bestPlantKey = checkKey;
                                const p = plants.get(checkKey);
                                foodX = p.gx;
                                foodY = p.gy;
                                break;
                            }
                        }
                        if (bestPlantKey) break;
                    }

                    if (bestPlantKey) {
                        simX = foodX; simY = foodY;
                        const p = plants.get(bestPlantKey);
                        chicken.energy = Math.min(100, chicken.energy + Math.max(20, p.growth));
                        
                        import('./bacteria.js').then(m => {
                            const bac = m.getBacteriaData(p.gx, p.gy);
                            if (bac && bac.data) bac.data[bac.idx] = 0;
                        });
                        plants.delete(bestPlantKey);
                        foundFood = true;
                    }

                    if (!foundFood) {
                        const wanderResult = macroWander(simX, simY, 6, worldMatrix, roomMatrix); 
                        simX = wanderResult.x; simY = wanderResult.y;
                    }
                } 
                // Lay Eggs
                else if (chicken.eggTimer <= 0 && chicken.energy >= 40) {
                    chicken.energy -= 40;
                    import('./bacteria.js').then(m => m.seedBacteria(simX, simY, "egg", 1, 0));
                    chicken.eggTimer = 10.0;
                }
                // Wander
                else {
                    const wanderResult = macroWander(simX, simY, 2, worldMatrix, roomMatrix); 
                    simX = wanderResult.x; simY = wanderResult.y;
                }

                // Dropping poop
                if (poopsToDrop > 0 && Math.random() < 0.3) {
                    if (isWalkable(simX, simY, worldMatrix, roomMatrix)) {
                        import('./bacteria.js').then(m => m.seedBacteria(simX, simY, "chicken_poop", 3, 12));
                        poopsToDrop--;
                    }
                }
            }

            chicken.x = simX * 16;
            chicken.y = simY * 16;
            chicken.path = [];
            chicken.state = 'idle';
            return; 
        }

        // Determine viewport presence
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
                chicken.slowTickTimer = 1.5; // Tick once every 1.5 seconds

                chicken.energy = Math.max(0, chicken.energy - 0.75);
                chicken.eggTimer -= 1.5;

                const currTX = Math.floor((chicken.x + 8) / 16);
                const currTY = Math.floor((chicken.y + 8) / 16);

                if (!chicken.path || chicken.path.length === 0) {
                    if (chicken.energy < 50) {
                        // ⚡ Bypasses BFS off-screen: Direct index lookup
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
                        // ⚡ Bypasses BFS off-screen: Direct index lookup
                        const boxPos = findNearestTileIDOffScreen(currTX, currTY, worldMatrix, roomMatrix, 44, 8);
                        const pathToBox = boxPos ? findOffScreenAnimalPath(currTX, currTY, boxPos.x, boxPos.y) : null;
                        
                        if (pathToBox) { 
                            chicken.path = pathToBox; 
                            chicken.goal = 'egg'; 
                        } else {
                            chicken.energy -= 40;
                            import('./bacteria.js').then(m => m.seedBacteria(currTX, currTY, "egg", 1, 0));
                            chicken.eggTimer = 10.0;
                            assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                            chicken.goal = 'wander';
                        }
                    } else {
                        assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                        chicken.goal = 'wander';
                    }
                }

                // Simplified path execution: Teleport to the next tile instantly
                if (chicken.path && chicken.path.length > 0) {
                    const nextNode = chicken.path.shift();
                    chicken.x = nextNode.x * 16;
                    chicken.y = nextNode.y * 16;

                    if (chicken.path.length === 0) {
                        const key = `${nextNode.x}_${nextNode.y}`;
                        if (chicken.goal === 'food' && plants.has(key)) {
                            const targetPlant = plants.get(key);
                            chicken.energy = Math.min(100, chicken.energy + Math.max(20, targetPlant.growth));
                            import('./bacteria.js').then(m => {
                                const bac = m.getBacteriaData(targetPlant.gx, targetPlant.gy);
                                if (bac && bac.data) bac.data[bac.idx] = 0;
                            });
                            plants.delete(key);
                        } 
                        else if (chicken.goal === 'egg' && chicken.energy >= 40) {
                            chicken.energy -= 40;
                            import('./bacteria.js').then(m => m.seedBacteria(nextNode.x, nextNode.y, "egg", 1, 0));
                            chicken.eggTimer = 10.0;
                        }
                    }
                }

                if (Math.random() > 0.8) {
                    import('./bacteria.js').then(m => m.seedBacteria(currTX, currTY, "chicken_poop", 3, 12));
                }
            }
            return; // Skip real-time physics and stepping completely!
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time)
        // ==========================================
        chicken.energy = Math.max(0, chicken.energy - (modifier * 0.5)); 
        chicken.frustration = Math.max(0, (chicken.frustration || 0) - modifier);
        chicken.moveTimer -= modifier;
        chicken.eggTimer -= modifier;

        const currTX = Math.floor((chicken.x + 8) / 16);
        const currTY = Math.floor((chicken.y + 8) / 16);

        if (chicken.moveTimer <= 0 && (!chicken.path || chicken.path.length === 0)) {
            if (chicken.energy < 50 && chicken.frustration <= 0) { 
                const pathToFood = findPathToTarget(currTX, currTY, worldMatrix, roomMatrix, null);
                if (pathToFood) {
                    chicken.path = pathToFood;
                    chicken.goal = 'food';
                } else {
                    assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                    chicken.goal = 'wander';
                }
            } 
            else if (chicken.eggTimer <= 0 && chicken.energy >= 40) {
                const pathToBox = findPathToTarget(currTX, currTY, worldMatrix, roomMatrix, 44);
                if (pathToBox) {
                    chicken.path = pathToBox;
                    chicken.goal = 'egg';
                } else {
                    chicken.energy -= 40;
                    import('./bacteria.js').then(m => m.seedBacteria(currTX, currTY, "egg", 1, 0));
                    chicken.eggTimer = 10.0;
                    assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                    chicken.goal = 'wander';
                }
            }
            else {
                if (Math.random() > 0.3) {
                    assignRandomWalk(chicken, currTX, currTY, worldMatrix, roomMatrix);
                }
                chicken.goal = 'wander';
            }
            chicken.moveTimer = 1 + Math.random() * 2;
        }

        if (chicken.path && chicken.path.length > 0) {
            chicken.state = 'walking';
            const nextNode = chicken.path[0];
            const targetX = nextNode.x * 16;
            const targetY = nextNode.y * 16;

            const dx = targetX - chicken.x;
            const dy = targetY - chicken.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dx > 0) chicken.dir = 'East';
            else if (dx < 0) chicken.dir = 'West';

            if (dist > 2) {
                const moveX = (dx / dist) * chicken.speed * modifier;
                const moveY = (dy / dist) * chicken.speed * modifier;

                if (!moveEntity(chicken, moveX, moveY, worldMatrix, roomMatrix)) {
                    chicken.path = [];
                    chicken.state = 'idle';
                    chicken.frustration = 3.0; 
                    chicken.moveTimer = 0; 
                }
            } else {
                chicken.x = targetX;
                chicken.y = targetY;
                chicken.path.shift(); 

                if (chicken.path.length === 0) {
                    chicken.state = 'idle';
                    const key = `${currTX}_${currTY}`;

                    if (chicken.goal === 'food' && plants.has(key)) {
                        const targetPlant = plants.get(key);
                        chicken.energy = Math.min(100, chicken.energy + Math.max(20, targetPlant.growth));
                        import('./bacteria.js').then(m => {
                            const bac = m.getBacteriaData(targetPlant.gx, targetPlant.gy);
                            if (bac && bac.data) bac.data[bac.idx] = 0;
                        });
                        plants.delete(key);
                    } 
                    else if (chicken.goal === 'egg' && chicken.energy >= 40) {
                        chicken.energy -= 40;
                        import('./bacteria.js').then(m => m.seedBacteria(currTX, currTY, "egg", 1, 0));
                        chicken.eggTimer = 10.0;
                    }
                }
            }
        } else {
            chicken.state = 'idle';
        }

        if (Math.random() > 0.998) {
            import('./bacteria.js').then(m => m.seedBacteria(currTX, currTY, "chicken_poop", 3, 12));
        }
    });
}