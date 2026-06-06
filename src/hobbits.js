// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 
import { getObjectAt, staticObjects, solidTiles } from './staticObjects.js';
import { socket } from './multiplayer.js';
import { worldTime } from './clock.js'; 

export const hobbits = [];

export function spawnHobbit(gx, gy, houseId = null, homeX = null, homeY = null) {
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
        isHobbit: true,
        x: gx * 16, 
        y: gy * 16,
        floor: 1,
        speed: 35,
        
        hp: 40, 
        maxHp: 40,
        ad: 2, 

        inventory: keyItem ? [keyItem] : [], // 4-slot limit
        houseId: houseId,
        homeX: homeX,
        homeY: homeY,
        
        // 🎯 THE FIX: Explicitly target the door entrance
        doorX: houseId ? homeX - 1 : null,  // gx + 1
        doorY: houseId ? homeY + 2 : null,  // gy + 1

        // Tight collision profiles for 16px doorways
        hitboxLeft: 4,
        hitboxRight: 12, 
        hitboxTop: 10,
        hitboxBottom: 15,

        state: 'idle',     // 'idle', 'walking', 'attacking'
        goal: 'wander',    // 'wander', 'engage', 'gohome'
        dir: 'South',
        frame: 0,
        animTimer: 0,
        moveTimer: Math.random() * 3,
        attackTimer: 0,    // Tracks active attack duration
        path: [],
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5
    });
}

function isWalkableForHobbit(tx, ty, worldMatrix, roomMatrix) {
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

    return true;
}

function assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
    const valid = dirs.filter(d => isWalkableForHobbit(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix));
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        hobbit.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

function findPathToCoords(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix) {
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

        for (let n of neighbors) {
            const key = `${n.x}_${n.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                if (isWalkableForHobbit(n.x, n.y, worldMatrix, roomMatrix)) {
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
                        const path = findPathToCoords(simX, simY, hTX, hTY, worldMatrix, roomMatrix);
                        if (path && path.length > 0) {
                            const next = path[Math.min(path.length - 1, 3)]; 
                            simX = next.x;
                            simY = next.y;
                        }
                    }
                } else if (worldTime.isNight && hobbit.houseId) {
                    if (simX !== hobbit.homeX || simY !== hobbit.homeY) {
                        const path = findPathToCoords(simX, simY, hobbit.homeX, hobbit.homeY, worldMatrix, roomMatrix);
                        if (path && path.length > 0) {
                            const next = path[Math.min(path.length - 1, 3)];
                            simX = next.x;
                            simY = next.y;
                        }
                    }
                } else {
                    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
                    const valid = dirs.filter(d => isWalkableForHobbit(simX + d[0], simY + d[1], worldMatrix, roomMatrix));
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
                        const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix);
                        if (path) {
                            hobbit.path = path;
                            hobbit.goal = 'engage';
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
                                const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix);
                                if (path) {
                                    hobbit.path = path;
                                    hobbit.goal = 'gohome';
                                }
                            }
                        }
                    } else if (!target) {
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
                }
            }
            return; 
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time)
        // ==========================================
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
            if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                const tTX = Math.floor((target.x + 8) / 16);
                const tTY = Math.floor((target.y + 8) / 16);
                const path = findPathToCoords(currTX, currTY, tTX, tTY, worldMatrix, roomMatrix);
                if (path) {
                    hobbit.path = path;
                    hobbit.state = 'walking';
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
                // 🎯 STAGE 2: Explicitly step through the doorway
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                    hobbit.path = [
                        { x: hobbit.doorX, y: hobbit.doorY - 1 }, // Door tile (GX+1, GY)
                        { x: hobbit.homeX, y: hobbit.homeY }       // Inside floor (GX+2, GY-1)
                    ];
                    hobbit.state = 'walking';
                }
            } 
            else {
                // 🎯 STAGE 1: Navigate strictly to outside the door
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                    const path = findPathToCoords(currTX, currTY, hobbit.doorX, hobbit.doorY, worldMatrix, roomMatrix);
                    if (path) {
                        hobbit.path = path;
                        hobbit.state = 'walking';
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