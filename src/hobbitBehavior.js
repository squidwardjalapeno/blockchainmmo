// src/hobbitBehavior.js

import { 
    hobbits, 
    getHobbitVillage, 
    HOBBIT_FOOD_VALUES, 
    YIELD_MAP 
} from './hobbitCore.js';
import { staticObjects } from './staticObjects.js';
import { getBacteriaData } from './bacteria.js';
import { plants, PLANT_DEFS } from './plants.js';
import { ITEM_TYPES, createItem } from './items.js';
import { getTileData } from './physics.js';
import { hero } from './entities.js';
import { plannedWells } from './cellDecorator.js';
import { worldTime } from './clock.js'; 
import { findPathToCoords, assignRandomWalk } from './hobbitNavigation.js';
import { 
    socket, 
    myID, 
    playerWallet, 
    remotePlayers, 
    storeDbCache, 
    chestCache, 
    hayStorageCache,
    doorStates,
    villageOwners
} from './multiplayer.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitBehavior.js loaded");
}

// ============================================================================
// 🦴 1. SHARED UTILITY & SEARCH FUNCTIONS
// ============================================================================

/**
 * Checks a hobbit's inventory for edible items and consumes one if energy is depleted.
 */
export function eatFoodIfAvailable(hobbit) {
    const foodIndex = hobbit.inventory.findIndex(i => HOBBIT_FOOD_VALUES[i.seedType] !== undefined);
    if (foodIndex !== -1) {
        const food = hobbit.inventory[foodIndex];
        const restoreAmount = HOBBIT_FOOD_VALUES[food.seedType];
        
        food.count--;
        if (food.count <= 0) {
            hobbit.inventory.splice(foodIndex, 1);
        }
        
        hobbit.energy = Math.min(hobbit.maxEnergy, hobbit.energy + restoreAmount);
        console.log(`😋 Hungry Hobbit ${hobbit.name} ate ${food.name}! Restored ${restoreAmount} energy. Current: ${hobbit.energy}`);
        
        if (hobbit.energy > 70) {
            hobbit.goal = 'wander';
            hobbit.path = [];
            hobbit.state = 'idle';
        }
        return true;
    }
    return false;
}

/**
 * Scans static structures for the closest store counter within range.
 */
export function findNearestStoreCounter(hobbit, range = 3200) { 
    let nearest = null;
    let minDist = range;
    for (let [key, obj] of staticObjects) {
        if (obj.type === 'STORE_COUNTER') {
            const tx = Math.floor(key / 10000);
            const ty = key % 10000;
            const dist = Math.hypot((tx * 16 + 8) - (hobbit.x + 8), (ty * 16 + 8) - (hobbit.y + 8));
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: tx, y: ty };
            }
        }
    }
    return nearest;
}

/**
 * Searches near the hobbit's home context for functional hay storage.
 */
export function findHomeHayStorage(hobbit) {
    if (!hobbit.houseId) return null;
    for (let [key, obj] of staticObjects) {
        if (obj.type === 'HAY_STORAGE' && obj.houseId === hobbit.houseId) {
            const tx = Math.floor(key / 10000);
            const ty = key % 10000;
            return { x: tx, y: ty };
        }
    }
    return null;
}

/**
 * Finds the nearest mature, harvestable plant within range.
 */
export function findNearestMaturePlant(hobbit, range = 80) { 
    let nearest = null;
    let minDist = range;
    
    for (let [key, plant] of plants) {
        const px = plant.gx * 16 + 8;
        const py = plant.gy * 16 + 8;
        const dist = Math.hypot(px - hobbit.x, py - hobbit.y);
        
        if (dist < range && dist < minDist) {
            const def = PLANT_DEFS[plant.type];
            if (def && plant.growth >= 100) {
                minDist = dist;
                nearest = plant;
            }
        }
    }
    return nearest;
}

/**
 * Scans localized tile bacteria coordinates for dropped poultry eggs.
 */
