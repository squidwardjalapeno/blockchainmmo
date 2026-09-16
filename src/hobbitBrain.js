// src/hobbitBrain.js
import { getTileData } from './physics.js';
import { getTilePath, isTilePassable } from './hobbitNavigation.js';
import { worldTime } from './clock.js';
import { socket, chestCache } from './multiplayer.js';
import { plants, deletePlant } from './plants.js';
import { createItem, ITEM_TYPES } from './items.js';

export function tickHobbitBrain(hobbit, delta, worldMatrix, roomMatrix) {
    const currentTX = Math.floor((hobbit.x + 8) / 16);
    const currentTY = Math.floor((hobbit.y + 8) / 16);
    const currentData = getTileData(hobbit.x + 8, hobbit.y + 8, worldMatrix, roomMatrix);
    const currentRoom = currentData.roomID || 0;

    // 1. Drain Energy
    hobbit.energy = Math.max(0, hobbit.energy - (delta * 0.2));

    // 2. Resolve High-Level Goal
    let targetTX = null;
    let targetTY = null;
    let requiredRoom = null;
    let actionType = 'IDLE';

    // A. REST GOAL (Nighttime or Exhausted)
    if (worldTime.isNight || hobbit.energy < 20) {
        targetTX = hobbit.homeX;
        targetTY = hobbit.homeY;
        requiredRoom = hobbit.houseId;
        actionType = 'SLEEP';
    }
    // B. FORAGER WORK GOAL
    else if (hobbit.job === 'Forager') {
        const isFull = hobbit.inventory.filter(i => !i.isKey).length >= 4;

        if (isFull && hobbit.chestX !== null) {
            targetTX = hobbit.chestX + 1; // Stand next to chest
            targetTY = hobbit.chestY;
            requiredRoom = hobbit.houseId;
            actionType = 'DEPOSIT_CHEST';
        } else {
            // Find nearest mature plant
            const plant = findNearestMatureCrop(currentTX, currentTY);
            if (plant) {
                targetTX = plant.gx;
                targetTY = plant.gy;
                actionType = 'HARVEST';
            }
        }
    }

    // 3. Execution & Spatial Verification (NO WALL-HACKS)
    if (targetTX !== null && targetTY !== null) {
        const isAdjacent = Math.abs(currentTX - targetTX) + Math.abs(currentTY - targetTY) <= 1;
        const isSameRoom = (requiredRoom === null) || (currentRoom === requiredRoom);

        // --- AT TARGET: EXECUTE ACTION ---
        if (isAdjacent && isSameRoom) {
            hobbit.path = [];
            hobbit.state = 'idle';

            if (actionType === 'SLEEP') {
                hobbit.energy = Math.min(100, hobbit.energy + (delta * 5.0)); // Regenerate
            } 
            else if (actionType === 'DEPOSIT_CHEST') {
                depositBackpackToChest(hobbit);
            } 
            else if (actionType === 'HARVEST') {
                harvestPlant(hobbit, targetTX, targetTY);
            }
            return;
        }

        // --- NOT AT TARGET: STEP PATH ---
        if (!hobbit.path || hobbit.path.length === 0 || hobbit.pathTimer <= 0) {
            hobbit.path = getTilePath(currentTX, currentTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit);
            hobbit.pathTimer = 1.5; // Re-evaluate path every 1.5s
        }
    } else {
        // Fallback: Random Wander
        if (!hobbit.path || hobbit.path.length === 0) {
            hobbit.moveTimer = (hobbit.moveTimer || 0) - delta;
            if (hobbit.moveTimer <= 0) {
                const wanderNodes = [
                    { x: currentTX + 1, y: currentTY },
                    { x: currentTX - 1, y: currentTY },
                    { x: currentTX, y: currentTY + 1 },
                    { x: currentTX, y: currentTY - 1 }
                ].filter(n => isTilePassable(n.x, n.y, worldMatrix, roomMatrix, hobbit));

                if (wanderNodes.length > 0) {
                    hobbit.path = [wanderNodes[Math.floor(Math.random() * wanderNodes.length)]];
                }
                hobbit.moveTimer = 2.0 + Math.random() * 2.0;
            }
        }
    }

    // 4. Smooth Grid Stepping (Interpolation without corner snagging)
    if (hobbit.path && hobbit.path.length > 0) {
        const nextNode = hobbit.path[0];
        const nextWorldX = nextNode.x * 16;
        const nextWorldY = nextNode.y * 16;

        const dx = nextWorldX - hobbit.x;
        const dy = nextWorldY - hobbit.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 1.5) {
            const step = Math.min(dist, hobbit.speed * delta);
            hobbit.x += (dx / dist) * step;
            hobbit.y += (dy / dist) * step;
            hobbit.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : (dy > 0 ? 'South' : 'North');
            hobbit.state = 'walking';
        } else {
            // Arrived cleanly on node
            hobbit.x = nextWorldX;
            hobbit.y = nextWorldY;
            hobbit.path.shift();
        }
    } else {
        hobbit.state = 'idle';
    }

    if (hobbit.pathTimer > 0) hobbit.pathTimer -= delta;
}

// === Clean Helper Actions ===

function findNearestMatureCrop(currTX, currTY, maxRange = 25) {
    let nearest = null;
    let minDist = maxRange;

    for (const [key, plant] of plants) {
        if (plant.growth >= 100) {
            const dist = Math.hypot(plant.gx - currTX, plant.gy - currTY);
            if (dist < minDist) {
                minDist = dist;
                nearest = plant;
            }
        }
    }
    return nearest;
}

function depositBackpackToChest(hobbit) {
    const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
    const chestItems = chestCache.get(chestId) || [];
    const nonKeys = hobbit.inventory.filter(i => !i.isKey);

    nonKeys.forEach(item => {
        if (chestItems.length < 8) {
            chestItems.push(item);
            hobbit.inventory = hobbit.inventory.filter(i => i !== item);
        }
    });

    if (socket && socket.connected) {
        socket.emit('updateChest', { chestId, items: chestItems });
    }
}

function harvestPlant(hobbit, gx, gy) {
    const plantKey = `${gx}_${gy}`;
    const plant = plants.get(plantKey);
    if (!plant || plant.growth < 100) return;

    // 1. Add crop to inventory
    const seedItem = createItem(ITEM_TYPES.PLANT_MATTER);
    hobbit.inventory.push(seedItem);

    // 2. Clear plant
    deletePlant(gx, gy);
    if (socket && socket.connected) {
        socket.emit('syncTile', { gx, gy, traits: 0 });
    }
}