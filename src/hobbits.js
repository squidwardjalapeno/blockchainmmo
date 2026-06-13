// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 
import { getObjectAt, staticObjects, solidTiles } from './staticObjects.js';
import { socket, doorStates, storeDbCache, playerWallet } from './multiplayer.js';
import { worldTime } from './clock.js'; 
import { plants, PLANT_DEFS, createPlant } from './plants.js';
import { ITEM_TYPES, createItem } from './items.js';
import { getBacteriaData } from './bacteria.js';

export const hobbits = [];
export const chestCache = new Map(); // Dynamic network mirrors of chest inventories

// Add these arrays to the top of src/hobbits.js:
const HOBBIT_FIRST_NAMES = ["Bilbo", "Frodo", "Samwise", "Merry", "Pippin", "Bango", "Bungo", "Drogo", "Hamfast", "Longo", "Olo", "Paladin", "Rufus", "Sancho", "Tobold", "Wilibald"];
const HOBBIT_LAST_NAMES = ["Baggins", "Gamgee", "Brandybuck", "Took", "Gardner", "Greenhand", "Grubb", "Chubb", "Proudfoot", "Bolger", "Boffin", "Sandyman", "Cotton", "Twofoot", "Underhill", "Hornblower"];

export const storeDbCache = new Map(); // Dynamic network mirrors of store data

if (typeof window !== 'undefined') {
    import('./multiplayer.js').then(m => {
        const checkSocket = setInterval(() => {
            if (m.socket) {
                clearInterval(checkSocket);
                m.socket.on('chestData', (data) => {
                    chestCache.set(data.chestId, data.items);
                });
                m.socket.on('chestUpdated', (data) => {
                    chestCache.set(data.chestId, data.items);
                });
                // 🎯 THE FIX: Dynamically track store inventories
                m.socket.on('storeData', (data) => {
                    storeDbCache.set(data.storeId, data.data);
                });
                m.socket.on('storeUpdated', (data) => {
                    storeDbCache.set(data.storeId, data.data);
                });
            }
        }, 100);
    });
}

// Search for the nearest General Store trade counter
function findNearestStoreCounter(hobbit, range = 500) {
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

function tryHobbitTrade(hobbit, counterX, counterY) {
    const storeId = `store_${counterX}_${counterY}`;
    const storeData = storeDbCache.get(storeId);
    if (!storeData || !storeData.listings) return false;

    const keys = hobbit.inventory.filter(i => i.isKey);
    const pmItem = hobbit.inventory.find(i => i.seedType === 'plant_matter');

    if (hobbit.job === 'Forager' && pmItem) {
        // Forager buys FOOD from the player's active market using PLANT_MATTER
        const match = storeData.listings.find(l => 
            l.wantedType === 'plant_matter' && 
            ['egg', 'tomato_item', 'turnip_item', 'strawberry_item', 'corn_item', 'potato_item', 'watermelon_item', 'pumpkin_item', 'eggplant_item', 'pineapple_item', 'wheat_item'].includes(l.offeredItem.seedType)
        );

        if (match) {
            pmItem.count--;
            if (pmItem.count <= 0) {
                hobbit.inventory = hobbit.inventory.filter(i => i !== pmItem);
            }

            const foodItem = createItem(ITEM_TYPES[match.offeredItem.seedType.toUpperCase()]);
            hobbit.inventory.push(foodItem);

            if (socket && socket.connected) {
                socket.emit('buyListing', {
                    storeId,
                    listingId: match.id,
                    buyerWallet: playerWallet,
                    paymentItem: createItem(ITEM_TYPES.PLANT_MATTER)
                });
            }
            return true;
        }
    } 
    return false;
}
const yieldMap = {
    'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM',
    'eggplant': 'EGGPLANT_ITEM', 'strawberry': 'STRAWBERRY_ITEM',
    'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
    'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM',
    'potato': 'POTATO_ITEM', 'wheat': 'WHEAT_ITEM',
    'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
    'violet': 'PLANT_MATTER', 'sunflower': 'PLANT_MATTER'
};

export function spawnHobbit(gx, gy, houseId = null, homeX = null, homeY = null, defaultJob = 'Forager') {

    // Generate deterministic name using coordinate-based hashing
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
        pathTimer: 0,      // 🎯 THE FIX: Pathfinder cooldown timer
        attackTimer: 0,    
        path: [],
        targetPlant: null, 
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5
    });
}

