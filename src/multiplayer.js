// src/multiplayer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { hero } from './entities.js'; 
import { setContractAddress } from './blockchainManager.js';
import { handleRemoteTileUpdate } from './bacteria.js';
import { hobbits, spawnHobbit } from './hobbitCore.js';

export const remotePlayers = new Map(); 
export let socket = null;
export let myID = null;
export let playerWallet = null; 
export let serverProjectiles = [];
export let globalUnlockedSystems = ["4_4"];

export const doorStates = new Map(); 
export const storeDbCache = new Map(); 
export const hayStorageCache = new Map(); 
export const chestCache = new Map(); 
export const villageOwners = new Map();
export const villageCriminals = new Map();

// 🎯 CACHE MODULE REFERENCE ONCE ON BOOT TO AVOID PROMISE THRASHING
let animalsModule = null;
import('./animals.js').then(m => {
    animalsModule = m;
});

if (typeof window !== 'undefined') {
    window.villageOwners = villageOwners;
    window.villageCriminals = villageCriminals;
    window.doorStates = doorStates;
    window.storeDbCache = storeDbCache;
    window.hayStorageCache = hayStorageCache;
    window.chestCache = chestCache;
}

export let playerRequestedChestId = null;
export function setPlayerRequestedChestId(id) {
    playerRequestedChestId = id;
}

export let activeWorldMatrix = null;
export function setWorldMatrix(matrix) {
    activeWorldMatrix = matrix;
}

export function setPlayerWallet(address) {
    playerWallet = address;
    if (typeof window !== 'undefined') {
        window.playerWallet = address;
    }
}

