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
import { 
    socket, 
    myID, 
    playerWallet, 
    remotePlayers, 
    storeDbCache, 
    chestCache, 
    hayStorageCache 
} from './multiplayer.js';
import { findPathToCoords, isWalkableForHobbit, assignRandomWalk } from './hobbitNavigation.js';


if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitBehavior.js loaded");
}

/**
 * Checks a hobbit's inventory for edible items and consumes one if energy is depleted,
 * returning true if consumption occurred.
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
                    if (typeID === 16) { // Egg ID
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

export function runForagerBehavior(hobbit, modifier, worldMatrix, roomMatrix) {
    const currTX = Math.floor((hobbit.x + 8) / 16);
    const currTY = Math.floor((hobbit.y + 15) / 16);

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

    // Decision Tree
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

// Helper: Handle Store Navigation / Trading
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

// Helper: Handle Chest Navigation / Interaction
function executeChestTravel(hobbit, depositTX, depositTY, currTX, currTY, worldMatrix, roomMatrix, chestId, chestItems) {
    const dist = Math.hypot((depositTX * 16 + 8) - (hobbit.x + 8), (depositTY * 16 + 8) - (hobbit.y + 8));
    
    if (dist <= 24) {
        hobbit.state = 'idle';
        hobbit.path = [];

        if (!chestCache.has(chestId)) {
            if (socket && socket.connected) socket.emit('requestChest', chestId);
        } else {
            // Logic for transferring items to/from chest
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

// Helper: Handle Crop Searching and Harvesting
function executeHarvestLogic(hobbit, nearestPlant, currTX, currTY, worldMatrix, roomMatrix) {
    if (hobbit.targetPlant) {
        const plantKey = `${hobbit.targetPlant.gx}_${hobbit.targetPlant.gy}`;
        const livePlant = plants.get(plantKey);

        if (livePlant && livePlant.growth >= 100) {
            const dist = Math.hypot((livePlant.gx * 16 + 8) - (hobbit.x + 8), (livePlant.gy * 16 + 8) - (hobbit.y + 8));

            if (dist <= 24) {
                // Perform harvest
                const keyName = YIELD_MAP[livePlant.type];
                if (keyName && ITEM_TYPES[keyName]) {
                    giveItemToHobbit(hobbit, createItem(ITEM_TYPES[keyName]));
                }
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
        if ((!hobbit.path || hobbit.path.length === 0)) {
            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
        }
    }
}

// Atomic helper: Transfer items from Inventory to Chest
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

// Atomic helper: Withdraw PM from Chest
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