export function findNearestEgg(hobbit, range = 400) {
    const currTX = Math.floor((hobbit.x + 8) / 16);
    const currTY = Math.floor((hobbit.y + 8) / 16);
    let nearest = null;
    let minDist = Infinity;

    for (let ox = -25; ox <= 25; ox++) {
        for (let oy = -25; oy <= 25; oy++) {
            const tx = currTX + ox;
            const ty = currTY + oy;
            const bac = getBacteriaData(tx, ty);
            if (bac && bac.data) {
                const traits = bac.data[bac.idx];
                if (traits > 0) {
                    const typeID = (traits >> 20) & 0xFF;
                    if (typeID === 16) { 
                        const dist = Math.hypot((tx * 16 + 8) - (hobbit.x + 8), (ty * 16 + 8) - (hobbit.y + 8));
                        if (dist < range && dist < minDist) {
                            minDist = dist;
                            nearest = { gx: tx, gy: ty };
                        }
                    }
                }
            }
        }
    }
    return nearest;
}

/**
 * Safe helper to allocate items to a hobbit's inventory, respecting stack limits.
 */
export function giveItemToHobbit(hobbit, newItem) {
    if (!newItem) return false;

    if (newItem.maxStack > 1) {
        const existing = hobbit.inventory.find(i => i.seedType === newItem.seedType && i.count < (i.maxStack || 8));
        if (existing) {
            const space = (existing.maxStack || 8) - existing.count;
            if (newItem.count <= space) {
                existing.count += newItem.count;
                return true;
            } else {
                existing.count = existing.maxStack || 8;
                newItem.count -= space;
            }
        }
    }

    hobbit.inventory.push(newItem);
    return true;
}

/**
 * Evaluates trade offers from regional store counters and executes acquisitions if funded.
 */
export function tryHobbitTrade(hobbit, cx, cy) {
    const storeDataId = `store_${cx}_${cy}`;
    const storeData = storeDbCache.get(storeDataId);
    if (!storeData || !storeData.listings || storeData.listings.length === 0) return;

    for (let l of storeData.listings) {
        if (l.counterOffer) continue; 

        const itemIdx = hobbit.inventory.findIndex(i => i.seedType === l.wantedType);
        if (itemIdx !== -1) {
            const paymentItem = hobbit.inventory[itemIdx];
            const singlePaymentItem = { ...paymentItem, count: 1 };

            paymentItem.count--;
            if (paymentItem.count <= 0) {
                hobbit.inventory.splice(itemIdx, 1);
            }

            console.log(`🤝 Hobbit ${hobbit.name} is fulfilling listing ${l.id}: trading 1x ${l.wantedType} for ${l.offeredItem.name}`);

            if (socket && socket.connected) {
                socket.emit('buyListing', {
                    storeId: storeDataId,
                    listingId: l.id,
                    buyerWallet: null,
                    paymentItem: singlePaymentItem,
                    isHobbit: true
                });
            }

            giveItemToHobbit(hobbit, l.offeredItem);

            hobbit.goal = 'wander';
            hobbit.path = [];
            hobbit.state = 'idle';
            break; 
        }
    }
}

/**
 * Searches the surrounding sector to locate valid enemy targets for military roles.
 */
