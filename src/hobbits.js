// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero, getFocusCoordinates } from './entities.js'; 
import { getObjectAt, staticObjects, solidTiles } from './staticObjects.js';
import { socket, doorStates, storeDbCache, hayStorageCache, chestCache, playerWallet, remotePlayers, myID } from './multiplayer.js';
import { worldTime } from './clock.js'; 
import { plants, PLANT_DEFS } from './plants.js';
import { ITEM_TYPES, createItem } from './items.js';
import { getBacteriaData } from './bacteria.js';
import { findPath } from './pathfinding.js'; 
import { plannedWells, getVillageAt } from './cellDecorator.js'; 

export const hobbits = [];
if (typeof window !== 'undefined') {
    window.hobbits = hobbits;
}

const HOBBIT_FIRST_NAMES = ["Bilbo", "Frodo", "Samwise", "Merry", "Pippin", "Bango", "Bungo", "Drogo", "Hamfast", "Longo", "Olo", "Paladin", "Rufus", "Sancho", "Tobold", "Wilibald"];
const HOBBIT_LAST_NAMES = ["Baggins", "Gamgee", "Brandybuck", "Took", "Gardner", "Greenhand", "Grubb", "Chubb", "Proudfoot", "Bolger", "Boffin", "Sandyman", "Cotton", "Twofoot", "Underhill", "Hornblower"];

const yieldMap = {
    'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM',
    'eggplant': 'EGGPLANT_ITEM', 'strawberry': 'STRAWBERRY_ITEM',
    'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
    'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM',
    'potato': 'POTATO_ITEM', 'wheat': 'WHEAT_ITEM',
    'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
    'violet': 'VIOLET_ITEM', 'sunflower': 'SUNFLOWER_ITEM'
};

const HOBBIT_FOOD_VALUES = { 
    "cooked_fish": 60,
    "fish_muskellunge": 100,
    "fish_trevally": 80, 
    "fish_angler": 80, 
    "fish_octopus": 60,
    "fish_squid": 50, 
    "fish_eel": 45, 
    "fish_mackerel": 35,
    "fish_trout": 25, 
    "fish": 20, 
    "fish_panfish": 15,
    "pineapple_item": 50,
    "eggplant_item": 40,
    "tomato_item": 35,
    "pumpkin_item": 30,
    "watermelon_item": 30,
    "potato_item": 25,
    "corn_item": 25,
    "turnip_item": 20,
    "egg": 20,
    "strawberry_item": 15,
    "wheat_item": 10,
    "raw_chicken": 15
};

