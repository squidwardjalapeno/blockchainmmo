// src/multiplayer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { hero } from './entities.js'; 
import { setContractAddress } from './blockchainManager.js';
import { handleRemoteTileUpdate } from './bacteria.js';

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
                console.log("🛡️ Received Fleeting Bulwark from an ally!");
                
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

        socket.on('animals', (data) => {
            const { animals: serverAnimals } = data;

            if (serverAnimals) {
                // Ensure the module is cached before resolving references
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
                m.createPlant(data.gx, data.gy, fertilityMatrix, data.growth, data.type);
            });
        });

        socket.on('plantRemoved', (data) => {
            import('./plants.js').then(m => {
                m.plants.delete(`${data.gx}_${data.gy}`);
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
    // 1. Interpolate Remote Players (HOT - 30 Hz updates)
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

    // 2. Interpolate Pasture Animals (WARM - 5 Hz updates)
    // Synchronous array iteration via our cached module reference
    if (animalsModule && animalsModule.animals) {
        animalsModule.animals.forEach(animal => {
            if (saIsTargetValid(animal)) {
                const dx = animal.targetX - animal.x;
                const dy = animal.targetY - animal.y;
                const dist = Math.hypot(dx, dy);

                if (dist > 120) {
                    animal.x = animal.targetX;
                    animal.y = animal.targetY;
                } else if (dist > 0.1) {
                    animal.x += dx * 8 * delta;
                    animal.y += dy * 8 * delta;
                } else {
                    animal.x = animal.targetX;
                    animal.y = animal.targetY;
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