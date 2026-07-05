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

export const doorStates = new Map(); // key: "gx_gy", value: { locked: boolean }

export const storeDbCache = new Map(); 
export const hayStorageCache = new Map(); 
export const chestCache = new Map(); 

// Track the chest actively requested by the player's GUI
export let playerRequestedChestId = null;
export function setPlayerRequestedChestId(id) {
    playerRequestedChestId = id;
}

// Dynamic dependency injection of worldMatrix to bypass circular dependency locks
export let activeWorldMatrix = null;
export function setWorldMatrix(matrix) {
    activeWorldMatrix = matrix;
}

export function setPlayerWallet(address) {
    playerWallet = address;
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
        
        // 🎯 THE FIX: Force 'websocket' transport to bypass polling negotiations and load instantly
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

        // 🎯 THE FIX: Register UI listeners dynamically to break the circular import cycle entirely
        import('./uiManager.js').then(ui => {
            ui.setupMultiplayerListeners(socket);
        });

        socket.on('position', (data) => {
            const { playerbase, projectiles, animals: serverAnimals } = data; 

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

            if (serverAnimals) {
                import('./animals.js').then(m => {
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
                });
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

export function initChatListener() {
    if (socket) {
        socket.on('chatMessage', (data) => {
            const chatBox = document.getElementById('chat-messages');
            if (!chatBox) return;

            const msgDiv = document.createElement('div');
            msgDiv.innerHTML = `<span style="color: var(--banana);">${data.sender}:</span> ${data.message}`;
            chatBox.appendChild(msgDiv);
            chatBox.scrollTop = chatBox.scrollHeight;

            if (chatBox.children.length > 10) {
                chatBox.removeChild(chatBox.firstChild);
            }
        });
    }
}

export function syncInventoryWithServer() {
    if (socket && socket.connected) {
        socket.emit('syncInventory', {
            inventory: hero.inventory,
            equipment: hero.equipment
        });
    }
}

export function updateRemotePlayers(delta) {
    remotePlayers.forEach(p => {
        if (p.targetX !== undefined && p.targetY !== undefined) {
            p.x += (p.targetX - p.x) * 15 * delta;
            p.y += (p.targetY - p.y) * 15 * delta;
        }
    });
}