export function findMilitaryTarget(hobbit, myWell, myWellOwner) {
    let nearestEnemy = null;
    let nearestEnemyDist = 120; 

    hobbits.forEach(other => {
        if (other.id === hobbit.id || other.hp <= 0) return;
        
        const otherWell = other.cachedWell || getHobbitVillage(other);
        if (myWell && otherWell && (myWell.x !== otherWell.x || myWell.y !== otherWell.y)) {
            const dist = Math.hypot((other.x + 8) - (hobbit.x + 8), (other.y + 8) - (hobbit.y + 8));
            if (dist < nearestEnemyDist) {
                nearestEnemyDist = dist;
                nearestEnemy = other;
            }
        }
    });

    if (hero && hero.hp > 0) {
        const heroName = playerWallet || "Guest";
        const isEnemy = myWellOwner && (myWellOwner !== heroName);
        if (isEnemy) {
            const dist = Math.hypot((hero.x + 8) - (hobbit.x + 8), (hero.y + 8) - (hobbit.y + 8));
            if (dist < nearestEnemyDist) {
                nearestEnemyDist = dist;
                nearestEnemy = hero;
            }
        }
    }

    if (remotePlayers) {
        remotePlayers.forEach((p, id) => {
            if (p.hp <= 0) return;
            const pName = p.wallet || `Guest_${id.substring(0, 4)}`;
            const isEnemy = myWellOwner && (myWellOwner !== pName);
            if (isEnemy) {
                const dist = Math.hypot((p.x + 8) - (hobbit.x + 8), (p.y + 8) - (hobbit.y + 8));
                if (dist < nearestEnemyDist) {
                    nearestEnemyDist = dist;
                    nearestEnemy = p;
                }
            }
        });
    }

    return { target: nearestEnemy, dist: nearestEnemyDist };
}

/**
 * Fast-forward projection equations to approximate path steps during offline simulations.
 */
export function estimateCatchUpStep(startX, startY, targetX, targetY) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1.5) return { x: targetX, y: targetY };
    return {
        x: startX + Math.round(dx / dist),
        y: startY + Math.round(dy / dist)
    };
}

/**
 * Finds the nearest Temple Altar and calculates its associated entrance door.
 */
export function findNearestTemple(hobbit) {
    let nearestAltar = null;
    let minDist = Infinity;
    
    for (let [key, obj] of staticObjects) {
        if (obj.type === 'TEMPLE_ALTAR') {
            const tx = Math.floor(key / 10000);
            const ty = key % 10000;
            const dist = Math.hypot((tx * 16 + 8) - (hobbit.x + 8), (ty * 16 + 8) - (hobbit.y + 8));
            if (dist < minDist) {
                minDist = dist;
                nearestAltar = { 
                    x: tx, 
                    y: ty, 
                    houseId: obj.houseId,
                    doorX: tx - 1,
                    doorY: ty + 6
                };
            }
        }
    }
    return nearestAltar;
}

/**
 * Searches local cache registries for any companion Forager chests containing seeds.
 */
export function findForagerChestWithSeeds(hobbit) {
    const village = hobbit.cachedWell || getHobbitVillage(hobbit);
    if (!village) return null;

    let targetChest = null;
    let minDist = Infinity;

    hobbits.forEach(other => {
        if (other.job === 'Forager' && other.chestX !== null) {
            const otherVillage = getHobbitVillage(other);

            if (otherVillage && otherVillage.x === village.x && otherVillage.y === village.y) {
                const chestId = `chest_${other.chestX}_${other.chestY}`;
                const items = chestCache.get(chestId) || [];
                const hasSeeds = items.some(i => i.seedType && i.seedType.includes('_seed'));

                if (hasSeeds) {
                    const dist = Math.hypot(other.chestX - Math.floor(hobbit.x / 16), other.chestY - Math.floor(hobbit.y / 16));
                    if (dist < minDist) {
                        minDist = dist;
                        targetChest = { x: other.chestX, y: other.chestY };
                    }
                }
            }
        }
    });

    return targetChest;
}

// ============================================================================
// 🚪 2. SHARED BUILDING LOCKING & SLEEPING ROUTINE
// ============================================================================

/**
 * Handles morning unlocking, nighttime locking, and traveling inside to wait.
 * Returns true if busy with the locking/waiting routine; false if free to work.
 */
