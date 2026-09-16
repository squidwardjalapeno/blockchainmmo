// serverSimulation.js
import { CONFIG } from './src/config.js';
import { PLANT_DEFS } from './src/plantDefs.js';
import { 
    players, 
    projectiles, 
    inputBuffers, 
    cellStates, 
    serverVillages, 
    serverAnimals, 
    serverPlants, 
    serverBacteria, 
    serverHobbits, 
    userDb, 
    saveVillages, 
    getVillagePlayerCounts, 
    validateServerCollision 
} from './serverState.js';
import { 
    settleTreasuryToTBA, 
    executeOnChainForceTransfer, 
    handleVillageConquestQueues, 
    handleVillageConquestHobbitQueues 
} from './serverBlockchain.js';
import { computeWorldTime } from './src/clock.js';

// ==========================================
// 1. SPATIAL VISION CULLING (Fog-of-War)
// ==========================================

/**
 * Compiles all active vision sources for a given strategist/overseer.
 */
export function getVillageVisionSources(ownerWalletAddress) {
    const sources = [];

    // 1. Static well/village vision (Range: 400px / 25 tiles)
    for (let [key, village] of serverVillages) {
        if (village.owner === ownerWalletAddress) {
            sources.push({ x: village.x * 16 + 8, y: village.y * 16 + 8, radius: 400 });
        }
    }

    // 2. Dynamic worker/hobbit vision (Range: 96px / 6 tiles)
    serverHobbits.forEach(h => {
        const village = serverVillages.get(h.villageId);
        if (village && village.owner === ownerWalletAddress) {
            sources.push({ x: h.x + 8, y: h.y + 8, radius: 96 });
        }
    });

    return sources;
}

/**
 * Filters the entities map based on what a specific strategist/overseer can see.
 */
export function filterEntitiesByVision(socket, originalPlayers, originalProjectiles) {
    const wallet = socket.wallet || "";
    const isStrategistOrOverseer = wallet.startsWith('Overseer_') || 
                                  wallet.startsWith('Strategist_') || 
                                  wallet.startsWith('User_strategist') || 
                                  wallet.startsWith('User_overseer');

    // MOBA heroes and unauthenticated players bypass spatial filtering
    if (!isStrategistOrOverseer) {
        return { players: originalPlayers, projectiles: originalProjectiles };
    }

    const filteredPlayers = {};
    const filteredProjectiles = [];
    const myVisionSources = getVillageVisionSources(wallet);

    // Filter Players
    for (let id in originalPlayers) {
        const p = originalPlayers[id];
        if (p.isOffline || p.hp <= 0) continue;

        let isVisible = false;
        for (let src of myVisionSources) {
            const dist = Math.hypot(p.x - src.x, p.y - src.y);
            if (dist <= src.radius) {
                isVisible = true;
                break;
            }
        }
        if (isVisible || id === socket.id) {
            filteredPlayers[id] = p;
        }
    }

    // Filter Projectiles
    for (let proj of originalProjectiles) {
        let isVisible = false;
        for (let src of myVisionSources) {
            const dist = Math.hypot(proj.x - src.x, proj.y - src.y);
            if (dist <= src.radius) {
                isVisible = true;
                break;
            }
        }
        if (isVisible) {
            filteredProjectiles.push(proj);
        }
    }

    return { players: filteredPlayers, projectiles: filteredProjectiles };
}

// ==========================================
// 2. DAMAGE & COMBAT CALCULATIONS
// ==========================================

/**
 * Applies authoritative magic damage, evaluates magic resistance, 
 * handles execution/fever passives, and checks village crime telemetry.
 */