export function initMultiplayer() {
    return new Promise((resolve) => {
        if (typeof io === 'undefined' && typeof window.io === 'undefined') {
            if (window.logStep) window.logStep("OFFLINE MODE: No Socket.io");
            
            hero.xp = 0;
            hero.maxHp = 100;
            hero.hp = 100;
            hero.energy = 100;
            hero.maxEnergy = 100;
            hero.speed = 100;
            hero.ad = 10;
            hero.armor = 0;
            hero.inGameUni = 0;
            
            resolve(); 
            return;
        }

        const socketIoFunc = typeof io !== 'undefined' ? io : window.io;
        
        socket = socketIoFunc(window.location.origin, {
            transports: ['websocket'] 
        });

        // 🎯 Reset requested chunks on connect/reconnect so local flora is refreshed
        socket.on('connect', () => {
            import('./cellDecorator.js').then(m => {
                if (m.requestedBacteriaChunks) {
                    m.requestedBacteriaChunks.clear();
                }
            });
        });
        
        socket.on('secret', (data) => {
            myID = data.myId;
            window.worldSeed = data.seed; 
            
            socket.emit('updateStats', {
                xp: hero.xp,
                maxHp: hero.maxHp,
                ad: hero.ad,
                armor: hero.armor,
                magic: hero.magic,
                mr: hero.mr,
                speed: hero.speed
            });
            resolve();
        });

        socket.on('chatMessage', (data) => {
            const chatBox = document.getElementById('chat-messages');
            if (!chatBox) return;

            const msgDiv = document.createElement('div');
            msgDiv.innerHTML = `<span style="color: var(--banana);">${data.sender}:</span> <span style="color: white;">${data.message}</span>`;
            chatBox.appendChild(msgDiv);
            chatBox.scrollTop = chatBox.scrollHeight;

            if (chatBox.children.length > 15) {
                chatBox.removeChild(chatBox.firstChild);
            }
        });

        import('./uiManager.js').then(ui => {
            ui.setupMultiplayerListeners(socket);
        });

        // 🎯 TARGETED HIT: Targeted hit feedback
        socket.on('hobbitHit', (data) => {
            if (!hobbits) return;

            const victim = hobbits.find(h => h.id === data.targetId);
            if (victim) {
                victim.hp = data.newHp;

                if (victim.courage === 'FIGHT') {
                    victim.combatTargetId = data.attackerId;
                }
            }
        });

        // 🎯 SAFE HOBBITS UPDATE (Preserves active walking coordinates)
        socket.on('hobbits_update', (data) => {
            if (hobbits && data.hobbits) {
                for (let i = hobbits.length - 1; i >= 0; i--) {
                    const localH = hobbits[i];
                    if (!data.hobbits.some(h => h.id === localH.id)) {
                        hobbits.splice(i, 1);
                    }
                }

                data.hobbits.forEach(serverHobbit => {
                    const localHobbit = hobbits.find(h => h.id === serverHobbit.id);
                    if (localHobbit) {
                        localHobbit.hp = serverHobbit.hp;
                        localHobbit.job = serverHobbit.job;
                        localHobbit.energy = serverHobbit.energy;
                    } else {
                        spawnHobbit(
                            Math.floor(serverHobbit.x / 16), 
                            Math.floor(serverHobbit.y / 16), 
                            serverHobbit.houseId, 
                            serverHobbit.homeX, 
                            serverHobbit.homeY, 
                            serverHobbit.job,
                            serverHobbit.id,
                            serverHobbit.name
                        );
                    }
                });
            }
        });

        socket.on('hobbitSpawned', (data) => {
            import('./hobbitCore.js').then(m => {
                const exists = m.hobbits.some(h => h.id === data.id);
                if (!exists) {
                    m.spawnHobbit(
                        Math.floor(data.x / 16), 
                        Math.floor(data.y / 16), 
                        data.houseId,
                        data.homeX, 
                        data.homeY, 
                        data.job,
                        data.id,
                        data.name
                    );
                }
            });
        });

        socket.on('forcedMovement', (data) => {
            const p = (data.id === myID) ? hero : remotePlayers.get(data.id);
            if (p) {
                p.x = data.x;
                p.y = data.y;
                if (data.id === myID) {
                    hero.isAttacking = false;
                    hero.isWindingUp = false;
                }
            }
        });

        socket.on('chunkBacteriaData', (data) => {
            const { cx, cy, buffer } = data;
            const cellKey = `${cx}_${cy}`;

            const incomingBacteria = new Uint32Array(buffer, 0, 10000);
            const incomingFertility = new Uint8Array(buffer, 40000, 10000);

            import('./bacteria.js').then(m => {
                let cell = m.bacteriaCells.get(cellKey);
                if (!cell) {
                    cell = new Uint32Array(10000);
                    m.bacteriaCells.set(cellKey, cell);
                }
                cell.set(incomingBacteria);
            });

            import('./game.js').then(g => {
                if (g.fertilityMatrix && g.fertilityMatrix[cx] && g.fertilityMatrix[cx][cy]) {
                    g.fertilityMatrix[cx][cy].set(incomingFertility);
                }
            });
        });

        socket.on('playerHit', (data) => {
            const victim = (data.victimId === myID) ? hero : remotePlayers.get(data.victimId);
            if (victim) {
                victim.hp = data.newHp;
                if (data.newShield !== undefined) victim.shield = data.newShield;
                
                if (data.bubblePopped) {
                    if (victim === hero) hero.buffs.divineBubble = false;
                    else victim.hasDivineBubble = false;
                }

                if (data.bubblePopped === undefined) { 
                    if (!victim.cc) victim.cc = {}; 
                    if (victim === hero) hero.cc.hasResonance = false;
                    else victim.cc.hasResonance = false;
                }
                
                if (hero.target && data.victimId === hero.target.id && data.newHp <= 0) {
                    hero.isAttacking = false; hero.target = null; hero.isWindingUp = false; hero.attackTimer = 0;
                }
            }
        });

        socket.on('syncTile', (data) => {
            handleRemoteTileUpdate(data, activeWorldMatrix);
        });

        socket.on('playerHealed', (data) => {
            const p = (data.targetId === myID) ? hero : remotePlayers.get(data.targetId);
            if (p) {
                p.hp = data.newHp;
            }
        });

        socket.on('receiveAllyBuff', (data) => {
            if (data.buffType === 'fleetingBulwark') {
                hero.bulwarkTimer = data.duration;
                hero.bulwarkArmorBonus = data.armor;
                hero.bulwarkMrBonus = data.mr;
                hero.bulwarkSpeedBonus = data.speed;

                hero.armor += data.armor;
                hero.mr += data.mr;

                import('./interactionManager.js').then(m => m.recalculateStats());
                socket.emit('updateStats', { armor: hero.armor, mr: hero.mr });
            }
        });

        socket.on('playerCC', (data) => {
            const victim = (data.victimId === myID) ? hero : remotePlayers.get(data.victimId);
            if (victim) {
                if (!victim.cc) victim.cc = {};
                if (data.ccType === 'slow') {
                    victim.cc.isSlowed = true;
                    victim.cc.slowTimer = data.duration;
                    if (data.victimId === myID) {
                        import('./interactionManager.js').then(m => m.recalculateStats());
                    }
                }
                if (data.ccType === 'resonanceApply') victim.cc.hasResonance = true;
                if (data.ccType === 'resonanceFade') victim.cc.hasResonance = false;
            }
        });

        socket.on('refundCooldown', (data) => {
            if (hero.cooldowns[data.index] !== undefined) {
                hero.cooldowns[data.index] = Math.max(0, hero.cooldowns[data.index] - data.amount);
            }
        });

        socket.on('playerKilled', (data) => {
            if (data.killerId === myID) hero.xp = data.newAttackerXp; 
            if (hero.target && data.victimId === hero.target.id) {
                hero.isAttacking = false; hero.target = null; hero.isWindingUp = false; hero.attackTimer = 0;
            }
        });

        socket.on('playerRespawn', (data) => {
            const p = (data.id === myID) ? hero : remotePlayers.get(data.id);
            if (p) p.hp = data.hp;
        });

        socket.on('plantReset', (data) => {
            import('./plants.js').then(m => {
                const plant = m.plants.get(`${data.gx}_${data.gy}`);
                if (plant) {
                    plant.growth = data.growth;
                    plant.hasFlowered = false; 
                }
            });
        });

        socket.on('chunkPlantsData', (data) => {
            Promise.all([
                import('./plants.js'),
                import('./physics.js'),
                import('./game.js')
            ]).then(([plantsMod, physMod, gameMod]) => {
                data.plants.forEach(p => {
                    const tx = p.gx;
                    const ty = p.gy;
                    const tileData = physMod.getTileData(tx * 16 + 8, ty * 16 + 8, gameMod.worldMatrix, gameMod.roomMatrix);
                    if (tileData && tileData.tileID === 63 && (tileData.roomID === 0 || tileData.roomID === 9999)) {
                        plantsMod.createPlant(tx, ty, null, p.growth, p.type, 0, true);
                    }
                });
            }).catch(err => {
                console.error("❌ Error in chunkPlantsData:", err);
            });
        });

        // 🎯 Ingest binary plants with robust buffer fallback and error handling
        // 🎯 Ingest binary plants with robust buffer fallback and error handling
        socket.on('chunkPlantsBinary', (data) => {
            const { cx, cy, buffer } = data;
            Promise.all([
                import('./plants.js'),
                import('./game.js')
            ]).then(([plantsMod, gameMod]) => {
                // Use activeWorldMatrix first, fallback to gameMod
                const matrix = (activeWorldMatrix && activeWorldMatrix.length > 0) 
                    ? activeWorldMatrix 
                    : (gameMod.worldMatrix && gameMod.worldMatrix.length > 0 ? gameMod.worldMatrix : null);

                const room = (gameMod.roomMatrix && gameMod.roomMatrix.length > 0) ? gameMod.roomMatrix : null;

                plantsMod.loadBinaryPlantsForChunk(
                    cx, 
                    cy, 
                    buffer, 
                    matrix, 
                    room
                );
            }).catch(err => {
                console.error("❌ Error in chunkPlantsBinary:", err);
            });
        });

        socket.on('position', (data) => {
            const { playerbase, projectiles } = data; 

            for (const localId of remotePlayers.keys()) {
                if (!playerbase[localId]) {
                    remotePlayers.delete(localId); 
                }
            }
            
            for (let id in playerbase) {
                if (id !== myID) {
                    const serverP = playerbase[id];
                    let localP = remotePlayers.get(id);

                    if (!localP) {
                        serverP.targetX = serverP.x;
                        serverP.targetY = serverP.y;
                        remotePlayers.set(id, serverP);
                    } else {
                        localP.targetX = serverP.x;
                        localP.targetY = serverP.y;
                        localP.dir = serverP.dir;
                        localP.animFrame = serverP.animFrame;
                        localP.hp = serverP.hp;
                        localP.shield = serverP.shield;
                        localP.isOffline = serverP.isOffline;
                        localP.cc = serverP.cc;
                        localP.ccFlags = serverP.ccFlags;
                        localP.bulwarkTimer = serverP.bulwarkTimer;
                        localP.isInvincible = serverP.isInvincible;
                        localP.isLunge = serverP.isLunge; 
                        if (serverP.pet) localP.pet = serverP.pet;
                    }
                }
            }
            serverProjectiles = projectiles || []; 
        });

        socket.on('chickenTelemetryReport', (data) => {
            console.group("🌾 [CHICKEN CATCH-UP & ACTIVITY TELEMETRY]");
            console.log("Summary of chickens currently active on the map:");
            console.table(data.summaries);
            console.groupEnd();
        });

        // src/multiplayer.js (inside initMultiplayer)

        socket.on('timeSync', (data) => {
            import('./clock.js').then(clock => {
                Object.assign(clock.worldTime, data);
            });
        });

        socket.on('animals', (data) => {
            const { animals: serverAnimals } = data;

            if (serverAnimals) {
                const updatePass = (m) => {
                    serverAnimals.forEach(sa => {
                        const localA = m.animals.find(la => la.id === sa.id);
                        if (!localA) {
                            sa.targetX = sa.x;
                            sa.targetY = sa.y;
                            m.animals.push(sa);
                        } else {
                            localA.targetX = sa.x;
                            localA.targetY = sa.y;
                            localA.dir = sa.dir;
                            localA.state = sa.state;
                            localA.energy = sa.energy; 
                            localA.hp = sa.hp;
                        }
                    });
                    
                    for (let i = m.animals.length - 1; i >= 0; i--) {
                        if (!serverAnimals.some(sa => sa.id === m.animals[i].id)) {
                            m.animals.splice(i, 1);
                        }
                    }
                };

                if (animalsModule) {
                    updatePass(animalsModule);
                } else {
                    import('./animals.js').then(m => {
                        animalsModule = m;
                        updatePass(m);
                    });
                }
            }
        });

        socket.on('fishingCastConfirmed', (data) => {
            hero.fishTimer = data.waitTime / 1000; 
        });

        socket.on('fishingFinished', () => {
            hero.isFishing = false;
            hero.hasBite = false;
        });

        socket.on('plantCreated', (data) => {
            import('./plants.js').then(m => {
                m.createPlant(data.gx, data.gy, null, data.growth, data.type);
            });
        });

        socket.on('plantRemoved', (data) => {
            import('./plants.js').then(m => {
                m.deletePlant(data.gx, data.gy);
            });
        });

        socket.on('remoteAbility', (data) => {}); 
        socket.on('playerLeft', (id) => {
            remotePlayers.delete(id);
        });
    });
}