export function executeStructureRoutine(hobbit, currTX, currTY, targetX, targetY, doorX, doorY, worldMatrix, roomMatrix) {
    if (doorX === null || doorY === null || targetX === null || targetY === null) return false;

    const doorKey = `${doorX}_${doorY}`;
    const doorState = doorStates.get(doorKey);
    const isLocked = doorState ? doorState.locked : true;
    const distToDoor = Math.max(Math.abs(currTX - doorX), Math.abs(currTY - doorY));

    if (!worldTime.isNight) {
        // --- DAYTIME: Ensure door is unlocked ---
        if (isLocked) {
            hobbit.goal = 'unlock_door';
            if (distToDoor <= 1) {
                hobbit.state = 'idle';
                hobbit.path = [];
                if (socket && socket.connected) {
                    socket.emit('setDoorLock', { gx: doorX, gy: doorY, locked: false });
                }
            } else {
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                    hobbit.pathTimer = 1.0;
                    const path = findPathToCoords(currTX, currTY, doorX, doorY, worldMatrix, roomMatrix, hobbit, 40);
                    if (path) {
                        hobbit.path = path;
                        hobbit.state = 'walking';
                    }
                }
            }
            return true; 
        }
        return false; 
    } else {
        // --- NIGHTTIME: Lock door and wait inside ---
        if (!isLocked) {
            hobbit.goal = 'lock_door';
            if (distToDoor <= 1) {
                hobbit.state = 'idle';
                hobbit.path = [];
                if (socket && socket.connected) {
                    socket.emit('setDoorLock', { gx: doorX, gy: doorY, locked: true });
                }
            } else {
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                    hobbit.pathTimer = 1.0;
                    const path = findPathToCoords(currTX, currTY, doorX, doorY, worldMatrix, roomMatrix, hobbit, 40);
                    if (path) {
                        hobbit.path = path;
                        hobbit.state = 'walking';
                    }
                }
            }
            return true; 
        } else {
            // Door is locked: Stand at our indoor waiting spot
            if (currTX === targetX && currTY === targetY) {
                hobbit.state = 'idle';
                hobbit.goal = 'wait_inside';
                hobbit.path = [];
            } else {
                hobbit.goal = 'go_inside';
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                    hobbit.pathTimer = 1.0;
                    const path = findPathToCoords(currTX, currTY, targetX, targetY, worldMatrix, roomMatrix, hobbit, 40);
                    if (path) {
                        hobbit.path = path;
                        hobbit.state = 'walking';
                    }
                }
            }
            return true; 
        }
    }
}

// ============================================================================
// 💼 3. ROLE-SPECIFIC STRATEGIC BEHAVIOR MACHINE STATES
// ============================================================================

/**
 * Main behavior machine for the Usher job.
 */
