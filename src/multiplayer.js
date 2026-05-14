
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { hero } from './entities.js'; 
import { openChestMenu, handleRemoteChestUpdate, openStoreMenu, handleRemoteStoreUpdate, processClaimedStorage, openCellarMenu, handleRemoteCellarUpdate, openHayStorageMenu, handleRemoteHayStorageUpdate, openWithdrawMenu, executeWithdrawal } from './uiManager.js';
import { setContractAddress } from './blockchainManager.js';
import { handleRemoteTileUpdate } from './bacteria.js';

// To this:
if (typeof window !== 'undefined') {
    logStep("multiplayer.js");
}

export const remotePlayers = new Map(); 
export let socket = null;
export let myID = null;
export let playerWallet = null; 
export let serverProjectiles = [];
// --- Add near the top of src/multiplayer.js ---
export let globalUnlockedSystems = ["4_4"];

// 👇 ADD THIS SETTER FUNCTION 👇
export function setPlayerWallet(address) {
    playerWallet = address;
}

export function initMultiplayer() {
    return new Promise((resolve) => {
        
        // 🚨 2DS OFFLINE BYPASS
        // If the HTML script tag for socket.io is missing or failed to load
        if (typeof io === 'undefined' && typeof window.io === 'undefined') {
            if (window.logStep) window.logStep("OFFLINE MODE: No Socket.io");
            
            // Give the hero default stats so the render loop doesn't crash on undefined math
            hero.xp = 0;
            hero.maxHp = 100;
            hero.hp = 100;
            hero.energy = 100;
            hero.maxEnergy = 100;
            hero.speed = 100;
            hero.ad = 10;
            hero.armor = 0;
            hero.inGameUni = 0;
            
            resolve(); // ⚡ Instantly unlock mainInit() to continue loading
            return;
        }

        // --- Standard Multiplayer Connection ---
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

        // 🆕 NEW: If the server says we don't have an account
        socket.on('needsCharacterCreation', () => {
            document.getElementById('main-menu').classList.add('hidden');
            document.getElementById('character-creation-menu').classList.remove('hidden');
            import('./uiManager.js').then(module => module.renderCharacterCreation());
        });

        // 🔄 UPDATED: When the server sends us our character data
        socket.on('restoreHero', (data) => {
            hero.xp = data.xp;
            hero.maxHp = data.maxHp;
            hero.hp = data.hp;
            if (data.energy !== undefined) hero.energy = data.energy; 
            if (data.maxEnergy !== undefined) hero.maxEnergy = data.maxEnergy;
            hero.ad = data.ad;
            hero.armor = data.armor;
            hero.magic = data.magic;
            hero.mr = data.mr;
            hero.speed = data.speed;
            hero.spentPoints = data.spentPoints;
            if (data.inGameUni !== undefined) hero.inGameUni = data.inGameUni; 
            if(data.x !== undefined) hero.x = data.x;
            if(data.y !== undefined) hero.y = data.y;
            
            // 🆕 DIRECTION TRANSLATOR (Fixes old save files!)
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
            
            // 🆕 LOAD CLASS DATA
            hero.charClass = data.charClass || "Peasant";
            hero.skills = data.skills || [];

            // 🆕 CLEAR MENUS AND SHOW HUD
            document.getElementById('main-menu').classList.add('hidden');
            const charMenu = document.getElementById('character-creation-menu');
            if (charMenu) charMenu.classList.add('hidden');
            document.getElementById('hud').style.display = 'block';

            console.log("✅ Identity confirmed. Stats and Position restored.");
        });

        socket.on('balanceUpdated', (data) => { hero.inGameUni = data.inGameUni; });
        socket.on('receiveWithdrawalVoucher', (voucher) => { executeWithdrawal(voucher); });
        socket.on('chestData', (data) => { openChestMenu(data.chestId, data.items); });
        socket.on('chestUpdated', (data) => { handleRemoteChestUpdate(data.chestId, data.items); });
        socket.on('storeData', (data) => { openStoreMenu(data.storeId, data.data); });
        socket.on('storeUpdated', (data) => { handleRemoteStoreUpdate(data.storeId, data.data); });
        socket.on('storageClaimed', (data) => { processClaimedStorage(data.items); });
        socket.on('cellarData', (data) => { openCellarMenu(data.cellarId, data.items); });
        socket.on('cellarUpdated', (data) => { handleRemoteCellarUpdate(data.cellarId, data.items); });
        socket.on('hayStorageData', (data) => { openHayStorageMenu(data.hayStorageId, data.items); });
        socket.on('hayStorageUpdated', (data) => { handleRemoteHayStorageUpdate(data.hayStorageId, data.items); });

        // --- Inside initMultiplayer() in src/multiplayer.js ---

        // 💬 RECEIVE CHAT MESSAGES
        socket.on('chatMessage', (data) => {
            const chatBox = document.getElementById('chat-messages');
            if (!chatBox) return;

            const msgDiv = document.createElement('div');
            // Format: [Name]: Message
            msgDiv.innerHTML = `<span style="color: var(--banana);">${data.sender}:</span> <span style="color: white;">${data.message}</span>`;
            
            chatBox.appendChild(msgDiv);

            // Auto-scroll to the bottom so the newest message is always visible
            chatBox.scrollTop = chatBox.scrollHeight;

            // Keep only the last 15 messages so it doesn't lag the game
            if (chatBox.children.length > 15) {
                chatBox.removeChild(chatBox.firstChild);
            }
        });
        
        // 1. Handle Knockbacks
        socket.on('forcedMovement', (data) => {
            const p = (data.id === myID) ? hero : remotePlayers.get(data.id);
            if (p) {
                p.x = data.x;
                p.y = data.y;
                // If it happened to us, interrupt our current movement/attack
                if (data.id === myID) {
                    hero.isAttacking = false;
                    hero.isWindingUp = false;
                }
            }
        });

        // 2. Update playerHit to handle the Bubble popping
        socket.on('playerHit', (data) => {
            const victim = (data.victimId === myID) ? hero : remotePlayers.get(data.victimId);
            if (victim) {
                victim.hp = data.newHp;
                if (data.newShield !== undefined) victim.shield = data.newShield;
                
                // 🆕 If the server says the bubble popped, remove it locally!
                if (data.bubblePopped) {
                    if (victim === hero) hero.buffs.divineBubble = false;
                    else victim.hasDivineBubble = false;
                }

                // ... inside playerHit ...
            if (data.bubblePopped === undefined) { 
                // A normal hit occurred. If we had resonance, assume it was consumed.
                // (This is a quick shortcut so we don't have to send a separate CC clear packet!)
                if (victim === hero) hero.cc.hasResonance = false;
                else victim.cc.hasResonance = false;
            }
                
                if (hero.target && data.victimId === hero.target.id && data.newHp <= 0) {
                    hero.isAttacking = false; hero.target = null; hero.isWindingUp = false; hero.attackTimer = 0;
                }
            }
        });

        // 🍅 RECEIVE DROPPED ITEMS / BACTERIA UPDATES FROM OTHERS
        socket.on('syncTile', (data) => {
            handleRemoteTileUpdate(data);
        });

        // Listen for incoming heals
        socket.on('playerHealed', (data) => {
            const p = (data.targetId === myID) ? hero : remotePlayers.get(data.targetId);
            if (p) {
                p.hp = data.newHp;
                // Optional: You could spawn green '+10' floating text here later!
            }
        });

        // --- ADD THIS inside initMultiplayer() in src/multiplayer.js ---

        // 🛡️ Receive Buffs from Allies!
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

                // Tell the server we have new stats so everyone else sees us as tanky!
                socket.emit('updateStats', { armor: hero.armor, mr: hero.mr });
            }
        });

        // Handle Crowd Control Events
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

                // 🆕 Resonance Tracking
                if (data.ccType === 'resonanceApply') victim.cc.hasResonance = true;
                if (data.ccType === 'resonanceFade') victim.cc.hasResonance = false;
            }
        });

        // 💨 Receive Cooldown Refunds (e.g. from Zephyr)
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

        socket.on('position', (data) => {
            const { playerbase, projectiles } = data; 

            // 👇 THE FIX: Purge ghosts from our local map!
            for (const localId of remotePlayers.keys()) {
                if (!playerbase[localId]) {
                    remotePlayers.delete(localId); // Player disconnected, delete them
                }
            }
            
            for (let id in playerbase) {
                if (id !== myID) {
                    const serverP = playerbase[id];
                    let localP = remotePlayers.get(id);

                    if (!localP) {
                        // New player: Initialize them exactly where the server says
                        serverP.targetX = serverP.x;
                        serverP.targetY = serverP.y;
                        remotePlayers.set(id, serverP);
                    } else {
                        // Existing player: Update target destination, stats, and anim frame
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
                        if (serverP.pet) localP.pet = serverP.pet;
                    }
                }
            }
            serverProjectiles = projectiles || []; 
        });

        // --- Inside initMultiplayer() ---
        socket.on('mapState', (data) => {
            globalUnlockedSystems = data.unlockedSystems;
        });

        socket.on('systemUnlocked', (data) => {
            globalUnlockedSystems = data.unlockedSystems;
            
            // If we were the one who bought it, update our local UNI balance
            if (data.heroId === myID) {
                hero.inGameUni = data.newBalance;
                import('./uiManager.js').then(m => m.updateHUD());
            }

            console.log(`☁️ The clouds have parted! A new system is unlocked!`);
            // You can play a fanfare sound or display big text here later!
        });

        socket.on('remoteAbility', (data) => {}); // Hidden for barebones

        socket.on('playerLeft', (id) => {
            remotePlayers.delete(id);
        });
    });
}

