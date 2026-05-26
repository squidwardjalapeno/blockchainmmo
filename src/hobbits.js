// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 
import { worldTime } from './game.js'; 
import { getObjectAt, staticObjects, solidTiles } from './staticObjects.js'; 
import { plants } from './plants.js';
import { bacteriaCells } from './bacteria.js'; 
import { syncInventoryWithServer } from './uiManager.js';

export const hobbits = [];

export function spawnHobbit(gx, gy) {
    hobbits.push({
        id: 'hobbit_' + Math.random().toString(36).substr(2, 9),
        isHobbit: true,
        x: gx * 16, 
        y: gy * 16,
        floor: 1,
        speed: 35,
        
        hp: 40, 
        maxHp: 40,
        ad: 2, 

        inventory: [],
        maxSlots: 4,       
        stamina: 100,      
        
        state: 'idle',     
        goal: 'wander',    
        dir: 'South',
        frame: 0,
        animTimer: 0,
        path: [],
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5,
        
        targetKeyCoords: null,
        assignedHouseId: null
    });
}

function findKeyOnGround(hobbitCX, hobbitCY, houseId) {
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const targetCX = hobbitCX + ox;
            const targetCY = hobbitCY + oy;
            const data = bacteriaCells.get(`${targetCX}_${targetCY}`);
            if (!data) continue;

            for (let idx = 0; idx < 10000; idx++) {
                const traits = data[idx];
                if (traits === 0) continue;
                
                const typeID = (traits >> 20) & 0xFF;
                const storedHouseId = traits & 0xFFFF;

                if (typeID === 61 && storedHouseId === houseId) {
                    return {
                        gx: (targetCX * 100) + (idx % 100),
                        gy: (targetCY * 100) + Math.floor(idx / 100)
                    };
                }
            }
        }
    }
    return null;
}

function findAnyKeyOnGround(hobbitCX, hobbitCY) {
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const targetCX = hobbitCX + ox;
            const targetCY = hobbitCY + oy;
            const data = bacteriaCells.get(`${targetCX}_${targetCY}`);
            if (!data) continue;

            for (let idx = 0; idx < 10000; idx++) {
                const traits = data[idx];
                if (traits === 0) continue;
                
                const typeID = (traits >> 20) & 0xFF;
                if (typeID === 61) { 
                    return {
                        gx: (targetCX * 100) + (idx % 100),
                        gy: (targetCY * 100) + Math.floor(idx / 100)
                    };
                }
            }
        }
    }
    return null;
}

function findMyHouseChest(houseId) {
    for (const [key, obj] of staticObjects) {
        if (obj.type === 'CHEST_STORAGE' && obj.houseId === houseId) {
            const gx = Math.floor(key / 10000);
            const gy = key % 10000;
            return { x: gx, y: gy };
        }
    }
    return null;
}

function findNearestStaticObject(currTX, currTY, type) {
    let nearest = null;
    let minDist = Infinity;

    for (const [key, obj] of staticObjects) {
        if (obj.type === type) {
            const gx = Math.floor(key / 10000);
            const gy = key % 10000;
            const dist = Math.abs(gx - currTX) + Math.abs(gy - currTY);
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: gx, y: gy, houseId: obj.houseId };
            }
        }
    }
    return nearest;
}

function findNearestMatureCrop(currTX, currTY) {
    let nearest = null;
    let minDist = Infinity;

    for (const [key, plant] of plants) {
        if (plant.growth >= 100) {
            const dist = Math.abs(plant.gx - currTX) + Math.abs(plant.gy - currTY);
            if (dist < minDist) {
                minDist = dist;
                nearest = plant;
            }
        }
    }
    return nearest;
}

function isWalkable(tx, ty, worldMatrix, roomMatrix) {
    if (solidTiles.has(`${tx}_${ty}`)) return false;

    const obj = getObjectAt(tx, ty);
    if (obj && obj.type === 'FOREST_TREE') return false;
    const leftObj = getObjectAt(tx - 1, ty);
    if (leftObj && leftObj.type === 'FOREST_TREE') return false;

    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;
    const solids = [40, 48, 50, 52, 17, 18, 19, 21, 22, 24, 27, 1, 3];
    if (solids.includes(data.tileID)) return false;
    return true;
}