function eatFoodIfAvailable(hobbit) {
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

// ==========================================
// 🧠 SEARCH & TRADE HELPERS
// ==========================================

function findNearestStoreCounter(hobbit, range = 3200) { 
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

// ==========================================
// 🚶 PATHFINDING & WALKING UTILITIES
// ==========================================

function isWalkableForHobbit(tx, ty, worldMatrix, roomMatrix, hobbit = null, fromX = null, fromY = null) {
    if (solidTiles.has(`${tx}_${ty}`)) return false;

    const obj = getObjectAt(tx, ty);
    if (obj && obj.type === 'FOREST_TREE') return false;
    const leftObj = getObjectAt(tx - 1, ty);
    if (leftObj && leftObj.type === 'FOREST_TREE') return false;

    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;

    const absoluteWalls = [40, 50, 52, 1, 3, 5, 41, 43, 27, 46, 47, 17, 18, 19, 21, 24, 11, 48];
    if (absoluteWalls.includes(data.tileID)) return false;

    if (fromX !== null && fromY !== null) {
        const fromData = getTileData(fromX * 16 + 8, fromY * 16 + 8, worldMatrix, roomMatrix);
        const cRoom = (fromData.roomID === 9999) ? 0 : fromData.roomID;
        const tRoom = (data.roomID === 9999) ? 0 : data.roomID;
        
        if (cRoom !== tRoom) {
            const doors = [35, 13, 23, 20, 49, 12, 22, 19];
            if (!doors.includes(data.tileID) && !doors.includes(fromData.tileID)) {
                return false; 
            }
        }
    }

    return true;
}

function assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkableForHobbit(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix, hobbit));
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        hobbit.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

/**
 * 🧠 BFS Pathfinding Helper
 */
function findPathToCoords(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit = null, maxDepth = 80) {
    const isWalkableFn = (tx, ty, fromX, fromY) => {
        return isWalkableForHobbit(tx, ty, worldMatrix, roomMatrix, hobbit, fromX, fromY);
    };

    const isTargetFn = (tx, ty) => {
        return tx === targetTX && ty === targetTY; 
    };

    return findPath(startTX, startTY, isWalkableFn, isTargetFn, maxDepth); 
}

/**
 * 🎯 High-performance intermediate BFS Pathfinding engine for far-away targets.
 */
function findPathToFarTarget(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit, maxSearch = 300) {
    const queue = [{ x: startTX, y: startTY, path: [] }];
    const visited = new Set([`${startTX}_${startTY}`]);
    
    let bestNode = null;
    let bestDist = Math.hypot(targetTX - startTX, targetTY - startTY);
    let iterations = 0;
    
    while (queue.length > 0 && iterations++ < maxSearch) {
        const curr = queue.shift();
        
        const dist = Math.hypot(targetTX - curr.x, targetTY - curr.y);
        if (dist < bestDist) {
            bestDist = dist;
            bestNode = curr;
        }
        
        if (curr.x === targetTX && curr.y === targetTY) {
            return curr.path;
        }
        
        const neighbors = [
            { x: curr.x, y: curr.y - 1 },
            { x: curr.x, y: curr.y + 1 },
            { x: curr.x - 1, y: curr.y },
            { x: curr.x + 1, y: curr.y }
        ];
        
        for (let n of neighbors) {
            const key = `${n.x}_${n.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                if (isWalkableForHobbit(n.x, n.y, worldMatrix, roomMatrix, hobbit, curr.x, curr.y)) {
                    queue.push({
                        x: n.x,
                        y: n.y,
                        path: [...curr.path, { x: n.x, y: n.y }]
                    });
                }
            }
        }
    }
    
    return bestNode ? bestNode.path : null;
}

function findNearestMaturePlant(hobbit, range = 80) { 
    let nearest = null;
    let minDist = range;
    
    for (let [key, plant] of plants) {
        const px = plant.gx * 16 + 8;
        const py = plant.gy * 16 + 8;
        const dist = Math.hypot(px - hobbit.x, py - hobbit.y);
        
        if (dist < range && dist < minDist) {
            const def = PLANT_DEFS[plant.type];
            if (def) {
                if (plant.growth >= 100) {
                    minDist = dist;
                    nearest = plant;
                }
            }
        }
    }
    return nearest;
}

function estimateCatchUpStep(startX, startY, targetX, targetY) {
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
 * ⚡ HIGH-PERFORMANCE ROAD-MARCHING HEURISTIC (LOOP RESISTANT)
 */
function findNextRoadStep(currX, currY, targetX, targetY, worldMatrix, roomMatrix, hobbit) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0], [-1,-1], [1,-1], [-1,1], [1,1]];
    let bestStep = null;
    let minDistance = Infinity;

    if (!hobbit.visitedHistory) {
        hobbit.visitedHistory = [];
    }

    for (let d of dirs) {
        const nx = currX + d[0];
        const ny = currY + d[1];
        if (!isWalkableForHobbit(nx, ny, worldMatrix, roomMatrix, hobbit)) continue;

        const tileData = getTileData(nx * 16 + 8, ny * 16 + 8, worldMatrix, roomMatrix);
        const isRoad = tileData && (tileData.tileID === 337 || tileData.tileID === 208);

        const dist = Math.hypot(targetX - nx, targetY - ny);
        let perceivedDist = dist;
        
        if (isRoad) {
            perceivedDist -= 15; 
        }

        const historyIdx = hobbit.visitedHistory.indexOf(`${nx}_${ny}`);
        if (historyIdx !== -1) {
            const recencyFactor = historyIdx + 1; 
            perceivedDist += recencyFactor * 12; 
        }

        if (perceivedDist < minDistance) {
            minDistance = perceivedDist;
            bestStep = { x: nx, y: ny, isRoad: isRoad };
        }
    }
    return bestStep;
}

function findOffScreenPath(startTX, startTY, targetTX, targetTY) {
    const path = [];
    let curX = startTX;
    let curY = startTY;
    const maxSteps = 40; 

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

export function getHobbitVillage(hobbit) {
    const hx = hobbit.homeX || Math.floor(hobbit.x / 16);
    const hy = hobbit.homeY || Math.floor(hobbit.y / 16);
    
    if (typeof window !== 'undefined' && window.getVillageAt) {
        return window.getVillageAt(hx, hy);
    }
    return null;
}

function findHomeHayStorage(hobbit) {
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

function findNearestEgg(hobbit, range = 400) {
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

function giveItemToHobbit(hobbit, newItem) {
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

// ==========================================
// 🤝 HOBBIT AUTONOMOUS TRADING LOGIC
// ==========================================
function tryHobbitTrade(hobbit, cx, cy) {
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

// ==========================================
// 🪖 MILITARY HOSTILE RESOLVER
// ==========================================
function findMilitaryTarget(hobbit, myWell, myWellOwner) {
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

// ==========================================
// 🤝 HOBBIT SPAWNING
// ==========================================

export function spawnHobbit(gx, gy, houseId = null, homeX = null, homeY = null, defaultJob = 'Forager') {
    const seed = (gx * 31) + gy;
    const hash = Math.abs(Math.sin(seed) * 10000);
    const firstName = HOBBIT_FIRST_NAMES[Math.floor(hash) % HOBBIT_FIRST_NAMES.length];
    const lastName = HOBBIT_LAST_NAMES[Math.floor(hash * 10) % HOBBIT_LAST_NAMES.length];
    const proceduralName = `${firstName} ${lastName}`;

    const keyItem = houseId ? {
        name: `Key to House #${houseId}`,
        seedType: "key",
        spriteID: 38,
        tileset: "keyTileset",
        isKey: true,
        houseId: houseId,
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0,
        count: 1,
        maxStack: 1
    } : null;

    hobbits.push({
        id: 'hobbit_' + Math.random().toString(36).substr(2, 9),
        name: proceduralName, 
        job: defaultJob,       
        isHobbit: true,
        x: gx * 16, 
        y: gy * 16,
        floor: 1,
        speed: 35,
        
        hp: 40, 
        maxHp: 40,
        ad: 2, 
        
        energy: 100,
        maxEnergy: 100,

        inventory: keyItem ? [keyItem] : [], 
        houseId: houseId,
        homeX: homeX,
        homeY: homeY,
        
        doorX: houseId ? homeX - 1 : null,  
        doorY: houseId ? homeY + 1 : null,  
        
        chestX: houseId ? homeX - 2 : null, 
        chestY: houseId ? homeY : null,     

        hitboxLeft: 4,
        hitboxRight: 12, 
        hitboxTop: 10,
        hitboxBottom: 15,

        state: 'idle',     
        goal: 'wander',    
        dir: 'South',
        frame: 0,
        animTimer: 0,
        moveTimer: Math.random() * 3,
        pathTimer: 0,      
        attackTimer: 0,    
        path: [],
        targetPlant: null, 
        visitedHistory: [], 
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5
    });
}

// ==========================================
// ⚙️ MAIN AI BEHAVIOR LOOP
// ==========================================

export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    const focus = getFocusCoordinates();
    const heroCX = Math.floor(focus.x / 1600);
    const heroCY = Math.floor(focus.y / 1600);
    const now = Date.now();

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

    hobbits.forEach(hobbit => {
        const hobbitCX = Math.floor(hobbit.x / 1600);
        const hobbitCY = Math.floor(hobbit.y / 1600);

        const isInsideActiveChunks = Math.abs(hobbitCX - heroCX) <= 1 && Math.abs(hobbitCY - heroCY) <= 1;
        if (!isInsideActiveChunks) return;

        if (!hobbit.lastUpdated) hobbit.lastUpdated = now;
        let deltaSeconds = (now - hobbit.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0;
        hobbit.lastUpdated = now;

        // Catch-up simulation loops
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
                        simX = next.x;
                        simY = next.y;
                    }
                } else if (hobbit.job === 'Trader' && hobbit.houseId) {
                    const doorKey = `${hobbit.doorX}_${hobbit.doorY}`;
                    const doorState = doorStates.get(doorKey);
                    const isLocked = doorState ? doorState.locked : true;

                    if (!worldTime.isNight) {
                        if (isLocked) {
                            if (simX !== hobbit.doorX || simY !== hobbit.doorY) {
                                const next = estimateCatchUpStep(simX, simY, hobbit.doorX, hobbit.doorY);
                                simX = next.x;
                                simY = next.y;
                            }
                        }
                    } else {
                        if (!isLocked) {
                            if (simX !== hobbit.doorX || simY !== hobbit.doorY) {
                                const next = estimateCatchUpStep(simX, simY, hobbit.doorX, hobbit.doorY);
                                simX = next.x;
                                simY = next.y;
                            }
                        } else {
                            if (simX !== hobbit.homeX && simY !== hobbit.homeY) {
                                const next = estimateCatchUpStep(simX, simY, hobbit.homeX, hobbit.homeY);
                                simX = next.x;
                                simY = next.y;
                            }
                        }
                    }
                } else if (worldTime.isNight && hobbit.houseId) {
                    if (simX !== hobbit.homeX || simY !== hobbit.homeY) {
                        const next = estimateCatchUpStep(simX, simY, hobbit.homeX, hobbit.homeY);
                        simX = next.x;
                        simY = next.y;
                    }
                } else {
                    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
                    const valid = dirs.filter(d => isWalkableForHobbit(simX + d[0], simY + d[1], worldMatrix, roomMatrix, hobbit));
                    if (valid.length > 0) {
                        const pick = valid[Math.floor(Math.random() * valid.length)];
                        simX += pick[0];
                        simY += pick[1];
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
                            const foodToEat = { ...foodItem, count: 1 };
                            if (foodItem.count <= 0) {
                                chestItems.splice(foodIdx, 1);
                            }
                            if (socket && socket.connected) {
                                socket.emit('updateChest', { chestId, items: chestItems });
                            }
                            giveItemToHobbit(hobbit, foodToEat);
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
                            const path = findOffScreenPath(currTX, currTY, targetWell.x, targetWell.y);
                            if (path) {
                                hobbit.path = path;
                                hobbit.goal = 'march';
                            }
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

                if (hobbit.path && hobbit.path.length > 0) {
                    const nextNode = hobbit.path.shift();
                    hobbit.x = nextNode.x * 16;
                    hobbit.y = nextNode.y * 16;

                    // Tabu Memory system
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
                    else if (hobbit.goal === 'unlock_door' && hobbit.x === hobbit.doorX * 16 && hobbit.y === hobbit.doorY * 16) {
                        if (socket && socket.connected) {
                            socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: false });
                        }
                        hobbit.path = [];
                    }
                    else if (hobbit.goal === 'lock_door' && hobbit.x === hobbit.doorX * 16 && hobbit.y === hobbit.doorY * 16) {
                        if (socket && socket.connected) {
                            socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: true });
                        }
                        hobbit.path = [];
                    }
                    else if (hobbit.goal === 'deposit' && hobbit.x === hobbit.chestX * 16 && hobbit.y === hobbit.chestY * 16) {
                        hobbit.inventory = hobbit.inventory.filter(i => i.isKey);
                        hobbit.path = [];
                    }
                }

                if (Math.random() > 0.8) {
                    import('./bacteria.js').then(m => m.seedBacteria(currTX, currTY, "chicken_poop", 3, 12));
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
        let isVillageContested = false;
        let villageOwner = null;

        if (village && typeof window !== 'undefined' && window.villageOwners) {
            const data = window.villageOwners.get(`${village.x}_${village.y}`);
            if (data) {
                villageOwner = data.owner;
            }
        }

        let enemyTarget = null; 
        let enemyDist = Infinity;

        // ==========================================
        // ⚔️ MILITARY JOB STATE MACHINE (MINION LANE-MARCH)
        // ==========================================
        if (hobbit.job === 'Military') {
            const homeWell = hobbit.cachedWell || getHobbitVillage(hobbit);
            let myWellOwner = null;

            if (homeWell && window.villageOwners) {
                const data = window.villageOwners.get(`${homeWell.x}_${homeWell.y}`);
                if (data) {
                    myWellOwner = data.owner;
                }
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
                        // Throttled long-range paths to prevent planning loops on blockage
                        if (hobbit.pathTimer <= 0) {
                            const path = findPathToFarTarget(currTX, currTY, targetWell.x, targetWell.y, worldMatrix, roomMatrix, hobbit, 400);
                            if (path && path.length > 0) {
                                hobbit.path = path;
                                hobbit.state = 'walking';
                                hobbit.pathTimer = 0; 
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                hobbit.pathTimer = 1.5 + Math.random() * 1.0; 
                            }
                        } else {
                            hobbit.state = 'idle';
                            if (Math.random() > 0.98) {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                if (hobbit.path.length > 0) hobbit.state = 'walking';
                            }
                        }
                    }
                } else {
                    if (!hobbit.path || hobbit.path.length === 0) {
                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                    }
                }
            }
        }

        // ==========================================
        // ⚔️ CONTESTED DEFENDER AI STATE MACHINES
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

            // ==========================================
            // 🌾 PEACEFUL UTILITIES & FULFILMENTS
            // ==========================================
            if (!isDefending) {
                let target = null;
                let targetDist = Infinity;

                const px = (hero.x + 8) - (hobbit.x + 8);
                const py = (hero.y + 8) - (hobbit.y + 8);
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
                        if (Math.abs(tdx) > Math.abs(tdy)) {
                            hobbit.dir = tdx > 0 ? 'East' : 'West';
                        } else {
                            hobbit.dir = tdy > 0 ? 'South' : 'North';
                        }
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
                            hobbit.state = 'walking';
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.goal = 'wander';
                            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                        }
                    }
                } 
                else if (hobbit.energy < 30) {
                    const ate = eatFoodIfAvailable(hobbit);
                    if (!ate) {
                        if (hobbit.houseId && hobbit.chestX !== null) {
                            hobbit.goal = 'get_food_from_chest';
                            const depositTX = hobbit.chestX + 1;
                            const depositTY = hobbit.chestY;

                            if (currTX === depositTX && currTY === depositTY) {
                                hobbit.state = 'idle';
                                hobbit.path = [];
                                
                                const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                                if (!chestCache.has(chestId)) {
                                    if (socket && socket.connected) {
                                        socket.emit('requestChest', chestId);
                                    }
                                } else {
                                    const chestItems = chestCache.get(chestId) || [];
                                    const foodIdx = chestItems.findIndex(i => HOBBIT_FOOD_VALUES[i.seedType] !== undefined);
                                    if (foodIdx !== -1) {
                                        const foodItem = chestItems[foodIdx];
                                        foodItem.count--;
                                        const foodToEat = { ...foodItem, count: 1 };
                                        if (foodItem.count <= 0) {
                                            chestItems.splice(foodIdx, 1);
                                        }
                                        if (socket && socket.connected) {
                                            socket.emit('updateChest', { chestId, items: chestItems });
                                        }
                                        giveItemToHobbit(hobbit, foodToEat);
                                        eatFoodIfAvailable(hobbit);
                                        console.log(`📦 ${hobbit.name} withdrew food from chest and ate it.`);
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
                            } else if (roomID === hobbit.houseId) {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 1.5 + Math.random() * 1.5; 
                                    const path = findPathToCoords(currTX, currTY, depositTX, depositTY, worldMatrix, roomMatrix, hobbit, 20); 
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.state = 'walking';
                                    } else {
                                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                        hobbit.goal = 'wander';
                                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                                    }
                                }
                            } else if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                    hobbit.path = [
                                        { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                        { x: hobbit.homeX, y: hobbit.homeY }
                                    ];
                                    hobbit.state = 'walking';
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
                                const keyName = yieldMap[livePlant.type];
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
                                    console.log(`🏪 ${hobbit.name} (Trader) unlocked the General Store door.`);
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
                                    console.log(`🏪 ${hobbit.name} (Trader) locked the General Store door for the night.`);
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
                            if (!storeDbCache.has(storeDataId)) {
                                if (socket && socket.connected) {
                                    socket.emit('requestStore', storeDataId);
                                }
                            }

                            if (roomID === storeId) {
                                const dist = Math.hypot((standX * 16 + 8) - (hobbit.x + 8), (standY * 16 + 8) - (hobbit.y + 8));
                                if (dist <= 24) {
                                    hobbit.state = 'idle';
                                    hobbit.path = [];
                                    
                                    if (hobbit.pathTimer <= 0) {
                                        hobbit.pathTimer = 2.0; 
                                        if (socket && socket.connected) {
                                            socket.emit('requestStore', storeDataId);
                                        }
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
                                                } else {
                                                    console.log("🔒 Barn Hay Storage is full! Remaining items kept in backpack.");
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
                                if (chunkData) {
                                    chunkData[idx] = 0;
                                }

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
                                if (!storeDbCache.has(storeDataId)) {
                                    if (socket && socket.connected) {
                                        socket.emit('requestStore', storeDataId);
                                    }
                                }

                                if (roomID === storeId) {
                                    const dist = Math.hypot((standX * 16 + 8) - (hobbit.x + 8), (standY * 16 + 8) - (hobbit.y + 8));
                                    if (dist <= 24) {
                                        hobbit.state = 'idle';
                                        hobbit.path = [];

                                        if (hobbit.pathTimer <= 0) {
                                            hobbit.pathTimer = 2.0;
                                            if (socket && socket.connected) {
                                                socket.emit('requestStore', storeDataId);
                                            }
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
                                    if (socket && socket.connected) {
                                        socket.emit('requestChest', chestId);
                                    }
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
                                        
                                        console.log(`📦 ${hobbit.name} (Forager) withdrew ${amountToWithdraw}x Plant Matter from chest to go trade.`);
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
                                    if (socket && socket.connected) {
                                        socket.emit('requestChest', chestId);
                                    }
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
                                            } else {
                                                console.log("🔒 Chest is full! Remaining items kept in backpack.");
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
                        else {
                            if (hobbit.goal === 'wander' && hobbit.moveTimer > 0) {
                                hobbit.moveTimer -= modifier;
                                if (hobbit.moveTimer <= 0) {
                                    hobbit.goal = 'harvest'; 
                                }
                                
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
                                            hobbit.path = [
                                                { x: hobbit.doorX, y: hobbit.doorY + 1 } 
                                            ];
                                            hobbit.state = 'walking';
                                            console.log(`🚪 ${hobbit.name} is clearing the threshold to the outside...`);
                                        }
                                        else if (currTX === doorInX && currTY === doorInY) {
                                            hobbit.path = [
                                                { x: hobbit.doorX, y: hobbit.doorY } 
                                            ];
                                            hobbit.state = 'walking';
                                            console.log(`🚪 ${hobbit.name} is stepping outside to harvest...`);
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
                                                console.log(`🌾 Hobbit harvesting mature ${livePlant.type} at [${livePlant.gx}, ${livePlant.gy}]`);

                                                const keyName = yieldMap[livePlant.type];
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
                                    if (path) {
                                        hobbit.path = path;
                                    }
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
        // 🏃 MOTOR & MOVEMENT EXECUTION LOOP
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
                        console.log(`💥 ${hobbit.name} dealt ${hobbit.ad} damage to ${currentEnemy.name || 'target'}!`);
                        
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
        else if (hobbit.path && hobbit.path.length > 0 && hobbit.state === 'walking') {
            const nextNode = hobbit.path[0];
            const targetX = nextNode.x * 16;
            const targetY = nextNode.y * 16;

            const dx = targetX - hobbit.x;
            const dy = targetY - hobbit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const angle = Math.atan2(dy, dx);
            let positiveAngle = angle;
            if (positiveAngle < 0) {
                positiveAngle += Math.PI * 2;
            }
            const octant = Math.round(8 * positiveAngle / (Math.PI * 2)) % 8;
            const directions = ['East', 'SouthEast', 'South', 'SouthWest', 'West', 'NorthWest', 'North', 'NorthEast'];
            
            hobbit.dir = directions[octant] || 'South';

            if (dist > 2) {
                const moveX = (dx / dist) * hobbit.speed * modifier;
                const moveY = (dy / dist) * hobbit.speed * modifier;

                const moved = moveEntity(hobbit, moveX, moveY, worldMatrix, roomMatrix);
                
                // Stuck Detection Engine: wipe path if sliding against physically unpassable collisions for more than 0.5 seconds
                if (!moved) {
                    hobbit.stuckTimer = (hobbit.stuckTimer || 0) + modifier;
                    if (hobbit.stuckTimer > 0.5) {
                        hobbit.path = [];
                        hobbit.state = 'idle';
                        hobbit.pathTimer = 1.0 + Math.random() * 1.0; 
                        hobbit.stuckTimer = 0;
                    }
                } else {
                    hobbit.stuckTimer = 0;
                }
            } else {
                hobbit.x = targetX;
                hobbit.y = targetY;

                if (!hobbit.visitedHistory) hobbit.visitedHistory = [];
                const tileKey = `${nextNode.x}_${nextNode.y}`;
                if (hobbit.visitedHistory[hobbit.visitedHistory.length - 1] !== tileKey) {
                    hobbit.visitedHistory.push(tileKey);
                    if (hobbit.visitedHistory.length > 32) {
                        hobbit.visitedHistory.shift();
                    }
                }

                hobbit.path.shift(); 
            }

            hobbit.animTimer += modifier * 8;
            hobbit.frame = Math.floor(hobbit.animTimer) % 4; 
        } else {
            hobbit.state = 'idle';
        }

        if (hobbit.pathTimer > 0) {
            hobbit.pathTimer -= modifier;
        }
        if (hobbit.attackTimer > 0) {
            hobbit.attackTimer -= modifier;
        }
    });
}