export function runUsherBehavior(hobbit, modifier, worldMatrix, roomMatrix) {
    const currTX = Math.floor((hobbit.x + 8) / 16);
    const currTY = Math.floor((hobbit.y + 15) / 16);

    const temple = findNearestTemple(hobbit);
    if (!temple) return; 

    // Initialize local inspection memories on the unit
    if (!hobbit.lastCheckedChests) hobbit.lastCheckedChests = new Map();

    // 1. Manage temple unlocking, locking, and indoor waiting
    if (executeStructureRoutine(
        hobbit, currTX, currTY, 
        temple.x, temple.y + 1,        
        temple.doorX, temple.doorY, 
        worldMatrix, roomMatrix
    )) {
        return; 
    }

    // 2. Perform daytime gathering/sacrificing duties
    const seedInventory = hobbit.inventory.filter(item => item.seedType && item.seedType.includes('_seed'));
    const totalSeeds = seedInventory.reduce((acc, item) => acc + item.count, 0);

    if (totalSeeds < 10) {
        hobbit.goal = 'collect_seeds';
        
        // Find all chests in the village
        const villageChests = getVillageChests(hobbit);
        const now = Date.now();

        // Filter out chests inspected less than 45 seconds ago
        const availableChests = villageChests.filter(chest => {
            const lastChecked = hobbit.lastCheckedChests.get(chest.id) || 0;
            return (now - lastChecked) > 45000; 
        });

        // Retain or select closest available chest to target
        if (hobbit.targetChest) {
            const stillAvailable = availableChests.some(c => c.id === hobbit.targetChest.id);
            if (!stillAvailable) hobbit.targetChest = null;
        }

        if (!hobbit.targetChest && availableChests.length > 0) {
            let closest = null;
            let minDist = Infinity;
            availableChests.forEach(c => {
                const dist = Math.hypot(c.x - currTX, c.y - currTY);
                if (dist < minDist) {
                    minDist = dist;
                    closest = c;
                }
            });
            hobbit.targetChest = closest;
        }

        const target = hobbit.targetChest;

        if (target) {
            const distToChest = Math.hypot((target.x * 16 + 8) - (hobbit.x + 8), (target.y * 16 + 8) - (hobbit.y + 8));
            
            if (distToChest <= 24) {
                hobbit.state = 'idle';
                hobbit.path = [];

                // 🎯 PHYSICAL INSPECTION: Fetch/Verify the latest chest state from the server
                if (!chestCache.has(target.id)) {
                    if (socket && socket.connected) {
                        socket.emit('requestChest', target.id);
                    }
                } else {
                    const chestItems = chestCache.get(target.id) || [];
                    const hasSeeds = chestItems.some(i => i.seedType && i.seedType.includes('_seed'));

                    if (hasSeeds) {
                        console.log(`✨ Usher ${hobbit.name} found seeds inside chest ${target.id}! Extracting...`);
                        
                        let extracted = false;
                        for (let i = chestItems.length - 1; i >= 0; i--) {
                            const item = chestItems[i];
                            if (item.seedType && item.seedType.includes('_seed')) {
                                chestItems.splice(i, 1);
                                giveItemToHobbit(hobbit, item);
                                extracted = true;
                            }
                        }

                        if (extracted && socket && socket.connected) {
                            socket.emit('updateChest', { chestId: target.id, items: chestItems });
                        }

                        // Done collecting, clear target
                        hobbit.targetChest = null;
                    } else {
                        console.log(`🔍 Usher ${hobbit.name} inspected chest ${target.id}. No seeds found.`);
                        // Mark as checked to initiate the cooldown
                        hobbit.lastCheckedChests.set(target.id, now);
                        hobbit.targetChest = null;
                    }
                }
            } else {
                // Navigate to the target chest
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                    hobbit.pathTimer = 1.5;
                    const path = findPathToCoords(currTX, currTY, target.x + 1, target.y, worldMatrix, roomMatrix, hobbit, 60);
                    if (path) {
                        hobbit.path = path;
                        hobbit.state = 'walking';
                    } else {
                        // Pathfinder could not find a path (door might be locked/blocked)
                        hobbit.lastCheckedChests.set(target.id, now);
                        hobbit.targetChest = null;
                    }
                }
            }
        } else {
            // All chests are on cooldown or no foragers exist, patrol the village randomly
            if (!hobbit.path || hobbit.path.length === 0) {
                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
            }
        }
    } else {
        hobbit.goal = 'sacrifice_seeds';
        const distToAltar = Math.hypot((temple.x * 16 + 8) - (hobbit.x + 8), (temple.y * 16 + 8) - (hobbit.y + 8));
        if (distToAltar <= 24) {
            hobbit.state = 'idle';
            hobbit.path = [];

            const village = hobbit.cachedWell || getHobbitVillage(hobbit);
            let isCaptured = false;
            if (village && villageOwners) {
                const data = villageOwners.get(`${village.x}_${village.y}`);
                isCaptured = data && data.owner && !data.owner.startsWith("Guest") && data.owner !== "UNCLAIMED";
            }

            const seedsToSacrifice = hobbit.inventory.filter(item => item.seedType && item.seedType.includes('_seed'));
            hobbit.inventory = hobbit.inventory.filter(item => !item.seedType || !item.seedType.includes('_seed'));

            if (isCaptured) {
                console.log(`✨ Usher ${hobbit.name} sacrificed seeds to fund Village Treasury!`);
                if (socket && socket.connected) {
                    seedsToSacrifice.forEach(seed => {
                        socket.emit('sacrificeItem', { 
                            itemType: seed.seedType, 
                            count: seed.count,
                            isVillageWalletFund: true,
                            villageId: `${village.x}_${village.y}` // 🎯 PASS VILLAGE ID
                        });
                    });
                }
            } else {
                console.log(`🍂 Usher ${hobbit.name} sacrificed seeds for nothing (Neutral Settlement).`);
            }
        } else {
            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                hobbit.pathTimer = 1.5;
                const path = findPathToCoords(currTX, currTY, temple.x, temple.y + 1, worldMatrix, roomMatrix, hobbit, 60);
                if (path) {
                    hobbit.path = path;
                    hobbit.state = 'walking';
                }
            }
        }
    }
}
/**
 * Main behavior machine for the Forager job.
 */