// 🧠 THE FIX: Finds a walkable floor tile strictly INSIDE the same room/house
function findWalkableNeighborInRoom(targetX, targetY, targetRoomID, worldMatrix, roomMatrix) {
    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
    for (let d of dirs) {
        const tx = targetX + d[0];
        const ty = targetY + d[1];
        if (isWalkable(tx, ty, worldMatrix, roomMatrix)) {
            const rData = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
            // Accept the neighbor ONLY if its roomID matches the target chest/bed roomID
            if (rData && rData.roomID === targetRoomID) {
                return { x: tx, y: ty };
            }
        }
    }
    return { x: targetX, y: targetY }; // Fallback
}

// Simple legacy neighbor for crops/keys (which don't have rooms)
function findWalkableNeighbor(targetX, targetY, worldMatrix, roomMatrix) {
    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
    for (let d of dirs) {
        const tx = targetX + d[0];
        const ty = targetY + d[1];
        if (isWalkable(tx, ty, worldMatrix, roomMatrix)) {
            return { x: tx, y: ty };
        }
    }
    return { x: targetX, y: targetY }; 
}

function assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkable(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix));
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        hobbit.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

function findPathToCoords(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix) {
    const queue = [{ x: startTX, y: startTY, path: [] }];
    const visited = new Set([`${startTX}_${startTY}`]);
    const maxDepth = 80; 

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

        for (let n of neighbors) {
            const key = `${n.x}_${n.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                if (isWalkable(n.x, n.y, worldMatrix, roomMatrix)) {
                    queue.push({ x: n.x, y: n.y, path: [...curr.path, { x: n.x, y: n.y }] });
                }
            }
        }
    }
    return null;
}

export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);
    const now = Date.now();

    for (let i = hobbits.length - 1; i >= 0; i--) {
        if (hobbits[i].hp <= 0) {
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
        hobbit.lastUpdated = now;

        if (deltaSeconds > 2.0) {
            hobbit.x = hobbit.x;
            hobbit.y = hobbit.y;
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

        let shouldProcessAI = false;
        if (!inViewport) {
            hobbit.slowTickTimer -= modifier;
            if (hobbit.slowTickTimer <= 0) {
                hobbit.slowTickTimer = 1.5;
                shouldProcessAI = true;
            }
        } else {
            shouldProcessAI = true;
        }

        if (shouldProcessAI) {
            const currTX = Math.floor((hobbit.x + 8) / 16);
            const currTY = Math.floor((hobbit.y + 8) / 16);

            // Fetch the Hobbit's current room ID directly from physics
            const currentRoomID = getTileData(hobbit.x + 8, hobbit.y + 15, worldMatrix, roomMatrix).roomID;

            // ==========================================
            // 🧠 CORE MOTIVES & STATE DECISION TREE
            // ==========================================
            if (worldTime.isNight && hobbit.goal !== 'sleep' && hobbit.goal !== 'get_key') {
                hobbit.path = []; 
                hobbit.state = 'idle';
                hobbit.goal = 'sleep';
            }

            if (worldTime.isNight) {
                hobbit.stamina = Math.max(0, hobbit.stamina - 2);
                
                if (hobbit.assignedHouseId && hobbit.inventory.some(i => i.isKey && i.houseId === hobbit.assignedHouseId)) {
                    hobbit.goal = 'sleep';
                }
            } else {
                hobbit.stamina = Math.min(100, hobbit.stamina + 5);
                hobbit.targetKeyCoords = null;
                
                if (hobbit.inventory.length >= hobbit.maxSlots) {
                    const hasMyKey = hobbit.assignedHouseId && hobbit.inventory.some(i => i.isKey && i.houseId === hobbit.assignedHouseId);
                    
                    if (hasMyKey) {
                        hobbit.goal = 'deposit';
                    } else {
                        const availableKey = findAnyKeyOnGround(hobbitCX, hobbitCY);
                        if (availableKey) {
                            hobbit.goal = 'get_key';
                            hobbit.targetKeyCoords = availableKey;
                        } else {
                            hobbit.goal = 'deposit';
                        }
                    }
                } else {
                    hobbit.goal = 'gather';
                }
            }

            // ==========================================
            // 🎬 EXECUTE GOALS
            // ==========================================
            if (!hobbit.path || hobbit.path.length === 0) {
                hobbit.moveTimer -= (inViewport ? modifier : 1.5);

                if (hobbit.moveTimer <= 0) {
                    hobbit.moveTimer = 0;

                    // --- GOAL: GET KEY ---
                    if (hobbit.goal === 'get_key' && hobbit.targetKeyCoords) {
                        const tk = hobbit.targetKeyCoords;
                        
                        if (Math.abs(currTX - tk.gx) <= 1 && Math.abs(currTY - tk.gy) <= 1) {
                            hobbit.state = 'looting';
                            
                            const kChunk = bacteriaCells.get(`${Math.floor(tk.gx/100)}_${Math.floor(tk.gy/100)}`);
                            let extractedHouseId = hobbit.assignedHouseId || 1; 
                            
                            if (kChunk) {
                                const traits = kChunk[((tk.gy%100)*100)+(tk.gx%100)];
                                extractedHouseId = traits & 0xFFFF; 
                                kChunk[((tk.gy%100)*100)+(tk.gx%100)] = 0; 
                            }

                            hobbit.inventory.push({ 
                                name: `Key #${extractedHouseId}`, 
                                seedType: 'key', 
                                isKey: true, 
                                houseId: extractedHouseId 
                            });

                            hobbit.assignedHouseId = extractedHouseId;
                            console.log(`🔑 Hobbit claimed House #${extractedHouseId}!`);

                            hobbit.goal = 'deposit';
                            hobbit.state = 'idle';
                        } else {
                            const path = findPathToCoords(currTX, currTY, tk.gx, tk.gy, worldMatrix, roomMatrix);
                            if (path) {
                                hobbit.path = path;
                                hobbit.state = 'walking';
                            } else {
                                hobbit.path = [];
                                hobbit.state = 'idle';
                                hobbit.moveTimer = 5.0; 
                            }
                        }
                    }

                    // --- GOAL: SLEEP ---
                    else if (hobbit.goal === 'sleep') {
                        const bed = findNearestStaticObject(currTX, currTY, 'BEDROLL');
                        if (bed) {
                            hobbit.assignedHouseId = bed.houseId;

                            // 🎯 THE FIX: Verify they are physically inside the correct room to go to sleep!
                            if (Math.abs(currTX - bed.x) <= 1 && Math.abs(currTY - bed.y) <= 1 && currentRoomID === bed.houseId) {
                                hobbit.state = 'sleeping';
                            } else {
                                // 🎯 THE FIX: Target the walkable neighbor specifically inside the house room boundary!
                                const target = findWalkableNeighborInRoom(bed.x, bed.y, bed.houseId, worldMatrix, roomMatrix);
                                const path = findPathToCoords(currTX, currTY, target.x, target.y, worldMatrix, roomMatrix);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.state = 'walking';
                                } else {
                                    const hasKey = hobbit.inventory.some(i => i.isKey && i.houseId === bed.houseId);
                                    
                                    if (!hasKey) {
                                        const droppedKey = findKeyOnGround(hobbitCX, hobbitCY, bed.houseId);
                                        if (droppedKey) {
                                            console.log(`🧝 Hobbit noticed Key #${bed.houseId} on the doorstep! Rerouting to retrieve...`);
                                            hobbit.goal = 'get_key';
                                            hobbit.targetKeyCoords = droppedKey;
                                            hobbit.path = [];
                                            hobbit.state = 'idle';
                                            hobbit.moveTimer = 0; 
                                            return;
                                        }
                                    }

                                    hobbit.path = [];
                                    hobbit.state = 'idle';
                                    hobbit.moveTimer = 5.0; 
                                }
                            }
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.state = 'walking';
                        }
                    }

                    // --- GOAL: DEPOSIT ---
                    else if (hobbit.goal === 'deposit') {
                        let chest = null;
                        if (hobbit.assignedHouseId) {
                            chest = findMyHouseChest(hobbit.assignedHouseId);
                        }
                        
                        if (!chest) {
                            const nearestChest = findNearestStaticObject(currTX, currTY, 'CHEST_STORAGE');
                            if (nearestChest) chest = { x: nearestChest.x, y: nearestChest.y };
                        }

                        if (chest) {
                            // 🎯 THE FIX: Verify they are physically inside the house room boundary before unloading!
                            if (Math.abs(currTX - chest.x) <= 1 && Math.abs(currTY - chest.y) <= 1 && currentRoomID === hobbit.assignedHouseId) {
                                hobbit.state = 'depositing';
                                console.log(`🧝 Hobbit deposited resources into House Chest #${hobbit.assignedHouseId}!`);
                                hobbit.inventory = []; 
                                hobbit.goal = 'gather';
                                hobbit.state = 'idle';
                            } else {
                                // 🎯 THE FIX: Target the walkable neighbor specifically inside the house room boundary!
                                const target = findWalkableNeighborInRoom(chest.x, chest.y, hobbit.assignedHouseId, worldMatrix, roomMatrix);
                                const path = findPathToCoords(currTX, currTY, target.x, target.y, worldMatrix, roomMatrix);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.state = 'walking';
                                } else {
                                    hobbit.path = [];
                                    hobbit.state = 'idle';
                                    hobbit.moveTimer = 5.0;
                                }
                            }
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.state = 'walking';
                        }
                    }

                    // --- GOAL: GATHER ---
                    else if (hobbit.goal === 'gather') {
                        const crop = findNearestMatureCrop(currTX, currTY);
                        if (crop) {
                            if (Math.abs(currTX - crop.gx) <= 1 && Math.abs(currTY - crop.gy) <= 1) {
                                hobbit.state = 'harvesting';
                                hobbit.inventory.push({ name: crop.type, seedType: `${crop.type}_item` });
                                plants.delete(`${crop.gx}_${crop.gy}`);
                                hobbit.state = 'idle';
                            } else {
                                const target = findWalkableNeighbor(crop.gx, crop.gy, worldMatrix, roomMatrix);
                                const path = findPathToCoords(currTX, currTY, target.x, target.y, worldMatrix, roomMatrix);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.state = 'walking';
                                } else {
                                    hobbit.path = [];
                                    hobbit.state = 'idle';
                                    hobbit.moveTimer = 5.0;
                                }
                            }
                        } else {
                            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                            hobbit.state = 'walking';
                        }
                    }
                }
            }

            // ==========================================
            // 👣 EXECUTE MOVEMENT
            // ==========================================
            if (inViewport && hobbit.path && hobbit.path.length > 0 && hobbit.state === 'walking') {
                const nextNode = hobbit.path[0];
                const targetX = nextNode.x * 16;
                const targetY = nextNode.y * 16;

                const dx = targetX - hobbit.x;
                const dy = targetY - hobbit.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (Math.abs(dx) > Math.abs(dy)) {
                    hobbit.dir = dx > 0 ? 'East' : 'West';
                } else {
                    hobbit.dir = dy > 0 ? 'South' : 'North';
                }

                if (dist > 2) {
                    const moveX = (dx / dist) * hobbit.speed * modifier;
                    const moveY = (dy / dist) * hobbit.speed * modifier;

                    if (!moveEntity(hobbit, moveX, moveY, worldMatrix, roomMatrix)) {
                        hobbit.path = [];
                        hobbit.state = 'idle';
                        hobbit.moveTimer = 2.0; 
                    }
                } else {
                    hobbit.x = targetX;
                    hobbit.y = targetY;
                    hobbit.path.shift(); 
                }

                hobbit.animTimer += modifier * 8;
                hobbit.frame = Math.floor(hobbit.animTimer) % 4;
            }
            else if (!inViewport && hobbit.path && hobbit.path.length > 0 && hobbit.state === 'walking') {
                const nextNode = hobbit.path.shift();
                hobbit.x = nextNode.x * 16;
                hobbit.y = nextNode.y * 16;
            }
        }
    });
}