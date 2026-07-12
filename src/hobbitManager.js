// src/hobbitManager.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 
import { worldTime } from './clock.js'; 
import { plants } from './plants.js';
import { ITEM_TYPES, createItem } from './items.js';
import { getBacteriaData } from './bacteria.js';
import { plannedWells } from './cellDecorator.js'; 
import { 
    socket, 
    doorStates, 
    storeDbCache, 
    hayStorageCache, 
    chestCache, 
    myID, 
    playerWallet, 
    remotePlayers 
} from './multiplayer.js';

// Imports from divided modules
import { 
    hobbits, 
    getHobbitVillage, 
    spawnHobbit, 
    YIELD_MAP,
    HOBBIT_FOOD_VALUES
} from './hobbitCore.js';
import { 
    isWalkableForHobbit, 
    assignRandomWalk, 
    findPathToCoords, 
    findNextRoadStep, 
    findOffScreenPath 
} from './hobbitNavigation.js';
import { 
    eatFoodIfAvailable, 
    findNearestStoreCounter, 
    findHomeHayStorage, 
    findNearestMaturePlant, 
    findNearestEgg, 
    giveItemToHobbit, 
    tryHobbitTrade, 
    findMilitaryTarget, 
    estimateCatchUpStep 
} from './hobbitBehavior.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitManager.js loaded");
}

export const macroTravelers = [];

/**
 * Orchestrates the active hobbit entity lifecycle loops across Tiers 1, 2, and 3.
 */