export function applyMagicSpellDamage(io, attacker, victim, baseDamage) {
    if (victim.isInvincible) return;

    if (victim.hasDivineBubble) {
        victim.hasDivineBubble = false;
        if (io) io.emit('playerHit', { victimId: victim.id, newHp: victim.hp, bubblePopped: true });
        return;
    }

    const victimMr = Math.max(1, victim.mr || 1);
    const mrReduction = Math.pow(0.5, Math.log10(victimMr));
    let finalDamage = Math.max(1, Math.floor(baseDamage * mrReduction));

    // Fever passive execute bonus
    if (attacker.passives && attacker.passives.hasFever) {
        if (victim.resonanceTimer > 0) {
            victim.resonanceTimer = 0;
            const percentMissing = 0.08 + ((attacker.magic || 0) * 0.0001);
            const missingHp = (victim.maxHp || 100) - victim.hp;
            const executeDamage = Math.floor(missingHp * percentMissing);
            finalDamage += executeDamage;
            console.log(`🔥 Resonance Consumed! +${executeDamage} Execute Damage`);
        } else {
            victim.resonanceTimer = 4.0;
            if (io) io.emit('playerCC', { victimId: victim.id, ccType: 'resonanceApply' });
            console.log(`✨ Resonance Applied to ${victim.id}`);
        }
    }

    // Flux shield absorption
    if (victim.shield > 0) {
        const dmgToShield = Math.min(victim.shield, finalDamage);
        victim.shield -= dmgToShield;
        finalDamage -= dmgToShield;
    }

    victim.hp -= finalDamage;

    // Detect crimes against village owners
    const victimName = victim.wallet || `Guest_${victim.id.substring(0, 4)}`;
    for (let [key, village] of serverVillages) {
        if (village.owner === victimName) {
            if (io) io.emit('villageIntruderAggro', { wellX: village.x, wellY: village.y, intruderId: attacker.id });
            console.log(`⚖️ SPELL CRIME DETECTED: Attacker ${attacker.id} struck owner ${victimName} of village [${village.x}, ${village.y}]!`);
        }
    }

    if (io) {
        io.emit('playerHit', { 
            victimId: victim.id, 
            newHp: victim.hp, 
            newShield: victim.shield, 
            attackerId: attacker.id 
        });
    }

    if (victim.hp <= 0) {
        const xpGain = (victim.xp || 0) * 0.30;
        attacker.xp = (attacker.xp || 0) + xpGain;
        if (victim.wallet && userDb[victim.wallet]) {
            userDb[victim.wallet].hp = 0;
            userDb[victim.wallet].xp = victim.xp;
        }
        if (io) {
            io.emit('playerKilled', { 
                victimId: victim.id, 
                killerId: attacker.id, 
                xpGained: xpGain, 
                newAttackerXp: attacker.xp 
            });
        }
    }
}

// ==========================================
// 3. COMBAT LOOP (HOT - 30 Hz / 33.33ms)
// ==========================================