// 💬 CHAT FUNCTIONS
export function sendChatMessage(msg) {
    if (socket) socket.emit('chatMessage', { message: msg });
}

export function initChatListener() {
    if (socket) {
        socket.on('chatMessage', (data) => {
            const chatBox = document.getElementById('chat-messages');
            if (!chatBox) return;

            const msgDiv = document.createElement('div');
            // Format: [Name]: Message
            msgDiv.innerHTML = `<span style="color: var(--banana);">${data.sender}:</span> ${data.message}`;
            chatBox.appendChild(msgDiv);

            // Auto-scroll to bottom
            chatBox.scrollTop = chatBox.scrollHeight;

            // Only keep the last 10 messages so the DOM doesn't get bloated
            if (chatBox.children.length > 10) {
                chatBox.removeChild(chatBox.firstChild);
            }
        });
    }
}
// Paste this at the bottom of src/multiplayer.js

// Add this at the bottom of src/multiplayer.js
export function updateRemotePlayers(delta) {
    remotePlayers.forEach(p => {
        if (p.targetX !== undefined && p.targetY !== undefined) {
            // Glide smoothly towards the target destination (Lerp)
            p.x += (p.targetX - p.x) * 15 * delta;
            p.y += (p.targetY - p.y) * 15 * delta;
        }
    });
}