export function runForagerBehavior(hobbit, modifier, worldMatrix, roomMatrix) {
    const currTX = Math.floor((hobbit.x + 8) / 16);
    const currTY = Math.floor((hobbit.y + 15) / 16);

    // 1. Manage house unlocking, locking, and standing on bedroll at night
    if (executeStructureRoutine(
        hobbit, currTX, currTY, 
        hobbit.homeX, hobbit.homeY, 
        hobbit.doorX, hobbit.doorY, 
        worldMatrix, roomMatrix
    )) {
        return; 
    }

    // 2. Perform daytime foraging duties
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
            executeStoreTravel(hobbit, counter, currTX, currTY, worldMatrix, roomMatrix);
        }
    }
    else if (isChestFull && nonKeyItems.length === 0) {
        hobbit.goal = 'withdraw_pm';
        executeChestTravel(hobbit, hobbit.chestX + 1, hobbit.chestY, currTX, currTY, worldMatrix, roomMatrix, chestId, chestItems);
    }
    else if (shouldDeposit) {
        hobbit.goal = 'deposit';
        executeChestTravel(hobbit, hobbit.chestX + 1, hobbit.chestY, currTX, currTY, worldMatrix, roomMatrix, chestId, chestItems);
    }
    else {
        hobbit.goal = 'harvest';
        executeHarvestLogic(hobbit, nearestPlant, currTX, currTY, worldMatrix, roomMatrix);
    }
}

/**
 * Main behavior machine for the Trader job.
 */
export function runTraderBehavior(hobbit, modifier, worldMatrix, roomMatrix) {
    const currTX = Math.floor((hobbit.x + 8) / 16);
    const currTY = Math.floor((hobbit.y + 15) / 16);

    const storeCounter = findNearestStoreCounter(hobbit);
    if (!storeCounter) return;

    const doorX = storeCounter.x - 1;
    const doorY = storeCounter.y + 2;
    const targetX = storeCounter.x;
    const targetY = storeCounter.y + 1; 

    // 1. Manage store unlocking, locking, and waiting behind counter at night
    if (executeStructureRoutine(
        hobbit, currTX, currTY, 
        targetX, targetY,   
        doorX, doorY,       
        worldMatrix, roomMatrix
    )) {
        return; 
    }

    // 2. Perform daytime trading duties (idle behind counter)
    hobbit.goal = 'shopkeeping';
    hobbit.state = 'idle';
    hobbit.path = [];
}

// ============================================================================
// 🛠️ 4. INTERNAL ACTION CONTROLLERS (PRIVATE HELPERS)
// ============================================================================

function executeStoreTravel(hobbit, counter, currTX, currTY, worldMatrix, roomMatrix) {
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
            } else {
                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
            }
        }
    }
}

