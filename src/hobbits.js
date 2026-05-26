// src/hobbits.js
import { viewport } from './viewport.js';
import { moveEntity, getTileData } from './physics.js'; 
import { hero } from './entities.js'; 

export const hobbits = [];

export function spawnHobbit(gx, gy) {
    hobbits.push({
        id: 'hobbit_' + Math.random().toString(36).substr(2, 9),
        isHobbit: true,
        x: gx * 16, 
        y: gy * 16,
        floor: 1,
        speed: 35, // Slower than heroes (100), faster than chickens (20)
        
        // Base low stats
        hp: 40, 
        maxHp: 40,
        ad: 2, 

        state: 'idle', // 'idle', 'walking', 'attacking'
        dir: 'South',
        frame: 0,
        animTimer: 0,
        moveTimer: Math.random() * 3,
        path: [],
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5
    });
}

function isWalkable(tx, ty, worldMatrix, roomMatrix) {
    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;
    
    // Standard structural blocks
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

// 🧠 Drunkard's Walk for high-speed macro catch-up
function macroWander(startX, startY, steps, worldMatrix, roomMatrix) {
    let curX = startX;
    let curY = startY;
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]];

    for (let i = 0; i < steps; i++) {
        const validDirs = dirs.filter(d => isWalkable(curX + d[0], curY + d[1], worldMatrix, roomMatrix));
        if (validDirs.length > 0) {
            const pick = validDirs[Math.floor(Math.random() * validDirs.length)];
            curX += pick[0];
            curY += pick[1];
        }
    }
    return { x: curX, y: curY };
}

export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);
    const now = Date.now();

    // 1. Clean up dead hobbits
    for (let i = hobbits.length - 1; i >= 0; i--) {
        if (hobbits[i].hp <= 0) {
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
        if (!isInsideActiveChunks) {
            return; // Completely skip calculations. Hobbit is frozen.
        }

        if (!hobbit.lastUpdated) hobbit.lastUpdated = now;
        let deltaSeconds = (now - hobbit.lastUpdated) / 1000;
        hobbit.lastUpdated = now;

        // 🕰️ TIER 3 CATCH-UP (Away for > 2 seconds)
        if (deltaSeconds > 2.0) {
            let timeRemaining = Math.min(deltaSeconds, 86400); // Max 24 hours
            let simX = Math.floor(hobbit.x / 16);
            let simY = Math.floor(hobbit.y / 16);
            
            while (timeRemaining > 0) {
                const stepTime = Math.min(30.0, timeRemaining);
                timeRemaining -= stepTime;

                // Run macro-stepping wander
                const wanderResult = macroWander(simX, simY, 2, worldMatrix, roomMatrix); 
                simX = wanderResult.x; simY = wanderResult.y;
            }

            hobbit.x = simX * 16;
            hobbit.y = simY * 16;
            hobbit.path = [];
            hobbit.state = 'idle';
            return; 
        }

        // Determine viewport presence
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
                hobbit.slowTickTimer = 1.5; // Tick once every 1.5 seconds

                const currTX = Math.floor((hobbit.x + 8) / 16);
                const currTY = Math.floor((hobbit.y + 8) / 16);

                if (!hobbit.path || hobbit.path.length === 0) {
                    assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
                    hobbit.state = 'walking';
                }

                // Simplified path execution: Teleport to the next tile instantly
                if (hobbit.path && hobbit.path.length > 0) {
                    const nextNode = hobbit.path.shift();
                    hobbit.x = nextNode.x * 16;
                    hobbit.y = nextNode.y * 16;

                    if (hobbit.path.length === 0) {
                        hobbit.state = 'idle';
                    }
                }
            }
            return; // Skip real-time physics and stepping completely!
        }

        // ==========================================
        // ⚡ TIER 1: VIEWPORT ACTIVE (On-Screen Real-Time)
        // ==========================================
        hobbit.moveTimer -= modifier;

        const currTX = Math.floor((hobbit.x + 8) / 16);
        const currTY = Math.floor((hobbit.y + 8) / 16);

        if (hobbit.moveTimer <= 0 && (!hobbit.path || hobbit.path.length === 0)) {
            assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix);
            hobbit.state = hobbit.path.length > 0 ? 'walking' : 'idle';
            hobbit.moveTimer = 2 + Math.random() * 3;
        }

        if (hobbit.path && hobbit.path.length > 0) {
            const nextNode = hobbit.path[0];
            const targetX = nextNode.x * 16;
            const targetY = nextNode.y * 16;

            const dx = targetX - hobbit.x;
            const dy = targetY - hobbit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Turn direction based on movement
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
                    hobbit.moveTimer = 0; 
                }
            } else {
                hobbit.x = targetX;
                hobbit.y = targetY;
                hobbit.path.shift(); 

                if (hobbit.path.length === 0) {
                    hobbit.state = 'idle';
                }
            }

            // Animate walk frames
            hobbit.animTimer += modifier * 8;
            hobbit.frame = Math.floor(hobbit.animTimer) % 4;
        } else {
            hobbit.state = 'idle';
            hobbit.frame = 0;
            hobbit.animTimer = 0;
        }
    });
}