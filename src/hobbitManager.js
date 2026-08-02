// src/hobbitManager.js

import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero, getFocusCoordinates } from './entities.js'; 
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
    estimateCatchUpStep,
    runForagerBehavior,
    runTraderBehavior,
    runUsherBehavior
} from './hobbitBehavior.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitManager.js loaded");
}

export let minionSpawnTimer = 10.0;
export const macroTravelers = [];

/**
 * Handles the instantiation of a complete squad with a Sergeant and followers.
 */
export function spawnSquad(gx, gy, homeX, homeY) {
    const squadId = 'squad_' + Math.random().toString(36).substr(2, 9);
    
    // 1. Spawn 1 Sergeant (Leader)
    spawnHobbit(gx, gy, null, homeX, homeY, 'Military');
    const sergeant = hobbits[hobbits.length - 1];
    if (sergeant) {
        sergeant.squadId = squadId;
        sergeant.squadRole = 'Sergeant';
        sergeant.name = "[Sergeant] " + sergeant.name;
        sergeant.hp = 60; 
        sergeant.maxHp = 60;
        sergeant.speed = 38; 
    }

    // 2. Spawn 4 Military Followers with slight offsets
    const offsets = [
        { dx: -1, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: -2, dy: 2 },
        { dx: 2, dy: 2 }
    ];

    offsets.forEach(offset => {
        spawnHobbit(gx + offset.dx, gy + offset.dy, null, homeX, homeY, 'Military');
        const follower = hobbits[hobbits.length - 1];
        if (follower) {
            follower.squadId = squadId;
            follower.squadRole = 'Military';
        }
    });
}

/**
 * Orchestrates the active hobbit entity lifecycle loops across Tiers 1, 2, and 3.
 */