export function tickCombat(io) {
    const delta = 0.0333;

    // 1. Process client movement input buffers in active HOT sectors
    for (const id in players) {
        const p = players[id];
        if (!p || p.hp <= 0 || p.isOffline) continue;

        const cx = Math.floor(p.x / 1600);
        const cy = Math.floor(p.y / 1600);
        const key = `${cx}_${cy}`;
        const tempState = cellStates.get(key);

        if (tempState !== 'HOT') {
            inputBuffers.delete(id);
            continue;
        }

        const buffer = inputBuffers.get(id) || [];
        while (buffer.length > 0) {
            const input = buffer.shift();
            const magnitude = Math.hypot(input.dx, input.dy);
            if (magnitude > 1.05) continue;

            const speed = p.speed || CONFIG.HERO_SPEED;
            const nextX = p.x + (input.dx * speed * delta);
            const nextY = p.y + (input.dy * speed * delta);

            if (validateServerCollision(nextX, nextY)) {
                p.x = nextX;
                p.y = nextY;
            }
        }
    }

    // 2. Step Projectile physics & collision checking
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];

        if (p.targetId) {
            const target = players[p.targetId];
            if (target && target.hp > 0) {
                const tx = (target.x + 8) - p.x;
                const ty = (target.y + 8) - p.y;
                const dist = Math.sqrt(tx * tx + ty * ty);
                if (dist > 0) { p.dx = tx / dist; p.dy = ty / dist; }
            } else {
                p.life = 0;
            }
        }

        p.x += p.dx * p.speed * delta;
        p.y += p.dy * p.speed * delta;
        p.life -= delta;

        let hit = false;

        for (let vid in players) {
            if (vid === p.ownerId) continue;
            if (p.targetId && vid !== p.targetId) continue;

            const victim = players[vid];
            if (victim.hp <= 0) continue;

            const dx = (victim.x + 8) - p.x;
            const dy = (victim.y + 8) - p.y;
            const distSq = (dx * dx) + (dy * dy);
            const hitRadius = p.radius || 16;

            if (distSq <= hitRadius * hitRadius) {
                hit = true;
                const attacker = players[p.ownerId];
                if (attacker) {
                    if (p.type === 'zephyr') {
                        if (victim.resonanceTimer > 0) {
                            if (io) io.to(p.ownerId).emit('refundCooldown', { index: p.skillIndex, amount: 9.6 });
                            if (!attacker.passives || !attacker.passives.hasFever) {
                                victim.resonanceTimer = 0;
                                if (io) io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
                            }
                        }
                        applyMagicSpellDamage(io, attacker, victim, p.damage);
                    } else if (p.type === 'vanguard') {
                        const RAPTURE_MASK = 1 | 2 | 8 | 16;
                        if (io) io.emit('playerCC', { victimId: vid, ccMask: RAPTURE_MASK, duration: 2.0 });
                        applyMagicSpellDamage(io, attacker, victim, p.damage);
                    } else if (p.type === 'flare') {
                        applyMagicSpellDamage(io, attacker, victim, p.damage);
                    }
                }
                break;
            }
        }

        if (hit || p.life <= 0) {
            projectiles.splice(i, 1);
        }
    }

    // 3. Per-socket position broadcast with vision culling
    if (io && io.sockets) {
        io.sockets.sockets.forEach((socket) => {
            const filteredData = filterEntitiesByVision(socket, players, projectiles);
            socket.emit('position', {
                playerbase: filteredData.players,
                projectiles: filteredData.projectiles
            });
        });
    }
}

// ==========================================
// 4. WORLD LOOP (WARM - 5 Hz / 200ms)
// ==========================================

export function updateSimulationTemperatures() {
    cellStates.clear();

    for (const id in players) {
        const p = players[id];
        if (!p || p.isOffline) continue;

        const isHero = !p.wallet || !p.wallet.startsWith('Overseer_');
        const cx = Math.floor(p.x / 1600);
        const cy = Math.floor(p.y / 1600);

        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                const ncx = cx + ox;
                const ncy = cy + oy;

                if (ncx >= 0 && ncx < CONFIG.MAP_SIZE && ncy >= 0 && ncy < CONFIG.MAP_SIZE) {
                    const key = `${ncx}_${ncy}`;
                    if (isHero) {
                        cellStates.set(key, 'HOT');
                    } else if (cellStates.get(key) !== 'HOT') {
                        cellStates.set(key, 'WARM');
                    }
                }
            }
        }
    }
}