export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    const focus = hero; // Camera focused tracking
    const heroCX = Math.floor(focus.x / 1600);
    const heroCY = Math.floor(focus.y / 1600);
    const now = Date.now();

    // ==========================================
    // ⚔️ REGIONAL HYBRID SPAWNER SYSTEM
    // ==========================================
    plannedWells.forEach(well => {
        if (well.spawnTimer === undefined) {
            well.spawnTimer = Math.random() * 10.0;
        }

        well.spawnTimer -= modifier;
        if (well.spawnTimer <= 0) {
            well.spawnTimer = 10.0; // Reset spawn timer to 10 seconds

            const wellCX = Math.floor(well.x / 100);
            const wellCY = Math.floor(well.y / 100);
            const isInsideActive = Math.abs(wellCX - heroCX) <= 1 && Math.abs(wellCY - heroCY) <= 1;

            if (isInsideActive) {
                spawnHobbit(well.x + 2, well.y + 2, null, well.x, well.y, 'Military');
            } else {
                // Find nearest opponent well for target destination
                let targetWell = null;
                let minWellDist = Infinity;
                plannedWells.forEach(otherWell => {
                    if (otherWell.x === well.x && otherWell.y === well.y) return;
                    const d = Math.hypot(otherWell.x - well.x, otherWell.y - well.y);
                    if (d < minWellDist) {
                        minWellDist = d;
                        targetWell = otherWell;
                    }
                });

                if (targetWell) {
                    const travelDist = Math.hypot(targetWell.x - well.x, targetWell.y - well.y);
                    const walkingSpeed = 1.3333; // 2 tiles per 1.5 seconds
                    const totalSecondsNeeded = travelDist / walkingSpeed;

                    macroTravelers.push({
                        id: 'macro_' + Math.random().toString(36).substr(2, 9),
                        homeX: well.x,
                        homeY: well.y,
                        targetX: targetWell.x,
                        targetY: targetWell.y,
                        startX: well.x,
                        startY: well.y,
                        elapsedSeconds: 0,
                        totalSecondsNeeded: totalSecondsNeeded > 0 ? totalSecondsNeeded : 1
                    });
                }
            }
        }
    });

    // ==========================================
    // 🌍 MACRO PROJECTION TRAVEL ENGINE (Tier 3)
    // ==========================================
    for (let i = macroTravelers.length - 1; i >= 0; i--) {
        const mt = macroTravelers[i];
        
        mt.elapsedSeconds += modifier;
        const ratio = Math.min(1.0, mt.elapsedSeconds / mt.totalSecondsNeeded);
        
        const currentTileX = mt.startX + (mt.targetX - mt.startX) * ratio;
        const currentTileY = mt.startY + (mt.targetY - mt.startY) * ratio;

        const currentCX = Math.floor(currentTileX / 100);
        const currentCY = Math.floor(currentTileY / 100);
        const enteredActiveArea = Math.abs(currentCX - heroCX) <= 1 && Math.abs(currentCY - heroCY) <= 1;

        if (enteredActiveArea) {
            spawnHobbit(
                Math.floor(currentTileX), 
                Math.floor(currentTileY), 
                null, 
                mt.homeX, 
                mt.homeY, 
                'Military'
            );
            
            const spawned = hobbits[hobbits.length - 1];
            if (spawned) {
                spawned.goal = 'march';
                spawned.state = 'walking';
                spawned.moveTimer = 0; 
                
                // Establish initial navigation path towards target
                const p = findPathToCoords(
                    Math.floor(currentTileX), 
                    Math.floor(currentTileY), 
                    mt.targetX, 
                    mt.targetY, 
                    worldMatrix, 
                    roomMatrix, 
                    spawned
                );
                if (p) spawned.path = p;
            }
            macroTravelers.splice(i, 1);
        } else if (ratio >= 1.0) {
            macroTravelers.splice(i, 1);
        }
    }

    // Clean up dead entities
    for (let i = hobbits.length - 1; i >= 0; i--) {
        const hob = hobbits[i];
        if (hob.hp <= 0) {
            hob.inventory.forEach(item => {
                import('./bacteria.js').then(m => {
                    const dropHealth = item.isKey ? item.houseId : item.health;
                    m.seedBacteria(Math.floor(hob.x / 16), Math.floor(hob.y / 16), item.seedType, dropHealth, item.virulence);
                });
            });

            import('./bacteria.js').then(m => m.seedBacteria(
                Math.floor(hob.x / 16), 
                Math.floor(hob.y / 16), 
                "raw_chicken", 50, 0
            ));

            hobbits.splice(i, 1);
            continue;
        }
    }

    // ==========================================
    // ⚙️ MAIN AI BEHAVIOR ORCHESTRATOR
    // ==========================================
    hobbits.forEach(hobbit => {
        const hobbitCX = Math.floor(hobbit.x / 1600);
        const hobbitCY = Math.floor(hobbit.y / 1600);
        const isInsideActiveChunks = Math.abs(hobbitCX - heroCX) <= 1 && Math.abs(hobbitCY - heroCY) <= 1;
        
        // Convert to macro projection when moving out of active chunks boundary
        if (!isInsideActiveChunks) {
            if (hobbit.job === 'Military') {
                let targetWell = null;
                let minWellDist = Infinity;
                plannedWells.forEach(well => {
                    if (well.x === hobbit.homeX && well.y === hobbit.homeY) return;
                    const d = Math.hypot(well.x - (hobbit.x / 16), well.y - (hobbit.y / 16));
                    if (d < minWellDist) {
                        minWellDist = d;
                        targetWell = well;
                    }
                });

                if (targetWell) {
                    const currentTX = Math.floor(hobbit.x / 16);
                    const currentTY = Math.floor(hobbit.y / 16);
                    const travelDist = Math.hypot(targetWell.x - currentTX, targetWell.y - currentTY);
                    const walkingSpeed = 1.3333;
                    const totalSecondsNeeded = travelDist / walkingSpeed;

                    macroTravelers.push({
                        id: hobbit.id,
                        homeX: hobbit.homeX || currentTX,
                        homeY: hobbit.homeY || currentTY,
                        targetX: targetWell.x,
                        targetY: targetWell.y,
                        startX: currentTX,
                        startY: currentTY,
                        elapsedSeconds: 0,
                        totalSecondsNeeded: totalSecondsNeeded > 0 ? totalSecondsNeeded : 1
                    });
                }
            }
            const physicalIndex = hobbits.indexOf(hobbit);
            if (physicalIndex !== -1) hobbits.splice(physicalIndex, 1);
            return;
        }

        if (!hobbit.lastUpdated) hobbit.lastUpdated = now;
        let deltaSeconds = (now - hobbit.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0;
        hobbit.lastUpdated = now;

        // ==========================================
        // ❄️ TIER 3: OFFLINE CATCH-UP (Anti-Clumping)
        // ==========================================
        if (deltaSeconds > 2.0) {
            let timeRemaining = Math.min(deltaSeconds, 86400); 
            let simX = Math.floor(hobbit.x / 16);
            let simY = Math.floor(hobbit.y / 16);

            while (timeRemaining > 0) {
                const stepTime = Math.min(30.0, timeRemaining);
                timeRemaining -= stepTime;
                hobbit.energy = Math.max(0, hobbit.energy - (stepTime * 0.5));

                if (hobbit.energy < 30) {
                    eatFoodIfAvailable(hobbit);
                }

                const hx = hero.x + 8;
                const hy = hero.y + 8; 
                const distToHero = Math.hypot(hx - (simX * 16 + 8), hy - (simY * 16 + 8));

                if (distToHero < 80 && hero.hp > 0) {
                    if (distToHero <= 24) {
                        hero.hp = Math.max(0, hero.hp - hobbit.ad);
                        if (socket && socket.connected) {
                            socket.emit('updateStats', { hp: hero.hp });
                        }
                    } else {
                        const hTX = Math.floor(hx / 16);
                        const hTY = Math.floor(hy / 16); 
                        const next = estimateCatchUpStep(simX, simY, hTX, hTY);
                        simX = next.x; simY = next.y;
                    }
                } else if (hobbit.job === 'Trader' && hobbit.houseId) {
                    const doorKey = `${hobbit.doorX}_${hobbit.doorY}`;
                    const doorState = doorStates.get(doorKey);
                    const isLocked = doorState ? doorState.locked : true;

                    if (!worldTime.isNight) {
                        if (isLocked && (simX !== hobbit.doorX || simY !== hobbit.doorY)) {
                            const next = estimateCatchUpStep(simX, simY, hobbit.doorX, hobbit.doorY);
                            simX = next.x; simY = next.y;
                        }
                    } else {
                        if (!isLocked && (simX !== hobbit.doorX || simY !== hobbit.doorY)) {
                            const next = estimateCatchUpStep(simX, simY, hobbit.doorX, hobbit.doorY);
                            simX = next.x; simY = next.y;
                        } else if (simX !== hobbit.homeX && simY !== hobbit.homeY) {
                            const next = estimateCatchUpStep(simX, simY, hobbit.homeX, hobbit.homeY);
                            simX = next.x; simY = next.y;
                        }
                    }
                } else if (worldTime.isNight && hobbit.houseId) {
                    if (simX !== hobbit.homeX && simY !== hobbit.homeY) {
                        const next = estimateCatchUpStep(simX, simY, hobbit.homeX, hobbit.homeY);
                        simX = next.x; simY = next.y;
                    }
                } else {
                    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
                    const valid = dirs.filter(d => isWalkableForHobbit(simX + d[0], simY + d[1], worldMatrix, roomMatrix, hobbit));
                    if (valid.length > 0) {
                        const pick = valid[Math.floor(Math.random() * valid.length)];
                        simX += pick[0]; simY += pick[1];
                    }
                }
            }

            // Scatter coordinates slightly to guarantee separation on re-entry
            let finalX = simX * 16;
            let finalY = simY * 16;
            let attempts = 0;
            while (attempts < 10) {
                const jitterX = Math.floor(Math.random() * 3 - 1) * 16;
                const jitterY = Math.floor(Math.random() * 3 - 1) * 16;
                const testTX = simX + (jitterX / 16);
                const testTY = simY + (jitterY / 16);
                if (isWalkableForHobbit(testTX, testTY, worldMatrix, roomMatrix, hobbit)) {
                    finalX = testTX * 16;
                    finalY = testTY * 16;
                    break;
                }
                attempts++;
            }

            hobbit.x = finalX;
            hobbit.y = finalY;
            hobbit.path = [];
            hobbit.state = 'idle';
            return;
        }

        const pad = 32; 
        const screenX = hobbit.x + viewport.offset[0];
        const screenY = hobbit.y + viewport.offset[1];
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
            hobbit.slowTickTimer -= modifier;
            if (hobbit.slowTickTimer <= 0) {
                hobbit.slowTickTimer = 1.5; 
                hobbit.energy = Math.max(0, hobbit.energy - 0.75);

                const currTX = Math.floor((hobbit.x + 8) / 16);
                const currTY = Math.floor((hobbit.y + 15) / 16); 

                let target = null;
                let targetDist = Infinity;
                const px = (focus.x + 8) - (hobbit.x + 8);
                const py = (focus.y + 8) - (hobbit.y + 8);
                const distToHero = Math.hypot(px, py);

                if (distToHero < 80 && hero.hp > 0) {
                    target = hero;
                    targetDist = distToHero;
                }

                if (hobbit.energy < 30) {
                    const ate = eatFoodIfAvailable(hobbit);
                    if (!ate && hobbit.houseId && hobbit.chestX !== null) {
                        const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                        const chestItems = chestCache.get(chestId) || [];
                        const foodIdx = chestItems.findIndex(i => HOBBIT_FOOD_VALUES[i.seedType] !== undefined);
                        
                        if (foodIdx !== -1) {
                            const foodItem = chestItems[foodIdx];
                            foodItem.count--;
                            if (foodItem.count <= 0) {
                                chestItems.splice(foodIdx, 1);
                            }
                            if (socket && socket.connected) {
                                socket.emit('updateChest', { chestId, items: chestItems });
                            }
                            giveItemToHobbit(hobbit, foodItem);
                            eatFoodIfAvailable(hobbit);
                        }
                    }
                }

                if (!hobbit.path || hobbit.path.length === 0) {
                    if (hobbit.job === 'Military') {
                        const homeWell = hobbit.cachedWell || getHobbitVillage(hobbit);
                        let targetWell = null;
                        let minWellDist = Infinity;

                        plannedWells.forEach(well => {
                            if (homeWell && well.x === homeWell.x && well.y === homeWell.y) return;
                            const d = Math.hypot(well.x - currTX, well.y - currTY);
                            if (d < minWellDist) {
                                minWellDist = d;
                                targetWell = well;
                            }
                        });

                        if (targetWell) {
                            const nextStep = findNextRoadStep(currTX, currTY, targetWell.x, targetWell.y, worldMatrix, roomMatrix, hobbit);
                            if (nextStep) {
                                hobbit.path = [{ x: nextStep.x, y: nextStep.y }];
                                hobbit.goal = 'march';
                                hobbit.state = 'walking';
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.goal = 'wander';
                            }
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                        }
                    }
                    else if (target && targetDist > 20) {
                        const tTX = Math.floor((target.x + 8) / 16);
                        const tTY = Math.floor((target.y + 8) / 16);
                        const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix, hobbit, 15);
                        if (path) {
                            hobbit.path = path;
                            hobbit.goal = 'engage';
                        }
                    } else if (hobbit.job === 'Trader' && hobbit.houseId) {
                        const doorKey = `${hobbit.doorX}_${hobbit.doorY}`;
                        const doorState = doorStates.get(doorKey);
                        const isLocked = doorState ? doorState.locked : true;
                        const distToDoor = Math.max(Math.abs(currTX - hobbit.doorX), Math.abs(currTY - hobbit.doorY));

                        if (!worldTime.isNight) {
                            if (distToDoor <= 1) {
                                if (socket && socket.connected) {
                                    socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: false });
                                }
                            } else {
                                const path = findOffScreenPath(currTX, currTY, hobbit.doorX, hobbit.doorY);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'unlock_door';
                                }
                            }
                        } else {
                            if (!isLocked) {
                                if (distToDoor <= 1) {
                                    if (socket && socket.connected) {
                                        socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: true });
                                    }
                                } else {
                                    const path = findOffScreenPath(currTX, currTY, hobbit.doorX, hobbit.doorY);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.goal = 'lock_door';
                                    }
                                }
                            } else {
                                if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                                    hobbit.goal = 'sleep';
                                } else {
                                    const path = findOffScreenPath(currTX, currTY, hobbit.homeX, hobbit.homeY);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.goal = 'sleep';
                                    }
                                }
                            }
                        }
                    } else if (worldTime.isNight && hobbit.houseId) {
                        if (currTX !== hobbit.homeX || currTY !== hobbit.homeY) {
                            if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                hobbit.path = [
                                    { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                    { x: hobbit.homeX, y: hobbit.homeY }
                                ];
                                hobbit.goal = 'gohome';
                            } else {
                                const path = findOffScreenPath(currTX, currTY, hobbit.doorX, hobbit.doorY);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'gohome';
                                }
                            }
                        }
                    } else if (hobbit.job === 'Forager') {
                        const nonKeyItems = hobbit.inventory.filter(item => !item.isKey);
                        const isInventoryFull = (nonKeyItems.length >= 6); 
                        const hasPM = hobbit.inventory.some(i => i.seedType === 'plant_matter');
                        const hasOtherLoot = hobbit.inventory.some(i => !i.isKey && i.seedType !== 'plant_matter');
                        
                        const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                        const chestItems = chestCache.get(chestId) || [];
                        const isChestFull = (chestItems.length >= 8);

                        const nearestPlant = findNearestMaturePlant(hobbit);
                        const hasNearbyCrops = nearestPlant || hobbit.targetPlant;
                        const shouldDeposit = isInventoryFull || ((hasOtherLoot || hasPM) && !hasNearbyCrops);

                        if (isInventoryFull && hasPM && isChestFull) {
                            const counter = findNearestStoreCounter(hobbit);
                            if (counter) {
                                const standX = counter.x;
                                const standY = counter.y + 1;
                                const path = findOffScreenPath(currTX, currTY, standX, standY);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'sell_pm';
                                }
                            }
                        }
                        else if (isChestFull && nonKeyItems.length === 0) {
                            const depositTX = hobbit.chestX + 1;
                            const depositTY = hobbit.chestY;
                            const path = findOffScreenPath(currTX, currTY, depositTX, depositTY);
                            if (path) {
                                hobbit.path = path;
                                hobbit.goal = 'withdraw_pm';
                            }
                        }
                        else if (shouldDeposit) {
                            const depositTX = hobbit.chestX + 1;
                            const depositTY = hobbit.chestY;
                            const path = findOffScreenPath(currTX, currTY, depositTX, depositTY);
                            if (path) {
                                hobbit.path = path;
                                hobbit.goal = 'deposit';
                            }
                        }
                        else {
                            const nearest = findNearestMaturePlant(hobbit);
                            if (nearest) {
                                const path = findPathToCoords(currTX, currTY, nearest.gx, nearest.gy, worldMatrix, roomMatrix, hobbit, 12);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'harvest';
                                    hobbit.targetPlant = nearest;
                                }
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.goal = 'wander';
                            }
                        }
                    } else {
                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                        hobbit.goal = 'wander';
                    }
                }

                // Teleport up to 2 tiles per tick to match standard walking speed requirements
                for (let step = 0; step < 2; step++) {
                    if (hobbit.path && hobbit.path.length > 0) {
                        const nextNode = hobbit.path.shift();
                        hobbit.x = nextNode.x * 16;
                        hobbit.y = nextNode.y * 16;

                        if (!hobbit.visitedHistory) hobbit.visitedHistory = [];
                        const tileKey = `${nextNode.x}_${nextNode.y}`;
                        if (hobbit.visitedHistory[hobbit.visitedHistory.length - 1] !== tileKey) {
                            hobbit.visitedHistory.push(tileKey);
                            if (hobbit.visitedHistory.length > 32) {
                                hobbit.visitedHistory.shift();
                            }
                        }

                        const currentDistToHero = Math.hypot((focus.x + 8) - (hobbit.x + 8), (focus.y + 8) - (hobbit.y + 8));
                        if (hobbit.goal === 'engage' && currentDistToHero <= 24) {
                            if (hero.hp > 0) {
                                hero.hp = Math.max(0, hero.hp - hobbit.ad);
                                if (socket) socket.emit('updateStats', { hp: hero.hp });
                            }
                            hobbit.path = [];
                            break;
                        }
                        else if (hobbit.goal === 'unlock_door' && hobbit.x === hobbit.doorX * 16 && hobbit.y === hobbit.doorY * 16) {
                            if (socket && socket.connected) {
                                socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: false });
                            }
                            hobbit.path = [];
                            break;
                        }
                        else if (hobbit.goal === 'lock_door' && hobbit.x === hobbit.doorX * 16 && hobbit.y === hobbit.doorY * 16) {
                            if (socket && socket.connected) {
                                socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: true });
                            }
                            hobbit.path = [];
                            break;
                        }
                        else if (hobbit.goal === 'deposit' && hobbit.x === hobbit.chestX * 16 && hobbit.y === hobbit.chestY * 16) {
                            hobbit.inventory = hobbit.inventory.filter(i => i.isKey);
                            hobbit.path = [];
                            break;
                        }
                    }
                }
            }
            return; 
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time)
        // ==========================================
        hobbit.energy = Math.max(0, hobbit.energy - (modifier * 0.5));
        const currTX = Math.floor((hobbit.x + 8) / 16);
        const currTY = Math.floor((hobbit.y + 15) / 16); 
        
        const lx = ((currTX % 100) + 100) % 100;
        const ly = ((currTY % 100) + 100) % 100;
        const pCol = roomMatrix[Math.floor(currTX / 100)]?.[Math.floor(currTY / 100)];
        const roomID = pCol ? pCol[ly * 100 + lx] : 0;

        if (hobbit.cachedWell === undefined) {
            hobbit.cachedWell = getHobbitVillage(hobbit);
        }
        const village = hobbit.cachedWell;
        let villageOwner = null;

        if (village && typeof window !== 'undefined' && window.villageOwners) {
            const data = window.villageOwners.get(`${village.x}_${village.y}`);
            if (data) villageOwner = data.owner;
        }

        let enemyTarget = null; 
        let enemyDist = Infinity;

        // ==========================================
        // ⚔️ MILITARY JOB STATE MACHINE
        // ==========================================
        if (hobbit.job === 'Military') {
            if (hobbit.goal === 'wander' && hobbit.moveTimer > 0) {
                hobbit.moveTimer -= modifier;
                if (hobbit.moveTimer <= 0) {
                    hobbit.goal = 'march';
                    hobbit.path = [];
                    hobbit.state = 'idle';
                }
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                    hobbit.state = 'idle';
                }
            } 
            else {
                const homeWell = hobbit.cachedWell || getHobbitVillage(hobbit);
                let myWellOwner = null;

                if (homeWell && window.villageOwners) {
                    const data = window.villageOwners.get(`${homeWell.x}_${homeWell.y}`);
                    if (data) myWellOwner = data.owner;
                }

                const aggroResult = findMilitaryTarget(hobbit, homeWell, myWellOwner);
                const nearestEnemy = aggroResult.target;
                const nearestEnemyDist = aggroResult.dist;

                if (nearestEnemy) {
                    hobbit.goal = 'attack_enemy';
                    hobbit.attackTarget = nearestEnemy; 
                    
                    if (nearestEnemyDist <= 24) {
                        if (hobbit.state !== 'attacking') {
                            hobbit.state = 'idle';
                            hobbit.path = [];
                        }
                        if (hobbit.attackTimer <= 0 && hobbit.state !== 'attacking') {
                            hobbit.state = 'attacking';
                            hobbit.attackTimer = 0.5;
                            hobbit.hasStruck = false; 
                            const tdx = nearestEnemy.x - hobbit.x;
                            const tdy = nearestEnemy.y - hobbit.y;
                            hobbit.dir = Math.abs(tdx) > Math.abs(tdy) ? (tdx > 0 ? 'East' : 'West') : (tdy > 0 ? 'South' : 'North');
                        }
                    } else if (hobbit.pathTimer <= 0) {
                        hobbit.pathTimer = 0.4 + Math.random() * 0.4;
                        const enemyTX = Math.floor((nearestEnemy.x + 8) / 16);
                        const enemyTY = Math.floor((nearestEnemy.y + 8) / 16);
                        const path = findPathToCoords(currTX, currTY, enemyTX, enemyTY, worldMatrix, roomMatrix, hobbit, 15);
                        if (path) {
                            hobbit.path = path;
                            hobbit.state = 'walking';
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                            hobbit.moveTimer = 3.0;
                        }
                    }
                } else {
                    hobbit.goal = 'march';
                    hobbit.attackTarget = null;
                    
                    let targetWell = null;
                    let minWellDist = Infinity;

                    plannedWells.forEach(well => {
                        if (homeWell && well.x === homeWell.x && well.y === homeWell.y) return;
                        const d = Math.hypot(well.x - currTX, well.y - currTY);
                        if (d < minWellDist) {
                            minWellDist = d;
                            targetWell = well;
                        }
                    });

                    if (targetWell) {
                        if (Math.abs(currTX - targetWell.x) <= 2 && Math.abs(currTY - targetWell.y) <= 2) {
                            hobbit.state = 'idle';
                            hobbit.path = [];
                        } else if (!hobbit.path || hobbit.path.length === 0) {
                            const nextStep = findNextRoadStep(currTX, currTY, targetWell.x, targetWell.y, worldMatrix, roomMatrix, hobbit);
                            if (nextStep) {
                                hobbit.path = [{ x: nextStep.x, y: nextStep.y }];
                                hobbit.state = 'walking';
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.goal = 'wander';
                                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                hobbit.moveTimer = 3.0;
                            }
                        }
                    } else {
                        if (!hobbit.path || hobbit.path.length === 0) {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                            hobbit.moveTimer = 3.0;
                        }
                    }
                }
            }
        }

        // ==========================================
        // 🏛️ PEACEFUL & DEFENDER JOB STATE MACHINES
        // ==========================================
        else {
            let isDefending = false;
            let criminals = null;
            if (village && typeof window !== 'undefined' && window.villageCriminals) {
                criminals = window.villageCriminals.get(`${village.x}_${village.y}`);
            }

            if (criminals && criminals.size > 0 && villageOwner) {
                const px = (focus.x + 8) - (hobbit.x + 8);
                const py = (focus.y + 8) - (hobbit.y + 8);
                const distToHero = Math.hypot(px, py);

                if (criminals.has(myID) && hero.hp > 0 && distToHero < 2400) {
                    enemyTarget = hero;
                    enemyDist = distToHero;
                }

                if (!enemyTarget && remotePlayers) {
                    remotePlayers.forEach((p, id) => {
                        if (p.hp <= 0) return;
                        if (criminals.has(id)) {
                            const dist = Math.hypot((p.x + 8) - (hobbit.x + 8), (p.y + 8) - (hobbit.y + 8));
                            if (dist < 2400 && dist < enemyDist) {
                                enemyDist = dist;
                                enemyTarget = p;
                            }
                        }
                    });
                }

                if (enemyTarget) {
                    isDefending = true;
                    hobbit.goal = 'defend_home';
                    
                    if (enemyDist <= 24) {
                        if (hobbit.state !== 'attacking') {
                            hobbit.state = 'idle';
                            hobbit.path = [];
                        }
                        if (hobbit.attackTimer <= 0 && hobbit.state !== 'attacking') {
                            hobbit.state = 'attacking';
                            hobbit.attackTimer = 0.5;
                            hobbit.hasStruck = false; 
                            const tdx = enemyTarget.x - hobbit.x;
                            const tdy = enemyTarget.y - hobbit.y;
                            hobbit.dir = Math.abs(tdx) > Math.abs(tdy) ? (tdx > 0 ? 'East' : 'West') : (tdy > 0 ? 'South' : 'North');
                        }
                    } else if (hobbit.pathTimer <= 0) {
                        hobbit.pathTimer = 1.0 + Math.random() * 1.5;
                        const tTX = Math.floor((enemyTarget.x + 8) / 16);
                        const tTY = Math.floor((enemyTarget.y + 8) / 16);
                        const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix, hobbit, 15); 
                        if (path) {
                            hobbit.path = path;
                            hobbit.state = 'walking';
                        } else {
                            const dx = tTX - currTX;
                            const dy = tTY - currTY;
                            const stepX = dx !== 0 ? Math.sign(dx) : 0;
                            const stepY = dy !== 0 ? Math.sign(dy) : 0;
                            if (isWalkableForHobbit(currTX + stepX, currTY + stepY, worldMatrix, roomMatrix, hobbit)) {
                                hobbit.path = [{ x: currTX + stepX, y: currTY + stepY }];
                                hobbit.state = 'walking';
                            }
                        }
                    }
                }
            }

            if (!isDefending) {
                let target = null;
                let targetDist = Infinity;

                const px = (focus.x + 8) - (hobbit.x + 8);
                const py = (focus.y + 8) - (hobbit.y + 8);
                const distToHero = Math.hypot(px, py);
                const isOwner = (villageOwner === playerWallet);

                if (distToHero < 80 && hero.hp > 0 && !isOwner) {
                    target = hero;
                    targetDist = distToHero;
                }

                if (target && targetDist <= 20) {
                    hobbit.goal = 'engage';
                    if (hobbit.state !== 'attacking') {
                        hobbit.state = 'attacking';
                        hobbit.frame = 0;
                        hobbit.animTimer = 0;
                        hobbit.attackTimer = 0.5; 
                        hobbit.hasStruck = false; 
                        hobbit.path = []; 
                        
                        const tdx = target.x - hobbit.x;
                        const tdy = target.y - hobbit.y;
                        hobbit.dir = Math.abs(tdx) > Math.abs(tdy) ? (tdx > 0 ? 'East' : 'West') : (tdy > 0 ? 'South' : 'North');
                    }
                } 
                else if (target && targetDist > 20) {
                    hobbit.goal = 'engage';
                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                        hobbit.pathTimer = 1.5 + Math.random() * 1.5; 
                        const tTX = Math.floor((target.x + 8) / 16);
                        const tTY = Math.floor((target.y + 8) / 16);
                        const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix, hobbit, 15);
                        if (path) {
                            hobbit.path = path;
                            hobbit.goal = 'engage';
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                        }
                    }
                } 
                else if (hobbit.energy < 30) {
                    const ate = eatFoodIfAvailable(hobbit);
                    if (!ate && hobbit.houseId && hobbit.chestX !== null) {
                        const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                        const chestItems = chestCache.get(chestId) || [];
                        const foodIdx = chestItems.findIndex(i => HOBBIT_FOOD_VALUES[i.seedType] !== undefined);
                        if (foodIdx !== -1) {
                            const foodItem = chestItems[foodIdx];
                            foodItem.count--;
                            if (foodItem.count <= 0) {
                                chestItems.splice(foodIdx, 1);
                            }
                            if (socket && socket.connected) {
                                socket.emit('updateChest', { chestId, items: chestItems });
                            }
                            giveItemToHobbit(hobbit, foodItem);
                            eatFoodIfAvailable(hobbit);
                        } else {
                            const nearest = findNearestMaturePlant(hobbit);
                            if (nearest) {
                                hobbit.goal = 'harvest_food';
                                hobbit.targetPlant = nearest;
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.goal = 'wander';
                                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                            }
                        }
                    } else {
                        const nearest = findNearestMaturePlant(hobbit);
                        if (nearest) {
                            hobbit.goal = 'harvest_food';
                            hobbit.targetPlant = nearest;
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                        }
                    }
                }
                else if (hobbit.goal === 'harvest_food') {
                    if (hobbit.targetPlant) {
                        const plantKey = `${hobbit.targetPlant.gx}_${hobbit.targetPlant.gy}`;
                        const livePlant = plants.get(plantKey);
                        if (livePlant && livePlant.growth >= 100) {
                            const dist = Math.hypot((livePlant.gx * 16 + 8) - (hobbit.x + 8), (livePlant.gy * 16 + 8) - (hobbit.y + 8));
                            if (dist <= 24) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                                const keyName = YIELD_MAP[livePlant.type];
                                if (keyName && ITEM_TYPES[keyName]) {
                                    const harvestedItem = createItem(ITEM_TYPES[keyName]);
                                    giveItemToHobbit(hobbit, harvestedItem);
                                }
                                plants.delete(plantKey);
                                if (socket && socket.connected) {
                                    socket.emit('syncTile', { gx: livePlant.gx, gy: livePlant.gy, traits: 0 });
                                }
                                hobbit.targetPlant = null;
                                hobbit.goal = 'wander';
                                eatFoodIfAvailable(hobbit); 
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, livePlant.gx, livePlant.gy, worldMatrix, roomMatrix, hobbit, 12); 
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        hobbit.targetPlant = null;
                                        hobbit.goal = 'wander';
                                    }
                                }
                            }
                        } else {
                            hobbit.targetPlant = null;
                            hobbit.goal = 'wander';
                        }
                    } else {
                        hobbit.goal = 'wander';
                    }
                }
                else if (hobbit.job === 'Trader' && hobbit.houseId) {
                    const doorKey = `${hobbit.doorX}_${hobbit.doorY}`;
                    const doorState = doorStates.get(doorKey);
                    const isLocked = doorState ? doorState.locked : true;
                    const distToDoor = Math.max(Math.abs(currTX - hobbit.doorX), Math.abs(currTY - hobbit.doorY));

                    if (!worldTime.isNight) {
                        if (isLocked) {
                            hobbit.goal = 'unlock_door';
                            if (distToDoor <= 1) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                                if (socket && socket.connected) {
                                    socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: false });
                                }
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit, 40);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        } else {
                            hobbit.goal = 'wander';
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                hobbit.moveTimer -= modifier;
                                if (hobbit.moveTimer <= 0) {
                                    assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                    hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    hobbit.moveTimer = 2 + Math.random() * 3;
                                }
                            }
                        }
                    } else {
                        if (!isLocked) {
                            hobbit.goal = 'lock_door';
                            if (distToDoor <= 1) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                                if (socket && socket.connected) {
                                    socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: true });
                                }
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit, 40);
                                    if (path) {
                                        hobbit.state = 'walking';
                                        hobbit.path = path;
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        } else {
                            hobbit.goal = 'sleep';
                            if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit, 40);
                                    if (path) {
                                        hobbit.state = 'walking';
                                        hobbit.path = path;
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        }
                    }
                }
                else if (hobbit.job === 'Farmer' && hobbit.houseId) {
                    const hasEggs = hobbit.inventory.some(item => item.seedType === 'egg');
                    const hasPM = hobbit.inventory.some(item => item.seedType === 'plant_matter');

                    if (hasEggs) {
                        hobbit.goal = 'sell_food';
                        const counter = findNearestStoreCounter(hobbit);
                        if (counter) {
                            const storeId = getTileData(counter.x * 16 + 8, counter.y * 16 + 8, worldMatrix, roomMatrix).roomID;
                            const storeDoorX = counter.x - 1;
                            const storeDoorY = counter.y + 2;
                            const standX = counter.x;
                            const standY = counter.y + 1;
                            const storeDataId = `store_${counter.x}_${counter.y}`;
                            
                            if (!storeDbCache.has(storeDataId) && socket && socket.connected) {
                                socket.emit('requestStore', storeDataId);
                            }

                            if (roomID === storeId) {
                                const dist = Math.hypot((standX * 16 + 8) - (hobbit.x + 8), (standY * 16 + 8) - (hobbit.y + 8));
                                if (dist <= 24) {
                                    hobbit.state = 'idle';
                                    hobbit.path = [];
                                    
                                    if (hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 2.0; 
                                        if (socket && socket.connected) socket.emit('requestStore', storeDataId);
                                    }
                                    tryHobbitTrade(hobbit, counter.x, counter.y);
                                } else {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                        const path = findPathToCoords(currTX, currTY, standX, standY, worldMatrix, roomMatrix, hobbit, 40);
                                        if (path) {
                                            hobbit.path = path;
                                            hobbit.state = 'walking';
                                        } else {
                                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                            hobbit.goal = 'wander';
                                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                        }
                                    }
                                }
                            } 
                            else if (currTX === storeDoorX && currTY === storeDoorY) {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                    hobbit.path = [
                                        { x: storeDoorX, y: storeDoorY - 1 },
                                        { x: standX, y: standY }
                                    ];
                                    hobbit.state = 'walking';
                                }
                            } 
                            else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, storeDoorX, storeDoorY, worldMatrix, roomMatrix, hobbit, 60);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        }
                    }
                    else if (hasPM) {
                        hobbit.goal = 'deposit_pm';
                        const storage = findHomeHayStorage(hobbit);

                        if (storage) {
                            const depositTX = storage.x;
                            const depositTY = storage.y;

                            if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                    hobbit.path = [
                                        { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                        { x: hobbit.homeX, y: hobbit.homeY }
                                    ];
                                    hobbit.state = 'walking';
                                }
                            }
                            else if (roomID === hobbit.houseId) {
                                const dist = Math.hypot((depositTX * 16 + 8) - (hobbit.x + 8), (depositTY * 16 + 8) - (hobbit.y + 8));
                                if (dist <= 24) {
                                    hobbit.state = 'idle';
                                    hobbit.path = [];

                                    const storageId = `hay_${depositTX}_${depositTY}`;
                                    if (!hayStorageCache.has(storageId)) {
                                        if (socket && socket.connected) socket.emit('requestHayStorage', storageId);
                                    } else {
                                        const hayItems = hayStorageCache.get(storageId) || [];
                                        const pmItem = hobbit.inventory.find(i => i.seedType === 'plant_matter');

                                        if (pmItem) {
                                            const existing = hayItems.find(i => i.seedType === 'plant_matter' && i.count < (i.maxStack || 64));
                                            if (existing) {
                                                existing.count += pmItem.count;
                                                hobbit.inventory = hobbit.inventory.filter(i => i !== pmItem);
                                            } else {
                                                if (hayItems.length < 8) {
                                                    hayItems.push(pmItem);
                                                    hobbit.inventory = hobbit.inventory.filter(i => i !== pmItem);
                                                }
                                            }
                                        }
                                        if (socket && socket.connected) {
                                            socket.emit('updateHayStorage', { hayStorageId: storageId, items: hayItems });
                                        }
                                    }
                                } else {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                        const path = findPathToCoords(currTX, currTY, depositTX, depositTY, worldMatrix, roomMatrix, hobbit, 30);
                                        if (path) {
                                            hobbit.path = path;
                                            hobbit.state = 'walking';
                                        } else {
                                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                            hobbit.goal = 'wander';
                                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                        }
                                    }
                                }
                            } 
                            else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit, 50);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        }
                    }
                    else {
                        const egg = findNearestEgg(hobbit);
                        if (egg) {
                            hobbit.goal = 'collect_egg';
                            const dist = Math.hypot((egg.gx * 16 + 8) - (hobbit.x + 8), (egg.gy * 16 + 8) - (hobbit.y + 8));
                            if (dist <= 24) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                                const eggItem = createItem(ITEM_TYPES.EGG);
                                giveItemToHobbit(hobbit, eggItem); 
                                
                                const { data: chunkData, idx } = getBacteriaData(egg.gx, egg.gy);
                                if (chunkData) chunkData[idx] = 0;
                                if (socket && socket.connected) {
                                    socket.emit('syncTile', { gx: egg.gx, gy: egg.gy, traits: 0 });
                                }
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 2.0;
                                    const path = findPathToCoords(currTX, currTY, egg.gx, egg.gy, worldMatrix, roomMatrix, hobbit, 30);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        } else {
                            hobbit.goal = 'wait_at_barn';
                            if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                            } else {
                                if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                        hobbit.path = [
                                            { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                            { x: hobbit.homeX, y: hobbit.homeY }
                                        ];
                                        hobbit.state = 'walking';
                                    }
                                } else if (roomID === hobbit.houseId) {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                        const path = findPathToCoords(currTX, currTY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit, 40);
                                        if (path) {
                                            hobbit.path = path;
                                            hobbit.state = 'walking';
                                        } else {
                                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                            hobbit.goal = 'wander';
                                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                        }
                                    }
                                } else {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                        const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit, 40);
                                        if (path) {
                                            hobbit.path = path;
                                            hobbit.state = 'walking';
                                        } else {
                                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                            hobbit.goal = 'wander';
                                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                else if (worldTime.isNight && hobbit.houseId) {
                    hobbit.goal = 'gohome';
                    if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                        hobbit.state = 'idle';
                        hobbit.path = [];
                    } 
                    else if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                        if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                            hobbit.path = [
                                { x: hobbit.doorX, y: hobbit.doorY - 1 }, 
                                { x: hobbit.homeX, y: hobbit.homeY }      
                            ];
                            hobbit.state = 'walking';
                        }
                    } 
                    else {
                        if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                            hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                            const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit, 40);
                            if (path) {
                                hobbit.path = path;
                                hobbit.state = 'walking';
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.goal = 'wander';
                                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                            }
                        }
                    }
                }
                else {
                    if (hobbit.job === 'Forager') {
                        const nonKeyItems = hobbit.inventory.filter(i => !i.isKey);
                        const isInventoryFull = (nonKeyItems.length >= 6); 
                        const hasPM = hobbit.inventory.some(i => i.seedType === 'plant_matter');
                        const hasOtherLoot = hobbit.inventory.some(i => !i.isKey && i.seedType !== 'plant_matter');
                        
                        const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                        const chestItems = chestCache.get(chestId) || [];
                        const isChestFull = (chestItems.length >= 8);

                        const nearestPlant = findNearestMaturePlant(hobbit);
                        const hasNearbyCrops = nearestPlant || hobbit.targetPlant;
                        const shouldDeposit = isInventoryFull || ((hasOtherLoot || hasPM) && !hasNearbyCrops);

                        if (isInventoryFull && hasPM && isChestFull) {
                            hobbit.goal = 'sell_pm';
                            const counter = findNearestStoreCounter(hobbit);
                            if (counter) {
                                const storeId = getTileData(counter.x * 16 + 8, counter.y * 16 + 8, worldMatrix, roomMatrix).roomID;
                                const storeDoorX = counter.x - 1;
                                const storeDoorY = counter.y + 2;
                                const standX = counter.x;
                                const standY = counter.y + 1;
                                const storeDataId = `store_${counter.x}_${counter.y}`;
                                
                                if (!storeDbCache.has(storeDataId) && socket && socket.connected) {
                                    socket.emit('requestStore', storeDataId);
                                }

                                if (roomID === storeId) {
                                    const dist = Math.hypot((standX * 16 + 8) - (hobbit.x + 8), (standY * 16 + 8) - (hobbit.y + 8));
                                    if (dist <= 24) {
                                        hobbit.state = 'idle';
                                        hobbit.path = [];
                                        if (hobbit.pathTimer <= 0) {
                                            hobbit.pathTimer = 2.0;
                                            if (socket && socket.connected) socket.emit('requestStore', storeDataId);
                                        }
                                        tryHobbitTrade(hobbit, counter.x, counter.y);
                                    } else {
                                        if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                            hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                            const path = findPathToCoords(currTX, currTY, standX, standY, worldMatrix, roomMatrix, hobbit, 40);
                                            if (path) {
                                                hobbit.path = path;
                                                hobbit.state = 'walking';
                                            } else {
                                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                                hobbit.goal = 'wander';
                                                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                            }
                                        }
                                    }
                                } 
                                else if (currTX === storeDoorX && currTY === storeDoorY) {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                        hobbit.path = [
                                            { x: storeDoorX, y: storeDoorY - 1 },
                                            { x: standX, y: standY }
                                        ];
                                        hobbit.state = 'walking';
                                    }
                                } 
                                else {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                        const path = findPathToCoords(currTX, currTY, storeDoorX, storeDoorY, worldMatrix, roomMatrix, hobbit, 60);
                                        if (path) {
                                            hobbit.path = path;
                                            hobbit.state = 'walking';
                                        } else {
                                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                            hobbit.goal = 'wander';
                                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                        }
                                    }
                                }
                            }
                        }
                        else if (isChestFull && nonKeyItems.length === 0) {
                            hobbit.goal = 'withdraw_pm';
                            const depositTX = hobbit.chestX + 1;
                            const depositTY = hobbit.chestY;

                            if (currTX === depositTX && currTY === depositTY) {
                                hobbit.state = 'idle';
                                hobbit.path = [];

                                if (!chestCache.has(chestId)) {
                                    if (socket && socket.connected) socket.emit('requestChest', chestId);
                                } else {
                                    const pmIdx = chestItems.findIndex(i => i.seedType === 'plant_matter');
                                    if (pmIdx !== -1) {
                                        const pmItemInChest = chestItems[pmIdx];
                                        const amountToWithdraw = Math.min(4, pmItemInChest.count || 1);
                                        pmItemInChest.count -= amountToWithdraw;
                                        if (pmItemInChest.count <= 0) {
                                            chestItems.splice(pmIdx, 1);
                                        }
                                        if (socket && socket.connected) {
                                            socket.emit('updateChest', { chestId, items: chestItems });
                                        }

                                        const keys = hobbit.inventory.filter(i => i.isKey);
                                        const pmItemForHobbit = createItem(ITEM_TYPES.PLANT_MATTER);
                                        pmItemForHobbit.count = amountToWithdraw;
                                        hobbit.inventory = [...keys, pmItemForHobbit];
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, depositTX, depositTY, worldMatrix, roomMatrix, hobbit);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        }
                        else if (shouldDeposit) {
                            hobbit.goal = 'deposit';
                            const depositTX = hobbit.chestX + 1;
                            const depositTY = hobbit.chestY;

                            if (currTX === depositTX && currTY === depositTY) {
                                hobbit.state = 'idle';
                                hobbit.path = [];

                                const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                                if (!chestCache.has(chestId)) {
                                    if (socket && socket.connected) socket.emit('requestChest', chestId);
                                } else {
                                    const chestItems = chestCache.get(chestId) || [];
                                    const depositItems = hobbit.inventory.filter(item => !item.isKey);

                                    depositItems.forEach(dep => {
                                        const existing = chestItems.find(i => i.seedType === dep.seedType && i.count < (i.maxStack || 8));
                                        if (existing) {
                                            const space = (existing.maxStack || 8) - existing.count;
                                            if (dep.count <= space) {
                                                existing.count += dep.count;
                                                hobbit.inventory = hobbit.inventory.filter(i => i !== dep);
                                            } else {
                                                existing.count = existing.maxStack || 8;
                                                dep.count -= space; 
                                            }
                                        } else {
                                            if (chestItems.length < 8) {
                                                chestItems.push(dep);
                                                hobbit.inventory = hobbit.inventory.filter(i => i !== dep);
                                            }
                                        }
                                    });

                                    if (socket && socket.connected) {
                                        socket.emit('updateChest', { chestId, items: chestItems });
                                    }
                                }
                            }
                            else if (roomID === hobbit.houseId) {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, depositTX, depositTY, worldMatrix, roomMatrix, hobbit, 30);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                            else if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                    hobbit.path = [
                                        { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                        { x: hobbit.homeX, y: hobbit.homeY }
                                    ];
                                    hobbit.state = 'walking';
                                }
                            }
                            else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit, 40);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            }
                        }
                        else {
                            if (hobbit.goal === 'wander' && hobbit.moveTimer > 0) {
                                hobbit.moveTimer -= modifier;
                                if (hobbit.moveTimer <= 0) hobbit.goal = 'harvest'; 
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                    hobbit.state = 'idle';
                                }
                            } else {
                                hobbit.goal = 'harvest';

                                if (roomID !== 0 && roomID !== 9999) {
                                    if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                        const doorInX = hobbit.doorX;
                                        const doorInY = hobbit.doorY - 1; 

                                        if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                            hobbit.path = [{ x: hobbit.doorX, y: hobbit.doorY + 1 }];
                                            hobbit.state = 'walking';
                                        }
                                        else if (currTX === doorInX && currTY === doorInY) {
                                            hobbit.path = [{ x: hobbit.doorX, y: hobbit.doorY }];
                                            hobbit.state = 'walking';
                                        } else {
                                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                                hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                                const path = findPathToCoords(currTX, currTY, doorInX, doorInY, worldMatrix, roomMatrix, hobbit, 12); 
                                                if (path) {
                                                    hobbit.path = path;
                                                    hobbit.state = 'walking';
                                                } else {
                                                    assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                                    hobbit.goal = 'wander';
                                                    hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                                }
                                            }
                                        }
                                    }
                                }
                                else {
                                    if (hobbit.targetPlant) {
                                        const plantKey = `${hobbit.targetPlant.gx}_${hobbit.targetPlant.gy}`;
                                        const livePlant = plants.get(plantKey);

                                        if (livePlant && livePlant.growth >= 100) {
                                            const dist = Math.hypot((livePlant.gx * 16 + 8) - (hobbit.x + 8), (livePlant.gy * 16 + 8) - (hobbit.y + 8));

                                            if (dist <= 24) {
                                                const keyName = YIELD_MAP[livePlant.type];
                                                if (keyName && ITEM_TYPES[keyName]) {
                                                    const harvestedItem = createItem(ITEM_TYPES[keyName]);
                                                    giveItemToHobbit(hobbit, harvestedItem); 
                                                }

                                                const seedKey = `${livePlant.type.toUpperCase()}_SEED`;
                                                if (ITEM_TYPES[seedKey] && Math.random() < 0.6) {
                                                    const seedItem = createItem(ITEM_TYPES[seedKey]);
                                                    giveItemToHobbit(hobbit, seedItem); 
                                                }

                                                plants.delete(plantKey);
                                                if (socket && socket.connected) {
                                                    socket.emit('syncTile', { gx: livePlant.gx, gy: livePlant.gy, traits: 0 });
                                                }

                                                hobbit.targetPlant = null;
                                                hobbit.path = [];
                                                hobbit.state = 'idle';
                                            } else {
                                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5;
                                                    const path = findPathToCoords(currTX, currTY, livePlant.gx, livePlant.gy, worldMatrix, roomMatrix, hobbit, 12); 
                                                    if (path) {
                                                        hobbit.path = path;
                                                        hobbit.state = 'walking';
                                                    } else {
                                                        hobbit.targetPlant = null; 
                                                    }
                                                }
                                            }
                                        } else {
                                            hobbit.targetPlant = null; 
                                        }
                                    } else {
                                        const nearest = findNearestMaturePlant(hobbit);
                                        if (nearest) {
                                            hobbit.targetPlant = nearest;
                                        } else {
                                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                            hobbit.goal = 'wander';
                                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                            hobbit.moveTimer = 2.0 + Math.random() * 2.0; 
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else {
                        hobbit.goal = 'wander';
                        if (roomID !== 0 && roomID !== 9999) {
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                const doorInX = hobbit.doorX;
                                const doorInY = hobbit.doorY - 2;

                                if (currTX === doorInX && currTY === doorInY) {
                                    hobbit.path = [
                                        { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                        { x: hobbit.doorX, y: hobbit.doorY }
                                    ];
                                } else {
                                    const path = findPathToCoords(currTX, currTY, doorInX, doorInY, worldMatrix, roomMatrix, hobbit, 30);
                                    if (path) hobbit.path = path;
                                }
                                hobbit.state = 'walking';
                            }
                        }
                        else {
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                hobbit.moveTimer -= modifier;
                                if (hobbit.moveTimer <= 0) {
                                    assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                    hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    hobbit.moveTimer = 2 + Math.random() * 3;
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // 🏃 MOTOR EXECUTION & STEERING ENFORCEMENT
        // ==========================================
        if (hobbit.state === 'attacking') {
            if (hobbit.attackTimer <= 0.25 && !hobbit.hasStruck) {
                hobbit.hasStruck = true;
                let currentEnemy = null;
                if (hobbit.job === 'Military' && hobbit.attackTarget) {
                    currentEnemy = hobbit.attackTarget;
                } else if (hobbit.goal === 'defend_home' && enemyTarget) {
                    currentEnemy = enemyTarget;
                } else {
                    currentEnemy = hero;
                }

                if (currentEnemy && currentEnemy.hp > 0) {
                    const hx = currentEnemy.x + 8;
                    const pyVal = currentEnemy.y + 8;
                    const hdist = Math.hypot(hx - (hobbit.x + 8), pyVal - (hobbit.y + 8));

                    if (hdist <= 32) { 
                        currentEnemy.hp = Math.max(0, currentEnemy.hp - hobbit.ad);
                        if (currentEnemy === hero && socket) {
                            socket.emit('updateStats', { hp: hero.hp });
                        }
                    }
                }
            }
            
            hobbit.frame = 0; 
            if (hobbit.attackTimer <= 0) {
                hobbit.state = 'idle';
                hobbit.moveTimer = 1.0; 
            }
        }
        else if (hobbit.path && hobbit.path.length > 0) {
            hobbit.state = 'walking';

            const nextNode = hobbit.path[0];
            const targetX = nextNode.x * 16;
            const targetY = nextNode.y * 16;

            const dx = targetX - hobbit.x;
            const dy = targetY - hobbit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const angle = Math.atan2(dy, dx);
            let positiveAngle = angle < 0 ? angle + Math.PI * 2 : angle;
            const octant = Math.round(8 * positiveAngle / (Math.PI * 2)) % 8;
            const directions = ['East', 'SouthEast', 'South', 'SouthWest', 'West', 'NorthWest', 'North', 'NorthEast'];
            
            hobbit.dir = directions[octant] || 'South';

            if (dist > 2) {
                // separation forces to prevent overlapping
                let separationX = 0;
                let separationY = 0;
                const separationRadius = 12; 
                const separationForce = 15;  

                hobbits.forEach(other => {
                    if (other.id === hobbit.id || other.hp <= 0) return;
                    const hdx = hobbit.x - other.x;
                    const hdy = hobbit.y - other.y;
                    const separationDist = Math.hypot(hdx, hdy);
                    if (separationDist < separationRadius && separationDist > 0) {
                        separationX += (hdx / separationDist) * separationForce;
                        separationY += (hdy / separationDist) * separationForce;
                    }
                });

                const moveX = ((dx / dist) * hobbit.speed + separationX) * modifier;
                const moveY = ((dy / dist) * hobbit.speed + separationY) * modifier;

                moveEntity(hobbit, moveX, moveY, worldMatrix, roomMatrix);
            } else {
                hobbit.x = targetX;
                hobbit.y = targetY;

                if (!hobbit.visitedHistory) hobbit.visitedHistory = [];
                const tileKey = `${nextNode.x}_${nextNode.y}`;
                if (hobbit.visitedHistory[hobbit.visitedHistory.length - 1] !== tileKey) {
                    hobbit.visitedHistory.push(tileKey);
                    if (hobbit.visitedHistory.length > 32) hobbit.visitedHistory.shift();
                }
                hobbit.path.shift(); 
            }

            hobbit.animTimer += modifier * 8;
            hobbit.frame = Math.floor(hobbit.animTimer) % 4; 
        } else {
            // Idle static resolution slide
            let separationX = 0;
            let separationY = 0;
            const separationRadius = 10;
            const separationForce = 12;

            hobbits.forEach(other => {
                if (other.id === hobbit.id || other.hp <= 0) return;
                const hdx = hobbit.x - other.x;
                const hdy = hobbit.y - other.y;
                const separationDist = Math.hypot(hdx, hdy);
                if (separationDist < separationRadius && separationDist > 0) {
                    separationX += (hdx / separationDist) * separationForce;
                    separationY += (hdy / separationDist) * separationForce;
                }
            });

            if (separationX !== 0 || separationY !== 0) {
                moveEntity(hobbit, separationX * modifier, separationY * modifier, worldMatrix, roomMatrix);
            }
            hobbit.state = 'idle';
        }

        if (hobbit.pathTimer > 0) hobbit.pathTimer -= modifier;
        if (hobbit.attackTimer > 0) hobbit.attackTimer -= modifier;
    });
}