export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    const focus = getFocusCoordinates(); 
    const heroCX = Math.floor(focus.x / 1600);
    const heroCY = Math.floor(focus.y / 1600);
    const now = Date.now();

    // ==========================================
    // 🌍 MACRO CATCH-UP ENGINE (Unpacks Projections)
    // ==========================================
    for (let i = macroTravelers.length - 1; i >= 0; i--) {
        const mt = macroTravelers[i];
        
        mt.progressTicks += modifier;
        const ratio = Math.min(1.0, mt.progressTicks / mt.totalTicksNeeded);
        
        mt.currentTileX = mt.homeX + (mt.targetX - mt.homeX) * ratio;
        mt.currentTileY = mt.homeY + (mt.targetY - mt.homeY) * ratio;

        const currentCX = Math.floor(mt.currentTileX / 100);
        const currentCY = Math.floor(mt.currentTileY / 100);
        const enteredActiveArea = Math.abs(currentCX - heroCX) <= 1 && Math.abs(currentCY - heroCY) <= 1;

        if (enteredActiveArea) {
            spawnSquad(
                Math.floor(mt.currentTileX), 
                Math.floor(mt.currentTileY), 
                mt.homeX, 
                mt.homeY
            );
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

            if (hob.squadRole === 'Sergeant' && hob.squadId) {
                console.log(`💀 Sergeant ${hob.name} fell in battle! Disbanding followers.`);
                hobbits.forEach(follower => {
                    if (follower.squadId === hob.squadId) {
                        delete follower.squadId;
                        delete follower.squadRole;
                    }
                });
            }

            hobbits.splice(i, 1);
            continue;
        }
    }

    // ==========================================
    // ⚙️ OUT-OF-BOUNDS PACKING PRE-PASS
    // ==========================================
    const squadsToPack = new Set();
    const soloToPack = new Set();

    for (let i = 0; i < hobbits.length; i++) {
        const hob = hobbits[i];
        const hobbitCX = Math.floor(hob.x / 1600);
        const hobbitCY = Math.floor(hob.y / 1600);
        const isInsideActiveChunks = Math.abs(hobbitCX - heroCX) <= 1 && Math.abs(hobbitCY - heroCY) <= 1;

        if (!isInsideActiveChunks) {
            if (hob.job === 'Military') {
                if (hob.squadId) {
                    if (hob.squadRole === 'Sergeant') {
                        squadsToPack.add(hob.squadId);
                    }
                } else {
                    soloToPack.add(hob.id);
                }
            } else {
                hob.toRemove = true;
            }
        }
    }

    squadsToPack.forEach(squadId => {
        const representative = hobbits.find(h => h.squadId === squadId && h.squadRole === 'Sergeant') || hobbits.find(h => h.squadId === squadId);
        if (representative) {
            const destinationWell = plannedWells.find(well => well.x !== representative.homeX || well.y !== representative.homeY);
            if (destinationWell) {
                const currentTX = Math.floor(representative.x / 16);
                const currentTY = Math.floor(representative.y / 16);

                const totalDist = Math.hypot(destinationWell.x - representative.homeX, destinationWell.y - representative.homeY);
                const traveledDist = Math.hypot(currentTX - representative.homeX, currentTY - representative.homeY);
                
                const ratio = totalDist > 0 ? Math.min(1.0, traveledDist / totalDist) : 0;
                const totalTicksNeeded = totalDist / 2;
                const progressTicks = ratio * totalTicksNeeded;

                macroTravelers.push({
                    id: squadId,
                    isSquad: true,
                    homeX: representative.homeX || currentTX,
                    homeY: representative.homeY || currentTY,
                    targetX: destinationWell.x,
                    targetY: destinationWell.y,
                    currentTileX: currentTX,
                    currentTileY: currentTY,
                    progressTicks: progressTicks,
                    totalTicksNeeded: totalTicksNeeded > 0 ? totalTicksNeeded : 1
                });
            }
        }
        hobbits.forEach(h => {
            if (h.squadId === squadId) {
                h.toRemove = true;
            }
        });
    });

    soloToPack.forEach(id => {
        const hobbit = hobbits.find(h => h.id === id);
        if (hobbit) {
            const destinationWell = plannedWells.find(well => well.x !== hobbit.homeX || well.y !== hobbit.homeY);
            if (destinationWell) {
                const currentTX = Math.floor(hobbit.x / 16);
                const currentTY = Math.floor(hobbit.y / 16);

                const totalDist = Math.hypot(destinationWell.x - hobbit.homeX, destinationWell.y - hobbit.homeY);
                const traveledDist = Math.hypot(currentTX - hobbit.homeX, currentTY - hobbit.homeY);
                
                const ratio = totalDist > 0 ? Math.min(1.0, traveledDist / totalDist) : 0;
                const totalTicksNeeded = totalDist / 2;
                const progressTicks = ratio * totalTicksNeeded;

                macroTravelers.push({
                    id: 'squad_' + Math.random().toString(36).substr(2, 9),
                    isSquad: false,
                    homeX: hobbit.homeX || currentTX,
                    homeY: hobbit.homeY || currentTY,
                    targetX: destinationWell.x,
                    targetY: destinationWell.y,
                    currentTileX: currentTX,
                    currentTileY: currentTY,
                    progressTicks: progressTicks,
                    totalTicksNeeded: totalTicksNeeded > 0 ? totalTicksNeeded : 1
                });
            }
            hobbit.toRemove = true;
        }
    });

    for (let i = hobbits.length - 1; i >= 0; i--) {
        if (hobbits[i].toRemove) {
            hobbits.splice(i, 1);
        }
    }

    // ==========================================
    // ⚙️ MAIN AI BEHAVIOR LOGIC
    // ==========================================
    hobbits.forEach(hobbit => {
        if (!hobbit.lastUpdated) hobbit.lastUpdated = now;
        let deltaSeconds = (now - hobbit.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0;
        hobbit.lastUpdated = now;

        // ==========================================
        // ❄️ TIER 3: OFFLINE CATCH-UP (Backlogged Fast Forward)
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
                } else if (hobbit.job === 'Trader' || hobbit.job === 'Forager' || hobbit.job === 'Usher') {
                    // Simple nighttime wait positions during catch-up cycles
                    if (worldTime.isNight) {
                        if (simX !== hobbit.homeX || simY !== hobbit.homeY) {
                            const next = estimateCatchUpStep(simX, simY, hobbit.homeX, hobbit.homeY);
                            simX = next.x; simY = next.y;
                        }
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

            hobbit.x = simX * 16;
            hobbit.y = simY * 16;
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
        // ❄️ TIER 2: COLD HEARTBEAT (Off-Screen Active Update)
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
                const px = (hero.x + 8) - (hobbit.x + 8);
                const py = (hero.y + 8) - (hobbit.y + 8);
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
                    // TETHER CHECK FOR SERGEANT OFFSCREEN
                    let isWaitingOffscreen = false;
                    if (hobbit.job === 'Military' && hobbit.squadRole === 'Sergeant' && hobbit.squadId) {
                        const followers = hobbits.filter(h => h.squadId === hobbit.squadId && h.squadRole === 'Military');
                        const tooFar = followers.some(f => Math.hypot(f.x - hobbit.x, f.y - hobbit.y) > 48);
                        if (tooFar) {
                            hobbit.state = 'idle';
                            hobbit.path = [];
                            isWaitingOffscreen = true;
                        }
                    }

                    if (isWaitingOffscreen) {
                        // Standing idle; skip path recalculations
                    }
                    else if (hobbit.job === 'Forager') {
                        runForagerBehavior(hobbit, 1.5, worldMatrix, roomMatrix);
                    }
                    else if (hobbit.job === 'Trader') {
                        runTraderBehavior(hobbit, 1.5, worldMatrix, roomMatrix);
                    }
                    else if (hobbit.job === 'Usher') {
                        runUsherBehavior(hobbit, 1.5, worldMatrix, roomMatrix);
                    }
                    else if (hobbit.job === 'Military' && hobbit.squadId && hobbit.squadRole === 'Military') {
                        const sergeant = hobbits.find(h => h.squadId === hobbit.squadId && h.squadRole === 'Sergeant');
                        if (sergeant) {
                            const sTX = Math.floor((sergeant.x + 8) / 16);
                            const sTY = Math.floor((sergeant.y + 15) / 16);
                            const path = findOffScreenPath(currTX, currTY, sTX, sTY);
                            if (path) {
                                hobbit.path = path;
                                hobbit.goal = 'march';
                            }
                        } else {
                            delete hobbit.squadId;
                            delete hobbit.squadRole;
                        }
                    }
                    else if (hobbit.job === 'Military') {
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
                    } else if (hobbit.job === 'Farmer' && hobbit.houseId) {
                        // Standard Farmer Offscreen Routine
                        if (worldTime.isNight) {
                            if (currTX !== hobbit.homeX || currTY !== hobbit.homeY) {
                                const path = findOffScreenPath(currTX, currTY, hobbit.homeX, hobbit.homeY);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'sleep';
                                }
                            }
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                        }
                    } else {
                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                        hobbit.goal = 'wander';
                    }
                }

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

                    const currentDistToHero = Math.hypot((hero.x + 8) - (hobbit.x + 8), (hero.y + 8) - (hobbit.y + 8));
                    if (hobbit.goal === 'engage' && currentDistToHero <= 24) {
                        if (hero.hp > 0) {
                            hero.hp = Math.max(0, hero.hp - hobbit.ad);
                            if (socket) socket.emit('updateStats', { hp: hero.hp });
                        }
                        hobbit.path = [];
                    }
                }
            }
            return; 
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time Update)
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
        // ⚔️ MILITARY JOB STATE MACHINE (ON-SCREEN)
        // ==========================================
        if (hobbit.job === 'Military') {
            let isWaitingForOutfit = false;
            if (hobbit.squadRole === 'Sergeant' && hobbit.squadId && hobbit.state !== 'attacking') {
                const followers = hobbits.filter(h => h.squadId === hobbit.squadId && h.squadRole === 'Military');
                const tooFar = followers.some(f => Math.hypot(f.x - hobbit.x, f.y - hobbit.y) > 48);
                
                if (tooFar) {
                    hobbit.state = 'idle';
                    hobbit.path = [];
                    isWaitingForOutfit = true; 
                }
            }

            if (isWaitingForOutfit) {
                // Sergeant holds position for squad alignment
            }
            else if (hobbit.squadId && hobbit.squadRole === 'Military') {
                const sergeant = hobbits.find(h => h.squadId === hobbit.squadId && h.squadRole === 'Sergeant');
                
                if (sergeant) {
                    const target = sergeant.attackTarget;
                    hobbit.attackTarget = target;
                    
                    if (target && target.hp > 0) {
                        hobbit.goal = 'attack_enemy';
                        const distToTarget = Math.hypot((target.x + 8) - (hobbit.x + 8), (target.y + 8) - (hobbit.y + 8));
                        
                        if (distToTarget <= 24) {
                            if (hobbit.state !== 'attacking') {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                            }
                            if (hobbit.attackTimer <= 0 && hobbit.state !== 'attacking') {
                                hobbit.state = 'attacking';
                                hobbit.attackTimer = 0.5;
                                hobbit.hasStruck = false;
                                const tdx = target.x - hobbit.x;
                                const tdy = target.y - hobbit.y;
                                hobbit.dir = Math.abs(tdx) > Math.abs(tdy) ? (tdx > 0 ? 'East' : 'West') : (tdy > 0 ? 'South' : 'North');
                            }
                        } else if (hobbit.pathTimer <= 0) {
                            hobbit.pathTimer = 0.4 + Math.random() * 0.4;
                            const targetTX = Math.floor((target.x + 8) / 16);
                            const targetTY = Math.floor((target.y + 8) / 16);
                            const path = findPathToCoords(currTX, currTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit, 15);
                            if (path) {
                                hobbit.path = path;
                                hobbit.state = 'walking';
                            }
                        }
                    } else {
                        hobbit.goal = 'march';
                        const sTX = Math.floor((sergeant.x + 8) / 16);
                        const sTY = Math.floor((sergeant.y + 15) / 16);
                        
                        const squadFollowers = hobbits.filter(h => h.squadId === hobbit.squadId && h.squadRole === 'Military');
                        const myIndex = squadFollowers.indexOf(hobbit);
                        const formationOffsets = [
                            { dx: -1, dy: 1 },  
                            { dx: 1, dy: 1 },   
                            { dx: -1, dy: -1 }, 
                            { dx: 1, dy: -1 }   
                        ];
                        const offset = formationOffsets[myIndex % 4] || { dx: 0, dy: 0 };
                        let targetTX = sTX + offset.dx;
                        let targetTY = sTY + offset.dy;
                        
                        if (!isWalkableForHobbit(targetTX, targetTY, worldMatrix, roomMatrix, hobbit)) {
                            targetTX = sTX;
                            targetTY = sTY;
                        }

                        const targetX = targetTX * 16;
                        const targetY = targetTY * 16;
                        const distToSlot = Math.hypot(targetX - hobbit.x, targetY - hobbit.y);
                        
                        if (distToSlot > 16) {
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                                hobbit.pathTimer = 0.3;
                                const path = findPathToCoords(currTX, currTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit, 12);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.state = 'walking';
                                }
                            }
                        } else {
                            if (sergeant.state === 'idle') {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                            }
                        }
                    }
                } else {
                    delete hobbit.squadId;
                    delete hobbit.squadRole;
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
        // 🏛️ PEACEFUL JOB STATE MACHINE (ON-SCREEN)
        // ==========================================
        else {
            let isDefending = false;
            let criminals = null;
            if (village && typeof window !== 'undefined' && window.villageCriminals) {
                criminals = window.villageCriminals.get(`${village.x}_${village.y}`);
            }

            if (criminals && criminals.size > 0 && villageOwner) {
                const px = (hero.x + 8) - (hobbit.x + 8);
                const py = (hero.y + 8) - (hobbit.y + 8);
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
                        }
                    }
                }
            }

            if (!isDefending) {
                // Route to externalized behaviors for Traders, Foragers, and Ushers
                if (hobbit.job === 'Forager') {
                    runForagerBehavior(hobbit, modifier, worldMatrix, roomMatrix);
                }
                else if (hobbit.job === 'Trader') {
                    runTraderBehavior(hobbit, modifier, worldMatrix, roomMatrix);
                }
                else if (hobbit.job === 'Usher') {
                    runUsherBehavior(hobbit, modifier, worldMatrix, roomMatrix);
                }
                else if (hobbit.job === 'Farmer' && hobbit.houseId) {
                    // Farmer Crop and Agricultural State Machine
                    const hasEggs = hobbit.inventory.some(item => item.seedType === 'egg');
                    const hasPM = hobbit.inventory.some(item => item.seedType === 'plant_matter');

                    if (worldTime.isNight) {
                        hobbit.goal = 'sleep';
                        if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                            hobbit.state = 'idle';
                            hobbit.path = [];
                        } else {
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                                hobbit.pathTimer = 1.5;
                                const path = findPathToCoords(currTX, currTY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit, 40);
                                if (path) {
                                    hobbit.state = 'walking';
                                    hobbit.path = path;
                                }
                            }
                        }
                    }
                    else if (hasEggs) {
                        hobbit.goal = 'sell_food';
                        const counter = findNearestStoreCounter(hobbit);
                        if (counter) {
                            const standX = counter.x;
                            const standY = counter.y + 1;
                            const dist = Math.hypot((standX * 16 + 8) - (hobbit.x + 8), (standY * 16 + 8) - (hobbit.y + 8));

                            if (dist <= 24) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                                tryHobbitTrade(hobbit, counter.x, counter.y);
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5;
                                    const path = findPathToCoords(currTX, currTY, standX, standY, worldMatrix, roomMatrix, hobbit, 40);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    }
                                }
                            }
                        }
                    }
                    else if (hasPM) {
                        hobbit.goal = 'deposit_pm';
                        const storage = findHomeHayStorage(hobbit);
                        if (storage) {
                            const dist = Math.hypot((storage.x * 16 + 8) - (hobbit.x + 8), (storage.y * 16 + 8) - (hobbit.y + 8));
                            if (dist <= 24) {
                                hobbit.state = 'idle';
                                hobbit.path = [];

                                const storageId = `hay_${storage.x}_${storage.y}`;
                                const hayItems = hayStorageCache.get(storageId) || [];
                                const pmItem = hobbit.inventory.find(i => i.seedType === 'plant_matter');

                                if (pmItem) {
                                    const existing = hayItems.find(i => i.seedType === 'plant_matter' && i.count < (i.maxStack || 64));
                                    if (existing) {
                                        existing.count += pmItem.count;
                                        hobbit.inventory = hobbit.inventory.filter(i => i !== pmItem);
                                    } else if (hayItems.length < 8) {
                                        hayItems.push(pmItem);
                                        hobbit.inventory = hobbit.inventory.filter(i => i !== pmItem);
                                    }
                                }
                                if (socket && socket.connected) {
                                    socket.emit('updateHayStorage', { hayStorageId: storageId, items: hayItems });
                                }
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5;
                                    const path = findPathToCoords(currTX, currTY, storage.x, storage.y, worldMatrix, roomMatrix, hobbit, 30);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
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
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 2.0;
                                    const path = findPathToCoords(currTX, currTY, egg.gx, egg.gy, worldMatrix, roomMatrix, hobbit, 30);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    }
                                }
                            }
                        } else {
                            hobbit.goal = 'wander';
                            if (!hobbit.path || hobbit.path.length === 0) {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                            }
                        }
                    }
                }
                else {
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
            }
        }

        // ==========================================
        // 🗡️ COMBAT HIT-DETECTION & PHYSICS LERP
        // ==========================================
        if (hobbit.state === 'attacking') {
            if (hobbit.attackTimer <= 0.25 && !hobbit.hasStruck) {
                hobbit.hasStruck = true;
                let currentEnemy = (hobbit.job === 'Military' && hobbit.attackTarget) ? hobbit.attackTarget : (hobbit.goal === 'defend_home' && enemyTarget ? enemyTarget : hero);

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