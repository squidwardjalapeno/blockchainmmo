// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 
import { getObjectAt, staticObjects, solidTiles } from './staticObjects.js';

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

        state: 'idle',     // 'idle', 'walking', 'attacking'
        goal: 'wander',    // 'wander', 'engage'
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
    const solids = [40, 48, 50, 52, 17, 18, 19, 21, 22, 24, 27, 1, 3];
    if (solids.includes(data.tileID)) return false;
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

    hobbits.forEach(hobbit => {
        const hobbitCX = Math.floor(hobbit.x / 1600);
        const hobbitCY = Math.floor(hobbit.y / 1600);

        // 3-Tier Layer 3: Frozen Zone
        const isInsideActiveChunks = Math.abs(hobbitCX - heroCX) <= 1 && Math.abs(hobbitCY - heroCY) <= 1;
        if (!isInsideActiveChunks) return;

        if (!hobbit.lastUpdated) hobbit.lastUpdated = now;
        let deltaSeconds = (now - hobbit.lastUpdated) / 1000;
        hobbit.lastUpdated = now;

        if (deltaSeconds > 2.0) {
            hobbit.path = [];
            hobbit.state = 'idle';
            return;
        }

        // Viewport check
        const pad = 32; 
        const screenX = hobbit.x + viewport.offset[0];
        const screenY = hobbit.y + viewport.offset[1];
        const inViewport = (
            screenX >= -pad && 
            screenX <= viewport.screen[0] + pad && 
            screenY >= -pad && 
            screenY <= viewport.screen[1] + pad
        );

        let shouldProcessAI = inViewport || (hobbit.slowTickTimer -= modifier) <= 0;
        if (!inViewport && shouldProcessAI) {
            hobbit.slowTickTimer = 1.5;
        }

        if (shouldProcessAI) {
            const currTX = Math.floor((hobbit.x + 8) / 16);
            const currTY = Math.floor((hobbit.y + 8) / 16);

            // ==========================================
            // 🧠 CORE INTEL GOAL: Engage or Wander
            // ==========================================
            let target = null;
            let targetDist = Infinity;

            // Scan for player (aggro range: 5 tiles / 80px)
            const px = (hero.x + 8) - (hobbit.x + 8);
            const py = (hero.y + 8) - (hobbit.y + 8);
            const distToHero = Math.hypot(px, py);

            if (distToHero < 80 && hero.hp > 0) {
                target = hero;
                targetDist = distToHero;
            }

            // A. If in close range, execute ATTACK
            if (target && targetDist <= 20) {
                hobbit.goal = 'engage';
                if (hobbit.state !== 'attacking') {
                    hobbit.state = 'attacking';
                    hobbit.frame = 0;
                    hobbit.animTimer = 0;
                    hobbit.attackTimer = 0.5; // 0.5s swing duration
                    hobbit.path = []; // Stop movement
                    
                    // Face target
                    const tdx = target.x - hobbit.x;
                    const tdy = target.y - hobbit.y;
                    if (Math.abs(tdx) > Math.abs(tdy)) {
                        hobbit.dir = tdx > 0 ? 'East' : 'West';
                    } else {
                        hobbit.dir = tdy > 0 ? 'South' : 'North';
                    }
                }
            } 
            // B. If target found but out of range, chase them
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
            // C. Default: Wander around village
            else {
                hobbit.goal = 'wander';
                if ((!hobbit.path || hobbit.path.length === 0) && hobbit.state !== 'attacking') {
                    hobbit.moveTimer -= (inViewport ? modifier : 1.5);
                    if (hobbit.moveTimer <= 0) {
                        assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                        hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
                        hobbit.moveTimer = 2 + Math.random() * 3;
                    }
                }
            }
        }

        // ==========================================
        // 🎬 EXECUTE STATE
        // ==========================================
        
        // --- STATE: ATTACKING ---
        if (hobbit.state === 'attacking') {
            hobbit.attackTimer -= modifier;
            
            // Loop lunge frame (Frame 0 is guaranteed to be safe and visible)
            hobbit.frame = 0; 

            if (hobbit.attackTimer <= 0) {
                hobbit.state = 'idle';
                hobbit.moveTimer = 1.0; // Wait 1s after attack
            }
        }
        
        // --- STATE: WALKING ---
        else if (inViewport && hobbit.path && hobbit.path.length > 0 && hobbit.state === 'walking') {
            const nextNode = hobbit.path[0];
            const targetX = nextNode.x * 16;
            const targetY = nextNode.y * 16;

            const dx = targetX - hobbit.x;
            const dy = targetY - hobbit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

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
        else if (!inViewport && hobbit.path && hobbit.path.length > 0 && hobbit.state === 'walking') {
            const nextNode = hobbit.path.shift();
            hobbit.x = nextNode.x * 16;
            hobbit.y = nextNode.y * 16;
        }
    });
}