export function sendChatMessage(msg) {
    if (socket) socket.emit('chatMessage', { message: msg });
}

export function syncInventoryWithServer() {
    if (socket && socket.connected) {
        socket.emit('syncInventory', {
            inventory: hero.inventory,
            equipment: hero.equipment
        });
    }
}

/**
 * 📡 UNIFIED CLIENT-SIDE INTERPOLATION ENGINE (LERP)
 * Runs synchronously without Promise thrashing to eliminate stutters
 */
export function interpolateEntities(delta) {
    // 1. Interpolate Remote Players
    remotePlayers.forEach(p => {
        if (p.targetX !== undefined && p.targetY !== undefined) {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 250) {
                p.x = p.targetX;
                p.y = p.targetY;
            } else if (dist > 0.1) {
                p.x += dx * 15 * delta;
                p.y += dy * 15 * delta;
            } else {
                p.x = p.targetX;
                p.y = p.targetY;
            }
        }
    });

    // src/multiplayer.js (inside interpolateEntities)

    // 2. Interpolate Pasture Animals smoothly from authoritative server stream
    if (animalsModule && animalsModule.animals) {
        animalsModule.animals.forEach(animal => {
            if (animal.targetX !== undefined && animal.targetY !== undefined) {
                const dx = animal.targetX - animal.x;
                const dy = animal.targetY - animal.y;
                const dist = Math.hypot(dx, dy);

                if (Math.abs(dx) > 0.5) {
                    animal.dir = dx > 0 ? 'East' : 'West';
                }

                // Snap if far away (e.g., initial spawn)
                if (dist > 48) {
                    animal.x = animal.targetX;
                    animal.y = animal.targetY;
                    animal.state = 'idle';
                } 
                // Smooth step interpolation along the 16px tile path
                else if (dist > 1.2) {
                    const step = Math.min(dist, (animal.speed || 20) * delta);
                    animal.x += (dx / dist) * step;
                    animal.y += (dy / dist) * step;
                    animal.state = 'walking';
                    animal.animTimer = (animal.animTimer || 0) + delta * 10;
                    animal.frame = Math.floor(animal.animTimer) % 4;
                } else {
                    animal.x = animal.targetX;
                    animal.y = animal.targetY;
                    animal.state = 'idle';
                    animal.frame = 0;
                }
            }
        });
    }
}

function saIsTargetValid(animal) {
    return animal.targetX !== undefined && 
           animal.targetX !== null && 
           animal.targetY !== undefined && 
           animal.targetY !== null;
}