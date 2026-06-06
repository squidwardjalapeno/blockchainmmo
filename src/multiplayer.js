// src/multiplayer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { hero } from './entities.js'; 
import { openChestMenu, handleRemoteChestUpdate, openStoreMenu, handleRemoteStoreUpdate, processClaimedStorage, openCellarMenu, handleRemoteCellarUpdate, openHayStorageMenu, handleRemoteHayStorageUpdate, openWithdrawMenu, executeWithdrawal } from './uiManager.js';
import { setContractAddress } from './blockchainManager.js';
import { handleRemoteTileUpdate } from './bacteria.js';

export const remotePlayers = new Map(); 
export let socket = null;
export let myID = null;
export let playerWallet = null; 
export let serverProjectiles = [];
export let globalUnlockedSystems = ["4_4"];

// 🎯 THE FIX: Track the chest actively requested by the player's GUI
export let playerRequestedChestId = null;
export function setPlayerRequestedChestId(id) {
    playerRequestedChestId = id;
}

// 🎯 THE FIX: Dynamic dependency injection of worldMatrix to bypass circular dependency locks
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
        socket = socketIoFunc(window.location.origin, {
            transports: ['polling', 'websocket'] 
        });
        
        socket.on('secret', (data) => {
            myID = data.myId;
            window.worldSeed = data.seed; 
            
            socket.emit('updateStats', {
                xp: hero.xp,
                inGameUni: hero.inGameUni,
                hp: hero.hp,
                maxHp: hero.maxHp,
                energy: hero.energy,      
                maxEnergy: hero.maxEnergy,
                ad: hero.ad,
                armor: hero.armor,
                magic: hero.magic,
                mr: hero.mr,
                speed: hero.speed
            });
            resolve();
        });

        socket.on('needsCharacterCreation', () => {
            document.getElementById('main-menu').classList.add('hidden');
            document.getElementById('character-creation-menu').classList.remove('hidden');
            import('./uiManager.js').then(module => module.renderCharacterCreation());
        });

        socket.on('tgvUpdate', (data) => {
            import('./entities.js').then(m => {
                m.gameState.tvl = data.tgv; 
                import('./uiManager.js').then(ui => ui.updateHUD()); 
            });
        });

        socket.on('updateEquipment', (serverEquipment) => {
            import('./entities.js').then(m => {
                m.hero.equipment = serverEquipment;
                import('./uiManager.js').then(ui => ui.renderTabContent()); 
            });
        });

        socket.on('updateInventory', (serverInventory) => {
            import('./entities.js').then(m => {
                m.hero.inventory = serverInventory;
                import('./uiManager.js').then(ui => {
                    ui.renderTabContent();
                    
                    const templeMenu = document.getElementById('temple-menu');
                    if (templeMenu && !templeMenu.classList.contains('hidden')) {
                        ui.renderTempleUI();
                    }
                    
                    const chestMenu = document.getElementById('chest-menu');
                    if (chestMenu && !chestMenu.classList.contains('hidden')) {
                        ui.renderChestUI();
                    }
                    
                    const cellarMenu = document.getElementById('cellar-menu');
                    if (cellarMenu && !cellarMenu.classList.contains('hidden')) {
                        ui.renderCellarUI();
                    }

                    const hayMenu = document.getElementById('hay-storage-menu');
                    if (hayMenu && !hayMenu.classList.contains('hidden')) {
                        ui.renderHayStorageUI();
                    }
                });
            });
        });

        socket.on('restoreHero', (data) => {
            hero.xp = data.xp || 0;
            hero.hp = data.hp || 100;
            hero.maxHp = data.maxHp || 100;
            hero.energy = data.energy !== undefined ? data.energy : 100;
            hero.maxEnergy = data.maxEnergy || 100;
            hero.ad = data.ad || 10;
            hero.armor = data.armor || 0;
            hero.magic = data.magic || 10;
            hero.mr = data.mr || 0;
            hero.speed = data.speed || 100;
            hero.spentPoints = data.spentPoints || 0;
            hero.inGameUni = data.inGameUni || 0;
            hero.inventory = data.inventory || []; 
            hero.equipment = data.equipment || { mainHand: null };

            if(data.x !== undefined) hero.x = data.x;
            if(data.y !== undefined) hero.y = data.y;

            if (data.dir) {
                let safeDir = data.dir;
                if (safeDir === 'Down') safeDir = 'South';
                if (safeDir === 'Up') safeDir = 'North';
                if (safeDir === 'Left') safeDir = 'West';
                if (safeDir === 'Right') safeDir = 'East';
                hero.dir = safeDir;
            } else {
                hero.dir = 'South';
            }
            
            hero.charClass = data.charClass || "Paladin";
            hero.skills = data.skills || [];

            import('./uiManager.js').then(ui => {
                ui.updateHUD();
                ui.renderTabContent(); 
            });

            document.getElementById('main-menu').classList.add('hidden');
            const charMenu = document.getElementById('character-creation-menu');
            if (charMenu) charMenu.classList.add('hidden');
            document.getElementById('hud').style.display = 'block';

            console.log("✅ Identity confirmed. Inventory synced.");
        });

        socket.on('balanceUpdated', (data) => { hero.inGameUni = data.inGameUni; });
        
        // 🎯 THE FIX: Only trigger the UI modal if the incoming dataset was requested by the human player
        socket.on('chestData', (data) => { 
            if (data.chestId === playerRequestedChestId) {
                openChestMenu(data.chestId, data.items); 
                playerRequestedChestId = null; // Consume the trigger
            }
        });

        socket.on('chestUpdated', (data) => { handleRemoteChestUpdate(data.chestId, data.items); });
        socket.on('storeData', (data) => { openStoreMenu(data.storeId, data.data); });
        socket.on('storeUpdated', (data) => { handleRemoteStoreUpdate(data.storeId, data.data); });
        socket.on('storageClaimed', (data) => { processClaimedStorage(data.items); });
        socket.on('cellarData', (data) => { openCellarMenu(data.cellarId, data.items); });
        socket.on('cellarUpdated', (data) => { handleRemoteCellarUpdate(data.cellarId, data.items); });
        socket.on('hayStorageData', (data) => { openHayStorageMenu(data.hayStorageId, data.items); });
        socket.on('hayStorageUpdated', (data) => { handleRemoteHayStorageUpdate(data.hayStorageId, data.items); });

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

        socket.on('oreData', (data) => { import('./uiManager.js').then(m => m.openMiningMenu(data.oreId, data.data)); });
        socket.on('oreUpdated', (data) => { import('./uiManager.js').then(m => m.handleRemoteOreUpdate(data.oreId, data.data)); });
        socket.on('oreMessage', (msg) => { alert(msg); });
        
        socket.on('receiveOreLoot', () => {
            import('./items.js').then(items => {
                import('./interactionManager.js').then(m => {
                    const ore = items.createItem(items.ITEM_TYPES.IRON_ORE);
                    if (m.giveItemToHero(ore)) {
                        alert("You collected the Iron Ore!");
                        import('./uiManager.js').then(ui => ui.renderTabContent()); 
                    } else {
                        alert("Your backpack is full! Make room first.");
                    }
                });
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
                        plantsMod.createPlant(tx, ty, null, p.growth, p.type);
                    }
                });
            });
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
                    m.animals.length = 0; 
                    m.animals.push(...serverAnimals); 
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