// serverSimulation.js (inside tickWorld)
export async function tickWorld(io) {
    const delta = 0.200; // 5 Hz / 200ms tick step

    // 1. Update active spatial simulation temperatures (HOT/WARM/COLD)
    updateSimulationTemperatures();

    // ==========================================
    // 🏘️ 1. SIEGE & VILLAGE CONQUEST RESOLUTION
    // ==========================================
    for (let [key, village] of serverVillages) {
        if (village.owner === null) continue;

        const counts = getVillagePlayerCounts(village.x, village.y, village.owner);

        if (village.capturer) {
            if (counts.enemies > counts.allies) {
                // Advance capture progress
                village.captureProgress = Math.min(100, village.captureProgress + delta * 5);

                if (village.captureProgress >= 100) {
                    const oldOwner = village.owner;
                    const newOwner = village.capturer;

                    console.log(`⚔️ CONQUEST RESOLVED: ${newOwner} has conquered ${oldOwner}'s village!`);

                    // 1. JIT Settle Virtual Treasury to TBA on Unichain
                    const virtualTreasury = parseFloat(village.treasury) || 0.0;
                    if (virtualTreasury > 0 && village.tbaAddress) {
                        console.log(`🏦 CONQUEST SETTLEMENT: Settling ${virtualTreasury.toFixed(8)} UNI from Bank to TBA [${village.tbaAddress}]...`);
                        try {
                            await settleTreasuryToTBA(village.tbaAddress, virtualTreasury);
                            village.treasury = 0.0;
                            console.log(`✅ Conquest Settlement complete. Virtual treasury wiped.`);
                        } catch (settleErr) {
                            console.error("❌ Conquest Settlement failed to verify on-chain:", settleErr.message);
                        }
                    }

                    // 2. Update Database Records
                    village.owner = newOwner;
                    village.captureProgress = 0;
                    village.capturer = null;
                    saveVillages();

                    // 3. Trigger On-Chain Force Transfer of Deed NFT
                    if (oldOwner && oldOwner.startsWith('0x') && newOwner.startsWith('0x')) {
                        executeOnChainForceTransfer(io, oldOwner, newOwner, village.deedTokenId);
                    }

                    // 4. Reassign active extraction and export queues to the conqueror
                    handleVillageConquestQueues(key, newOwner);
                    handleVillageConquestHobbitQueues(key, newOwner);

                    // 5. Update workers state
                    serverHobbits.forEach(hob => {
                        if (hob.villageId === key) {
                            hob.state = 'idle';
                            hob.path = [];
                        }
                    });

                    // 6. Broadcast conquest results
                    if (io) {
                        io.emit('villageOwnerUpdated', { 
                            wellX: village.x, 
                            wellY: village.y, 
                            owner: village.owner, 
                            progress: 0,
                            treasury: village.treasury || 0.0
                        });
                        io.emit('chatMessage', { 
                            sender: "SYSTEM", 
                            message: `🏘️ Village at [${village.x}, ${village.y}] conquered! Ownership transferred.` 
                        });
                    }
                } else if (io) {
                    io.emit('villageCaptureProgress', { 
                        wellX: village.x, 
                        wellY: village.y, 
                        progress: village.captureProgress, 
                        capturer: village.capturer 
                    });
                }
            } else if (counts.allies > counts.enemies) {
                // Regress capture progress back to 0
                village.captureProgress = Math.max(0, village.captureProgress - delta * 5);

                if (village.captureProgress === 0) {
                    village.capturer = null;
                    if (io) {
                        io.emit('villageOwnerUpdated', { 
                            wellX: village.x, 
                            wellY: village.y, 
                            owner: village.owner, 
                            progress: 0,
                            treasury: village.treasury || 0.0
                        });
                        io.emit('chatMessage', { 
                            sender: "SYSTEM", 
                            message: `🏘️ Village at [${village.x}, ${village.y}] has been secured by the defenders!` 
                        });
                    }
                } else if (io) {
                    io.emit('villageCaptureProgress', { 
                        wellX: village.x, 
                        wellY: village.y, 
                        progress: village.captureProgress, 
                        capturer: village.owner 
                    });
                }
            } else if (io) {
                io.emit('villageCaptureProgress', { 
                    wellX: village.x, 
                    wellY: village.y, 
                    progress: village.captureProgress, 
                    contested: true 
                });
            }
        }
    }

    // ==========================================
    // 🐓 2. PASTURE CHICKENS AI (4-SECOND GRID WALKING)
    // ==========================================
    serverAnimals.forEach(a => {
        const cx = Math.floor(a.x / 1600);
        const cy = Math.floor(a.y / 1600);
        const key = `${cx}_${cy}`;

        // Freeze processing in unobserved COLD sectors
        if (!cellStates.has(key)) return;

        if (a.eggTimer === undefined) a.eggTimer = 45 + Math.random() * 30;
        if (a.poopTimer === undefined) a.poopTimer = 20 + Math.random() * 20;
        if (a.energy === undefined) a.energy = 100;
        if (a.stepTimer === undefined) a.stepTimer = 4.0;

        a.eggTimer -= delta;
        a.poopTimer -= delta;
        a.energy = Math.max(0, a.energy - (delta * 0.15));

        const curTX = a.tx !== undefined ? a.tx : Math.floor((a.x + 8) / 16);
        const curTY = a.ty !== undefined ? a.ty : Math.floor((a.y + 8) / 16);

        // Check building & well obstacles
        const isBlocked = (tx, ty) => {
            for (let [vKey, v] of serverVillages) {
                if (tx >= v.x && tx <= v.x + 1 && ty >= v.y - 1 && ty <= v.y + 1) return true;
                if (v.structures) {
                    for (let struct of v.structures) {
                        let w = 4, h = 3;
                        if (struct.type === 'TEMPLE') { w = 4; h = 8; }
                        else if (struct.type === 'STORE') { w = 4; h = 4; }
                        else if (struct.type === 'BARN') { w = 6; h = 6; }
                        if (tx >= struct.tx && tx < struct.tx + w && ty <= struct.ty && ty > struct.ty - h) {
                            return true;
                        }
                    }
                }
            }
            return false;
        };

        // 🥚 A. Lay Egg
        if (a.eggTimer <= 0 && a.energy >= 40) {
            a.eggTimer = 45 + Math.random() * 30;
            a.energy -= 20;
            if (!isBlocked(curTX, curTY)) {
                const packedTraits = (1 & 0xFF) | ((16 & 0xFF) << 20); // Type 16 = Egg
                serverBacteria.set(`${curTX}_${curTY}`, packedTraits);
                if (io) io.emit('syncTile', { gx: curTX, gy: curTY, traits: packedTraits });
                a.eggsLaid = (a.eggsLaid || 0) + 1; // Live telemetry
            }
        }

        // 💩 B. Drop Poop
        if (a.poopTimer <= 0) {
            a.poopTimer = 20 + Math.random() * 20;
            if (!isBlocked(curTX, curTY)) {
                const packedTraits = (3 & 0xFF) | ((12 & 0xFF) << 8) | ((4 & 0xFF) << 20); // Type 4 = Poop
                serverBacteria.set(`${curTX}_${curTY}`, packedTraits);
                if (io) io.emit('syncTile', { gx: curTX, gy: curTY, traits: packedTraits });
                a.poopsDropped = (a.poopsDropped || 0) + 1; // Live telemetry
            }
        }

        // 🧠 C. 4-SECOND GRID DECISION CADENCE
        a.stepTimer -= delta;

        if (a.stepTimer <= 0) {
            a.stepTimer = 4.0; // Reset cadence to 4.0 seconds

            // Record step & bounds telemetry
            a.stepsTaken = (a.stepsTaken || 0) + 1;
            if (!a.visitedTiles) a.visitedTiles = [];
            a.visitedTiles.push(`${curTX}_${curTY}`);
            if (a.visitedTiles.length > 500) a.visitedTiles.shift();

            if (a.minX === undefined || curTX < a.minX) a.minX = curTX;
            if (a.maxX === undefined || curTX > a.maxX) a.maxX = curTX;
            if (a.minY === undefined || curTY < a.minY) a.minY = curTY;
            if (a.maxY === undefined || curTY > a.maxY) a.maxY = curTY;

            let nextTX = curTX;
            let nextTY = curTY;
            let foundFood = false;

            // Concentric Ring Food Search (Radius 0 -> 1 -> 2 -> 3)
            if (a.energy < 60) {
                for (let r = 0; r <= 3; r++) {
                    for (let ox = -r; ox <= r; ox++) {
                        for (let oy = -r; oy <= r; oy++) {
                            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;

                            const checkTX = curTX + ox;
                            const checkTY = curTY + oy;
                            const checkKey = `${checkTX}_${checkTY}`;
                            if (isBlocked(checkTX, checkTY)) continue;

                            // 1. Placed Hay Bale (Type 17)
                            if (serverBacteria.has(checkKey)) {
                                const traits = serverBacteria.get(checkKey);
                                if (((traits >> 20) & 0xFF) === 17) {
                                    a.targetFoodTX = checkTX;
                                    a.targetFoodTY = checkTY;
                                    a.goal = 'eating';
                                    foundFood = true;
                                    break;
                                }
                            }

                            // 2. Visible Growing Plant (Growth >= 20%)
                            if (serverPlants.has(checkKey)) {
                                const plant = serverPlants.get(checkKey);
                                if (plant && plant.growth >= 20) {
                                    a.targetFoodTX = checkTX;
                                    a.targetFoodTY = checkTY;
                                    a.goal = 'eating';
                                    foundFood = true;
                                    break;
                                }
                            }
                        }
                        if (foundFood) break;
                    }
                    if (foundFood) break;
                }

                // Path towards target food tile
                if (foundFood && a.targetFoodTX !== undefined) {
                    const stepDX = Math.sign(a.targetFoodTX - curTX);
                    const stepDY = Math.sign(a.targetFoodTY - curTY);

                    if (stepDX !== 0 && !isBlocked(curTX + stepDX, curTY)) {
                        nextTX = curTX + stepDX;
                    } else if (stepDY !== 0 && !isBlocked(curTX, curTY + stepDY)) {
                        nextTY = curTY + stepDY;
                    }
                }
            }

            // Random Walk if not pursuing food
            if (!foundFood) {
                a.goal = 'wander';
                a.targetFoodTX = null;
                a.targetFoodTY = null;

                const neighbors = [
                    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
                ];
                const valid = neighbors.filter(n => !isBlocked(curTX + n.dx, curTY + n.dy));
                if (valid.length > 0) {
                    const chosen = valid[Math.floor(Math.random() * valid.length)];
                    nextTX = curTX + chosen.dx;
                    nextTY = curTY + chosen.dy;
                }
            }

            if (!isBlocked(nextTX, nextTY)) {
                a.targetTX = nextTX;
                a.targetTY = nextTY;
                if (nextTX !== curTX) {
                    a.dir = nextTX > curTX ? 'East' : 'West';
                }
            }
        }

        // 🏃 D. STEP TOWARDS TARGET TILE
        const destWorldX = a.targetTX * 16;
        const destWorldY = a.targetTY * 16;
        const dx = destWorldX - a.x;
        const dy = destWorldY - a.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 1.0) {
            const step = Math.min(dist, a.speed * delta);
            a.x += (dx / dist) * step;
            a.y += (dy / dist) * step;
            a.state = 'walking';
        } else {
            // Snapped onto tile center
            a.x = destWorldX;
            a.y = destWorldY;
            a.tx = a.targetTX;
            a.ty = a.targetTY;
            a.state = 'idle';

            // 🍽️ EAT FOOD ONLY WHEN DIRECTLY ON TOP OF TARGET FOOD TILE
            const currentTileKey = `${a.tx}_${a.ty}`;

            if (a.goal === 'eating' && a.targetFoodTX === a.tx && a.targetFoodTY === a.ty) {
                // Case 1: Standing directly over Hay Bale
                if (serverBacteria.has(currentTileKey)) {
                    const traits = serverBacteria.get(currentTileKey);
                    if (((traits >> 20) & 0xFF) === 17) {
                        let health = traits & 0xFF;
                        health = Math.max(0, health - 10);
                        if (health <= 0) {
                            serverBacteria.delete(currentTileKey);
                            if (io) io.emit('syncTile', { gx: a.tx, gy: a.ty, traits: 0 });
                        } else {
                            const newTraits = (health & 0xFF) | (17 << 20);
                            serverBacteria.set(currentTileKey, newTraits);
                            if (io) io.emit('syncTile', { gx: a.tx, gy: a.ty, traits: newTraits });
                        }
                        a.energy = 100;
                        a.mealsEaten = (a.mealsEaten || 0) + 1;
                        a.goal = 'wander';
                        a.targetFoodTX = null;
                        a.targetFoodTY = null;
                    }
                } 
                // Case 2: Standing directly over Visible Plant
                else if (serverPlants.has(currentTileKey)) {
                    const plant = serverPlants.get(currentTileKey);
                    if (plant && plant.growth >= 20) {
                        serverPlants.delete(currentTileKey);
                        if (io) io.emit('plantRemoved', { gx: a.tx, gy: a.ty });

                        const energyGained = plant.growth >= 100 ? 50 : 30;
                        a.energy = Math.min(100, a.energy + energyGained);
                        a.mealsEaten = (a.mealsEaten || 0) + 1;
                        a.goal = 'wander';
                        a.targetFoodTX = null;
                        a.targetFoodTY = null;
                    }
                }
            }
        }
    });

    // serverSimulation.js (inside tickWorld)

    // ==========================================
    // 🧝 HOBBIT WORKFORCE MOVEMENT & SYNC
    // ==========================================
    serverHobbits.forEach(h => {
        if (h.path && h.path.length > 0) {
            const nextNode = h.path[0];
            const nextWorldX = nextNode.x * 16;
            const nextWorldY = nextNode.y * 16;

            const dx = nextWorldX - h.x;
            const dy = nextWorldY - h.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 1.5) {
                const step = Math.min(dist, (h.speed || 35) * delta);
                h.x += (dx / dist) * step;
                h.y += (dy / dist) * step;
                h.state = 'walking';
            } else {
                h.x = nextWorldX;
                h.y = nextWorldY;
                h.path.shift();
                h.state = 'idle';
            }
        }
    });

    if (io) {
        io.emit('hobbits_update', { hobbits: serverHobbits });
        io.emit('animals', { animals: serverAnimals });
    }

    // ==========================================
    // 🌽 3. AGRICULTURE TICK LOOP (PLANTS)
    // ==========================================
    for (let [plantKey, plant] of serverPlants) {
        const cx = Math.floor(plant.gx / 100);
        const cy = Math.floor(plant.gy / 100);
        const key = `${cx}_${cy}`;

        if (!cellStates.has(key)) continue;

        if (plant.growth < 100) {
            const speed = CONFIG.PLANT_LIFECYCLE_SPEED || 1.0;
            const rate = plant.growthRate || PLANT_DEFS[plant.type]?.growthRate || 0.4;
            plant.growth = Math.min(100, plant.growth + (rate * 0.1 * speed * delta));
            if (plant.growth >= 100) {
                plant.matureTimestamp = Date.now();
            }
        }
    }

    // ==========================================
    // 🌀 4. DEBUFF / COMBAT TICK TIMERS (PLAYERS)
    // ==========================================
    for (let vid in players) {
        const p = players[vid];
        if (p.resonanceTimer > 0) {
            p.resonanceTimer -= delta;
            if (p.resonanceTimer <= 0 && io) {
                io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
            }
        }
    }

    // ==========================================
    // 🕒 5. AUTHORITATIVE SERVER CLOCK BROADCAST
    // ==========================================
    const currentServerTime = computeWorldTime(Date.now());
    if (io) {
        io.emit('timeSync', currentServerTime);
    }
}