function executeChestTravel(hobbit, depositTX, depositTY, currTX, currTY, worldMatrix, roomMatrix, chestId, chestItems) {
    const dist = Math.hypot((depositTX * 16 + 8) - (hobbit.x + 8), (depositTY * 16 + 8) - (hobbit.y + 8));
    
    if (dist <= 24) {
        hobbit.state = 'idle';
        hobbit.path = [];

        if (!chestCache.has(chestId)) {
            if (socket && socket.connected) socket.emit('requestChest', chestId);
        } else {
            if (hobbit.goal === 'deposit') {
                transferToChest(hobbit, chestId, chestItems);
            } else if (hobbit.goal === 'withdraw_pm') {
                withdrawFromChest(hobbit, chestId, chestItems);
            }
        }
    } else {
        if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
            hobbit.pathTimer = 1.5;
            const path = findPathToCoords(currTX, currTY, depositTX, depositTY, worldMatrix, roomMatrix, hobbit);
            if (path) {
                hobbit.path = path;
                hobbit.state = 'walking';
            } else {
                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
            }
        }
    }
}

function executeHarvestLogic(hobbit, nearestPlant, currTX, currTY, worldMatrix, roomMatrix) {
    if (hobbit.targetPlant) {
        const plantKey = `${hobbit.targetPlant.gx}_${hobbit.targetPlant.gy}`;
        const livePlant = plants.get(plantKey);

        if (livePlant && livePlant.growth >= 100) {
            const dist = Math.hypot((livePlant.gx * 16 + 8) - (hobbit.x + 8), (livePlant.gy * 16 + 8) - (hobbit.y + 8));

            if (dist <= 24) {
                // 1. Give standard crop/foliage yield
                const keyName = YIELD_MAP[livePlant.type];
                if (keyName && ITEM_TYPES[keyName]) {
                    giveItemToHobbit(hobbit, createItem(ITEM_TYPES[keyName]));
                }

                // 🎯 2. SEED DROP LOGIC FOR FORAGERS
                // If the harvested plant is a wild crop (not a farm crop), roll for 1-2 seeds
                const farmCrops = ['turnip', 'tomato', 'eggplant', 'strawberry', 'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato', 'wheat'];
                if (!farmCrops.includes(livePlant.type)) {
                    const seedConstName = `${livePlant.type.toUpperCase()}_SEED`;
                    const seedTemplate = ITEM_TYPES[seedConstName];
                    if (seedTemplate) {
                        const seedCount = Math.floor(Math.random() * 2) + 1; // Generates 1 or 2 seeds
                        const seedItem = createItem(seedTemplate);
                        seedItem.count = seedCount;
                        giveItemToHobbit(hobbit, seedItem);
                    }
                }

                // 3. Clear the tile and notify the server
                plants.delete(plantKey);
                if (socket && socket.connected) {
                    socket.emit('syncTile', { gx: livePlant.gx, gy: livePlant.gy, traits: 0 });
                }
                
                hobbit.targetPlant = null;
                hobbit.path = [];
                hobbit.state = 'idle';
            } else {
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.pathTimer <= 0) {
                    hobbit.pathTimer = 1.5;
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
    } else if (nearestPlant) {
        hobbit.targetPlant = nearestPlant;
    } else {
        if (!hobbit.path || hobbit.path.length === 0) {
            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
        }
    }
}

function transferToChest(hobbit, chestId, chestItems) {
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
        } else if (chestItems.length < 8) {
            chestItems.push(dep);
            hobbit.inventory = hobbit.inventory.filter(i => i !== dep);
        }
    });

    if (socket && socket.connected) {
        socket.emit('updateChest', { chestId, items: chestItems });
    }
}

function withdrawFromChest(hobbit, chestId, chestItems) {
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
    }
}

/**
 * Resolves all physical Forager chest coordinates inside the Usher's village.
 */
export function getVillageChests(hobbit) {
    const village = hobbit.cachedWell || getHobbitVillage(hobbit);
    if (!village) return [];

    const chests = [];
    hobbits.forEach(other => {
        if (other.job === 'Forager' && other.chestX !== null) {
            const otherVillage = getHobbitVillage(other);
            if (otherVillage && otherVillage.x === village.x && otherVillage.y === village.y) {
                chests.push({ 
                    x: other.chestX, 
                    y: other.chestY, 
                    id: `chest_${other.chestX}_${other.chestY}` 
                });
            }
        }
    });
    return chests;
}