// Replace isWalkableForHobbit inside src/hobbits.js:
function isWalkableForHobbit(tx, ty, worldMatrix, roomMatrix, hobbit = null, fromX = null, fromY = null) {
    if (solidTiles.has(`${tx}_${ty}`)) return false;

    const obj = getObjectAt(tx, ty);
    if (obj && obj.type === 'FOREST_TREE') return false;
    const leftObj = getObjectAt(tx - 1, ty);
    if (leftObj && leftObj.type === 'FOREST_TREE') return false;

    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;

    // Solid wall tiles must ALWAYS block pathfinding to force doorway usage
    const absoluteWalls = [40, 50, 52, 1, 3, 5, 41, 43, 27, 46, 47, 17, 18, 19, 21, 24];
    if (absoluteWalls.includes(data.tileID)) return false;

    // 🎯 THE FIX: Force the pathfinder to respect room boundaries, matching physics.js
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
// Update assignRandomWalk inside src/hobbits.js:
function assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkableForHobbit(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix, hobbit));
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        hobbit.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

// Update findPathToCoords inside src/hobbits.js:
function findPathToCoords(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit = null) {
    const queue = [{ x: startTX, y: startTY, path: [] }];
    const visited = new Set([`${startTX}_${startTY}`]);
    const maxDepth = 40; 

    while (queue.length > 0) {
        const curr = queue.shift();

        if (curr.x === targetTX && curr.y === targetTY) {
            return curr.path;
        }

        if (curr.path.length >= maxDepth) continue;

        const neighbors = [
            { x: curr.x, y: curr.y - 1 }, { x: curr.x, y: curr.y + 1 },
            { x: curr.x - 1, y: curr.y }, { x: curr.x + 1, y: curr.y }
        ];

        // Update only the neighbor-loop block inside findPathToCoords in src/hobbits.js:
        for (let n of neighbors) {
            const key = `${n.x}_${n.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                // 🎯 THE FIX: Pass curr.x, curr.y as the fromX, fromY parameters to evaluate boundaries
                if (isWalkableForHobbit(n.x, n.y, worldMatrix, roomMatrix, hobbit, curr.x, curr.y)) {
                    queue.push({ x: n.x, y: n.y, path: [...curr.path, { x: n.x, y: n.y }] });
                }
            }
        }
    }
    return null;
}

function findNearestMaturePlant(hobbit, range = 160) {
    let nearest = null;
    let minDist = Infinity;
    
    for (let [key, plant] of plants) {
        const px = plant.gx * 16 + 8;
        const py = plant.gy * 16 + 8;
        const dx = px - hobbit.x;
        const dy = py - hobbit.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < range && dist < minDist) {
            const def = PLANT_DEFS[plant.type];
            if (def) {
                // If the plant is fully grown (100%), it is ready for harvest
                if (plant.growth >= 100) {
                    minDist = dist;
                    nearest = plant;
                }
            }
        }
    }
    return nearest;
}

export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);
    const now = Date.now();

    // ==========================================
    // 💀 CLEANUP DEAD HOBBITS & DROP LOOT
    // ==========================================
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

        // ==========================================
        // ❄️ TIER 3: FROZEN ZONE (Outside 3x3 Chunks)
        // ==========================================
        const isInsideActiveChunks = Math.abs(hobbitCX - heroCX) <= 1 && Math.abs(hobbitCY - heroCY) <= 1;
        if (!isInsideActiveChunks) return;

        // Initialize elapsed time
        if (!hobbit.lastUpdated) hobbit.lastUpdated = now;
        let deltaSeconds = (now - hobbit.lastUpdated) / 1000;
        if (deltaSeconds < 0) deltaSeconds = 0;
        hobbit.lastUpdated = now;

        // ==========================================
        // 🕰️ TIER 3: CATCH-UP (Step-In Fast Forward)
        // ==========================================
        if (deltaSeconds > 2.0) {
            let timeRemaining = Math.min(deltaSeconds, 86400); 
            let simX = Math.floor(hobbit.x / 16);
            let simY = Math.floor(hobbit.y / 16);

            while (timeRemaining > 0) {
                const stepTime = Math.min(30.0, timeRemaining);
                timeRemaining -= stepTime;

                const hx = hero.x + 8;
                const hy = hero.y + 8;
                const px = hx - (simX * 16 + 8);
                const py = hy - (simY * 16 + 8);
                const distToHero = Math.hypot(px, py);

                if (distToHero < 80 && hero.hp > 0) {
                    if (distToHero <= 24) {
                        hero.hp = Math.max(0, hero.hp - hobbit.ad);
                        if (socket && socket.connected) {
                            socket.emit('updateStats', { hp: hero.hp });
                        }
                    } else {
                        const hTX = Math.floor(hx / 16);
                        const hTY = Math.floor(hy / 16);
                        const path = findPathToCoords(simX, simY, hTX, hTY, worldMatrix, roomMatrix, hobbit);
                        if (path && path.length > 0) {
                            const next = path[Math.min(path.length - 1, 3)]; 
                            simX = next.x;
                            simY = next.y;
                        }
                    }
                } else if (hobbit.job === 'Trader' && hobbit.houseId) {
                    const doorKey = `${hobbit.doorX}_${hobbit.doorY}`;
                    const doorState = doorStates.get(doorKey);
                    const isLocked = doorState ? doorState.locked : true;

                    if (!worldTime.isNight) {
                        if (isLocked) {
                            if (simX !== hobbit.doorX || simY !== hobbit.doorY) {
                                const path = findPathToCoords(simX, simY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
                                if (path && path.length > 0) {
                                    const next = path[Math.min(path.length - 1, 3)];
                                    simX = next.x; simY = next.y;
                                }
                            }
                        }
                    } else {
                        if (!isLocked) {
                            if (simX !== hobbit.doorX || simY !== hobbit.doorY) {
                                const path = findPathToCoords(simX, simY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
                                if (path && path.length > 0) {
                                    const next = path[Math.min(path.length - 1, 3)];
                                    simX = next.x; simY = next.y;
                                }
                            }
                        } else {
                            if (simX !== hobbit.homeX || simY !== hobbit.homeY) {
                                const path = findPathToCoords(simX, simY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit);
                                if (path && path.length > 0) {
                                    const next = path[Math.min(path.length - 1, 3)];
                                    simX = next.x; simY = next.y;
                                }
                            }
                        }
                    }
                } else if (worldTime.isNight && hobbit.houseId) {
                    if (simX !== hobbit.homeX || simY !== hobbit.homeY) {
                        const path = findPathToCoords(simX, simY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit);
                        if (path && path.length > 0) {
                            const next = path[Math.min(path.length - 1, 3)];
                            simX = next.x;
                            simY = next.y;
                        }
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

        // Viewport presence calculation
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

                const currTX = Math.floor((hobbit.x + 8) / 16);
                const currTY = Math.floor((hobbit.y + 8) / 16);

                let target = null;
                let targetDist = Infinity;
                const px = (hero.x + 8) - (hobbit.x + 8);
                const py = (hero.y + 8) - (hobbit.y + 8);
                const distToHero = Math.hypot(px, py);

                if (distToHero < 80 && hero.hp > 0) {
                    target = hero;
                    targetDist = distToHero;
                }

                if (!hobbit.path || hobbit.path.length === 0) {
                    if (target && targetDist > 20) {
                        const tTX = Math.floor((target.x + 8) / 16);
                        const tTY = Math.floor((target.y + 8) / 16);
                        const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix, hobbit);
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
                            if (isLocked) {
                                if (distToDoor <= 1) {
                                    if (socket && socket.connected) {
                                        socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: false });
                                    }
                                } else {
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.goal = 'unlock_door';
                                    }
                                }
                            } else {
                                assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                                hobbit.goal = 'wander';
                            }
                        } else {
                            if (!isLocked) {
                                if (distToDoor <= 1) {
                                    if (socket && socket.connected) {
                                        socket.emit('setDoorLock', { gx: hobbit.doorX, gy: hobbit.doorY, locked: true });
                                    }
                                } else {
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.goal = 'lock_door';
                                    }
                                }
                            } else {
                                if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                                    hobbit.goal = 'sleep';
                                } else {
                                    const path = findPathToCoords(currTX, currTY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit);
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
                                const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'gohome';
                                }
                            }
                        }
                    } else if (hobbit.job === 'Forager') {
                        const hasLoot = hobbit.inventory.some(item => !item.isKey);
                        if (hasLoot) {
                            if (currTX !== hobbit.homeX || currTY !== hobbit.homeY) {
                                if (currTX === hobbit.doorX && currTY === hobbit.doorY) {
                                    hobbit.path = [
                                        { x: hobbit.doorX, y: hobbit.doorY - 1 },
                                        { x: hobbit.homeX, y: hobbit.homeY }
                                    ];
                                    hobbit.goal = 'deposit';
                                } else {
                                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
                                    if (path) {
                                        hobbit.path = path;
                                        hobbit.goal = 'deposit';
                                    }
                                }
                            }
                        } else {
                            const nearest = findNearestMaturePlant(hobbit);
                            if (nearest) {
                                const path = findPathToCoords(currTX, currTY, nearest.gx, nearest.gy, worldMatrix, roomMatrix, hobbit);
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

                    const currentDistToHero = Math.hypot((hero.x + 8) - (hobbit.x + 8), (hero.y + 8) - (hobbit.y + 8));
                    if (hobbit.goal === 'engage' && currentDistToHero <= 24) {
                        if (hero.hp > 0) {
                            hero.hp = Math.max(0, hero.hp - hobbit.ad);
                            if (socket && socket.connected) {
                                socket.emit('updateStats', { hp: hero.hp });
                            }
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
            }
            return; 
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time)
        // ==========================================
        const currTX = Math.floor((hobbit.x + 8) / 16);
        const currTY = Math.floor((hobbit.y + 15) / 16); 
        const pCol = roomMatrix[Math.floor(currTX / 100)]?.[Math.floor(currTY / 100)];
        const roomID = pCol ? pCol[((currTY % 100 + 100) % 100 * 100) + ((currTX % 100 + 100) % 100)] : 0;

        let target = null;
        let targetDist = Infinity;

        const px = (hero.x + 8) - (hobbit.x + 8);
        const py = (hero.y + 8) - (hobbit.y + 8);
        const distToHero = Math.hypot(px, py);

        if (distToHero < 80 && hero.hp > 0) {
            target = hero;
            targetDist = distToHero;
        }

        // Pathfinder Rate-Limiting Tick Down
        if (hobbit.pathTimer > 0) {
            hobbit.pathTimer -= modifier;
        }

        // --- CORE BEHAVIORAL GOAL ALLOCATOR ---
        if (target && targetDist <= 20) {
            hobbit.goal = 'engage';
            if (hobbit.state !== 'attacking') {
                hobbit.state = 'attacking';
                hobbit.frame = 0;
                hobbit.animTimer = 0;
                hobbit.attackTimer = 0.5; 
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
                hobbit.pathTimer = 2.0; 
                const tTX = Math.floor((target.x + 8) / 16);
                const tTY = Math.floor((target.y + 8) / 16);
                const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix, hobbit);
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
                            hobbit.pathTimer = 2.0;
                            const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
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
                            hobbit.pathTimer = 2.0;
                            const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
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
                    hobbit.goal = 'sleep';
                    if (currTX === hobbit.homeX && currTY === hobbit.homeY) {
                        hobbit.state = 'idle';
                        hobbit.path = [];
                    } else {
                        if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                            hobbit.pathTimer = 2.0;
                            const path = findPathToCoords(currTX, currTY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix, hobbit);
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
                    hobbit.pathTimer = 2.0;
                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
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
            // ==========================================
            // 🌾 DAYTIME TASK ALLOCATOR (Job Sensitive)
            // ==========================================
            if (hobbit.job === 'Forager') {
                const hasPM = hobbit.inventory.some(i => i.seedType === 'plant_matter');
                const hasOtherLoot = hobbit.inventory.some(i => !i.isKey && i.seedType !== 'plant_matter');
                
                const chestId = `chest_${hobbit.chestX}_${hobbit.chestY}`;
                const chestItems = chestCache.get(chestId) || [];
                const isChestFull = (chestItems.length >= 8);

                // 🎯 State 1: We have Plant Matter and the chest is full -> Go trade it at the General Store!
                if (hasPM && isChestFull) {
                    hobbit.goal = 'sell_pm';
                    const counter = findNearestStoreCounter(hobbit);
                    if (counter) {
                        // Resolve the store room ID and doorway coordinates dynamically
                        const storeId = getTileData(counter.x * 16 + 8, counter.y * 16 + 8, worldMatrix, roomMatrix).roomID;
                        const storeDoorX = counter.x - 1;
                        const storeDoorY = counter.y + 2;
                        const standX = counter.x;
                        const standY = counter.y + 1;

                        // 🎯 HOUSE DOORWAY LOGIC: Check if we are already inside the General Store room
                        if (roomID === storeId) {
                            const dist = Math.hypot((standX * 16 + 8) - (hobbit.x + 8), (standY * 16 + 8) - (hobbit.y + 8));
                            if (dist <= 24) {
                                hobbit.state = 'idle';
                                hobbit.path = [];

                                const tradedMarket = tryHobbitTrade(hobbit, counter.x, counter.y);

                                if (!tradedMarket) {
                                    const keys = hobbit.inventory.filter(i => i.isKey);
                                    const pmCount = hobbit.inventory.filter(i => i.seedType === 'plant_matter').reduce((acc, i) => acc + (i.count || 1), 0);
                                    if (pmCount > 0) {
                                        const cropList = ['egg', 'tomato_item', 'turnip_item', 'strawberry_item', 'corn_item', 'potato_item'];
                                        const randomFood = cropList[Math.floor(Math.random() * cropList.length)];
                                        const foodItem = createItem(ITEM_TYPES[randomFood.toUpperCase()]);
                                        foodItem.count = pmCount;
                                        hobbit.inventory = [...keys, foodItem];
                                        console.log(`🏪 ${hobbit.name} (Forager) traded ${pmCount}x Plant Matter for food at General Store.`);
                                    }
                                }
                            } else {
                                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                    hobbit.pathTimer = 2.0;
                                    const path = findPathToCoords(currTX, currTY, standX, standY, worldMatrix, roomMatrix, hobbit);
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
                        // 🎯 HOUSE DOORWAY LOGIC: If standing exactly in the store doorway, step inside
                        else if (currTX === storeDoorX && currTY === storeDoorY) {
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                                hobbit.path = [
                                    { x: storeDoorX, y: storeDoorY - 1 }, // Step 1 tile inside
                                    { x: standX, y: standY }              // Head to the counter stand tile
                                ];
                                hobbit.state = 'walking';
                                console.log(`🚪 ${hobbit.name} is crossing the General Store doorway...`);
                            }
                        } 
                        // 🎯 HOUSE DOORWAY LOGIC: Otherwise, pathfind to the store door first
                        else {
                            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                                hobbit.pathTimer = 2.0;
                                const path = findPathToCoords(currTX, currTY, storeDoorX, storeDoorY, worldMatrix, roomMatrix, hobbit);
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
                // 🎯 State 2: Chest is full, but we have NO Plant Matter in inventory -> Go withdraw it from the home chest!
                else if (isChestFull && !hasPM && !hasOtherLoot) {
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
                            hobbit.pathTimer = 2.0;
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
                // 🎯 State 3: We have other loot (seeds/crops) to deposit, deposit normally
                else if (hasOtherLoot || (hasPM && !isChestFull)) {
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
                            const keyItems = hobbit.inventory.filter(item => item.isKey);

                            depositItems.forEach(dep => {
                                const existing = chestItems.find(i => i.seedType === dep.seedType && i.count < (i.maxStack || 8));
                                if (existing) {
                                    const space = (existing.maxStack || 8) - existing.count;
                                    if (dep.count <= space) {
                                        existing.count += dep.count;
                                    } else {
                                        existing.count = existing.maxStack || 8;
                                        dep.count -= space;
                                        chestItems.push(dep);
                                    }
                                } else {
                                    chestItems.push(dep);
                                }
                            });

                            if (socket && socket.connected) {
                                socket.emit('updateChest', { chestId, items: chestItems });
                            }

                            hobbit.inventory = keyItems; 
                            console.log(`📦 Hobbit deposited harvest into house chest ${chestId}`);
                        }
                    }
                    else if (roomID === hobbit.houseId) {
                        if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking' && hobbit.pathTimer <= 0) {
                            hobbit.pathTimer = 2.0;
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
                            hobbit.pathTimer = 2.0;
                            const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix, hobbit);
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
                // 🎯 State 4: Inventory is empty, chest is not full -> Harvest normally
                else {
                    hobbit.goal = 'harvest';

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
                                const path = findPathToCoords(currTX, currTY, doorInX, doorInY, worldMatrix, roomMatrix, hobbit);
                                if (path) {
                                    hobbit.path = path;
                                }
                            }
                            hobbit.state = 'walking';
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
                                        hobbit.inventory.push(harvestedItem);
                                    }

                                    const seedKey = `${livePlant.type.toUpperCase()}_SEED`;
                                    if (ITEM_TYPES[seedKey] && Math.random() < 0.6) {
                                        const seedItem = createItem(ITEM_TYPES[seedKey]);
                                        hobbit.inventory.push(seedItem);
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
                                        hobbit.pathTimer = 2.0;
                                        const path = findPathToCoords(currTX, currTY, livePlant.gx, livePlant.gy, worldMatrix, roomMatrix, hobbit);
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
                            const path = findPathToCoords(currTX, currTY, doorInX, doorInY, worldMatrix, roomMatrix, hobbit);
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

        // State progression
        if (hobbit.state === 'attacking') {
            const oldTimer = hobbit.attackTimer;
            hobbit.attackTimer -= modifier;
            
            if (oldTimer > 0.25 && hobbit.attackTimer <= 0.25) {
                const hx = hero.x + 8;
                const hy = hero.y + 8;
                const hdist = Math.hypot(hx - (hobbit.x + 8), hy - (hobbit.y + 8));

                if (hdist <= 24 && hero.hp > 0) {
                    hero.hp = Math.max(0, hero.hp - hobbit.ad);
                    console.log(`💥 Hobbit dealt ${hobbit.ad} damage to you!`);
                    
                    if (socket && socket.connected) {
                        socket.emit('updateStats', { hp: hero.hp });
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
            const octant = Math.round(8 * angle / (2 * Math.PI) + 8) % 8;
            const directions = ['East', 'SouthEast', 'South', 'SouthWest', 'West', 'NorthWest', 'North', 'NorthEast'];
            
            hobbit.dir = directions[octant];

            if (dist > 2) {
                const moveX = (dx / dist) * hobbit.speed * modifier;
                const moveY = (dy / dist) * hobbit.speed * modifier;

                moveEntity(hobbit, moveX, moveY, worldMatrix, roomMatrix);
            } else {
                hobbit.x = targetX;
                hobbit.y = targetY;
                hobbit.path.shift(); 
            }

            hobbit.animTimer += modifier * 8;
            hobbit.frame = Math.floor(hobbit.animTimer) % 4; 
        } else {
            hobbit.state = 'idle';
        }
    });
}