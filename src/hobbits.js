// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 
import { worldTime } from './game.js'; // 👈 IMPORTED: Shared world clock
import { getObjectAt, staticObjects } from './staticObjects.js'; // 👈 IMPORTED: Find beds/chests
import { plants } from './plants.js';

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

        // 🧠 NEEDS & INVENTORY
        inventory: [],
        maxSlots: 4,       // Small pockets!
        stamina: 100,      // Fatigue tracker (100 = awake, 0 = exhausted)
        
        state: 'idle',     // 'idle', 'walking', 'sleeping', 'harvesting', 'depositing'
        goal: 'wander',    // 'wander', 'sleep', 'gather', 'deposit'
        dir: 'South',
        frame: 0,
        animTimer: 0,
        moveTimer: Math.random() * 3,
        path: [],
        targetX: null,
        targetY: null,
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5
    });
}

// 🧠 HELPER: Scans the village to find the nearest static object by type (e.g. BEDROLL, FOOD_STORAGE)
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
                nearest = { x: gx, y: gy };
            }
        }
    }
    return nearest;
}

// 🧠 HELPER: Scans the village to find the nearest mature, harvestable crop
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
    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;
    const solids = [40, 48, 50, 52, 17, 18, 19, 21, 22, 24, 27, 1, 3];
    if (solids.includes(data.tileID)) return false;
    return true;
}

function assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkable(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix));
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        hobbit.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

// Simple pathfinder toward coordinates
function findPathToCoords(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix) {
    const queue = [{ x: startTX, y: startTY, path: [] }];
    const visited = new Set([`${startTX}_${startTY}`]);
    const maxDepth = 40; // Deeper search for specific targeting

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

        // Catch-up
        if (deltaSeconds > 2.0) {
            // Keep macro catch-up lightweight
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

        // We run active state calculations on the offscreen cold heartbeat OR real-time frames
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

            // ==========================================
            // 🧠 CORE MOTIVES & STATE DECISION TREE
            // ==========================================
            
            // 1. MOTIVE: SLEEP (Triggered at Night)
            if (worldTime.isNight) {
                hobbit.goal = 'sleep';
                hobbit.stamina = Math.max(0, hobbit.stamina - 2); // Drain stamina
            } else {
                hobbit.stamina = Math.min(100, hobbit.stamina + 5); // Regenerate stamina during day
                
                // 2. MOTIVE: DEPOSIT HARVEST (If backpack is full)
                if (hobbit.inventory.length >= hobbit.maxSlots) {
                    hobbit.goal = 'deposit';
                } 
                // 3. MOTIVE: GATHER CROPS (If day, awake, and have backpack space)
                else {
                    hobbit.goal = 'gather';
                }
            }

            // ==========================================
            // 🎬 EXECUTE GOALS (Path Generation)
            // ==========================================
            if (!hobbit.path || hobbit.path.length === 0) {
                
                // --- GOAL: SLEEP ---
                if (hobbit.goal === 'sleep') {
                    const bed = findNearestStaticObject(currTX, currTY, 'BEDROLL');
                    if (bed) {
                        // If standing next to the bed, lie down and sleep!
                        if (Math.abs(currTX - bed.x) <= 1 && Math.abs(currTY - bed.y) <= 1) {
                            hobbit.state = 'sleeping';
                        } else {
                            // Pathfind to the bed
                            const path = findPathToCoords(currTX, currTY, bed.x, bed.y, worldMatrix, roomMatrix);
                            if (path) { hobbit.path = path; hobbit.state = 'walking'; }
                        }
                    } else {
                        // No bed found, just wander/sleep on the ground
                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                        hobbit.state = 'walking';
                    }
                }

                // --- GOAL: DEPOSIT ---
                else if (hobbit.goal === 'deposit') {
                    const storage = findNearestStaticObject(currTX, currTY, 'FOOD_STORAGE');
                    if (storage) {
                        // If standing next to the cellar, deposit resources!
                        if (Math.abs(currTX - storage.x) <= 1 && Math.abs(currTY - storage.y) <= 1) {
                            hobbit.state = 'depositing';
                            console.log("🧝 Hobbit deposited resources into the Root Cellar!");
                            hobbit.inventory = []; // Empty inventory!
                            hobbit.goal = 'gather';
                            hobbit.state = 'idle';
                        } else {
                            // Pathfind to the cellar
                            const path = findPathToCoords(currTX, currTY, storage.x, storage.y, worldMatrix, roomMatrix);
                            if (path) { hobbit.path = path; hobbit.state = 'walking'; }
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
                        // If standing next to the crop, harvest it!
                        if (Math.abs(currTX - crop.gx) <= 1 && Math.abs(currTY - crop.gy) <= 1) {
                            hobbit.state = 'harvesting';
                            console.log(`🧝 Hobbit harvested a ${crop.type}!`);
                            
                            // 🎒 Add to local inventory
                            hobbit.inventory.push({ name: crop.type, seedType: `${crop.type}_item` });
                            
                            // Delete crop from map
                            plants.delete(`${crop.gx}_${crop.gy}`);
                            
                            hobbit.state = 'idle';
                        } else {
                            // Pathfind to the crop
                            const path = findPathToCoords(currTX, currTY, crop.gx, crop.gy, worldMatrix, roomMatrix);
                            if (path) { hobbit.path = path; hobbit.state = 'walking'; }
                        }
                    } else {
                        // No crops, wander around
                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                        hobbit.state = 'walking';
                    }
                }
            }

            // ==========================================
            // 👣 EXECUTE MOVEMENT Along Path
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
                    }
                } else {
                    hobbit.x = targetX;
                    hobbit.y = targetY;
                    hobbit.path.shift(); 
                }

                hobbit.animTimer += modifier * 8;
                hobbit.frame = Math.floor(hobbit.animTimer) % 4;
            }
            
            // Offscreen teleportation movement (lightweight)
            else if (!inViewport && hobbit.path && hobbit.path.length > 0 && hobbit.state === 'walking') {
                const nextNode = hobbit.path.shift();
                hobbit.x = nextNode.x * 16;
                hobbit.y = nextNode.y * 16;
            }
        }
    });
}