
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { hero } from './entities.js'; 
import { openChestMenu, handleRemoteChestUpdate, openStoreMenu, handleRemoteStoreUpdate, processClaimedStorage, openCellarMenu, handleRemoteCellarUpdate, openHayStorageMenu, handleRemoteHayStorageUpdate, openWithdrawMenu, executeWithdrawal } from './uiManager.js';
import { setContractAddress } from './blockchainManager.js';

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
            const { playerbase, projectiles } = data; // 👈 Extract projectiles
            
            for (let id in playerbase) {
                if (id !== myID) {
                    remotePlayers.set(id, playerbase[id]); 
                }
            }
            
            serverProjectiles = projectiles || []; // 👈 Store locally
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

// --- Replace this function in src/multiplayer.js ---

// --- Replace this function in src/multiplayer.js ---

export function drawRemotePlayers(ctx2) {
    // We import viewport dynamically to avoid circular dependency issues
    import('./viewport.js').then(({ viewport }) => {
        // Grab the camera center exactly how drawHero does
        const centerX = (window.innerWidth / 2) | 0;
        const centerY = (window.innerHeight / 2) | 0;
        
        const hX = (hero.x + 8) | 0;
        const hY = (hero.y + 8) | 0;

        remotePlayers.forEach(p => {
            // Unify remote player drawing math to the camera grid!
            let sx = (centerX + (p.x - hX)) | 0;
            let sy = (centerY + (p.y - hY)) | 0;

            // Cull off-screen players to save performance
            if (sx < -32 || sx > canvas2.width + 32 || sy < -32 || sy > canvas2.height + 32) return;
            
            // Draw sleeping players as translucent ghosts
            if (p.isOffline) ctx2.globalAlpha = 0.5; 
            
            // Retrieve the correct animation sprite
            import('./assetLoader.js').then(({ images }) => {
                const img = images[`heroWalk${p.dir}`] || images.heroWalkSouth;
                
                // ==========================================
                // 1. VISUAL EFFECTS (Behind Hero)
                // ==========================================
                
                // 🛡️ DRAW FLEETING BULWARK (Spinning Shields)
                if (p.bulwarkTimer && p.bulwarkTimer > 0) {
                    ctx2.strokeStyle = "rgba(100, 200, 255, 0.8)"; 
                    ctx2.lineWidth = 2;
                    const angleOffset = Date.now() / 200; 
                    for (let i = 0; i < 3; i++) {
                        ctx2.beginPath();
                        ctx2.arc(sx + 8, sy + 12, 14, angleOffset + (i * 2.09), angleOffset + (i * 2.09) + 1.0);
                        ctx2.stroke();
                    }
                }

                // ⛓️ DRAW IMPRISON CC (Hard CC Bindings)
                if (p.ccFlags && !p.ccFlags.canMove && !p.ccFlags.canCastNonMovement) {
                    ctx2.strokeStyle = "rgba(0, 255, 255, 0.8)"; // Frosty/Hallowed chains
                    ctx2.lineWidth = 2;
                    ctx2.beginPath();
                    ctx2.ellipse(sx + 8, sy + 14, 8, 4, 0, 0, Math.PI * 2);
                    ctx2.stroke();
                }

                // 👼 DRAW HEAVEN'S HALO (Invincibility Glow)
                if (p.isInvincible) {
                    ctx2.shadowColor = "rgba(255, 255, 255, 0.9)";
                    ctx2.shadowBlur = 15;

                    const haloY = sy - 6 + (Math.sin(Date.now() / 150) * 2); 
                    
                    ctx2.strokeStyle = "rgba(255, 215, 0, 1.0)"; 
                    ctx2.lineWidth = 2;
                    ctx2.beginPath();
                    ctx2.ellipse(sx + 8, haloY, 6, 2, 0, 0, Math.PI * 2);
                    ctx2.stroke();
                    
                    ctx2.strokeStyle = "rgba(255, 255, 255, 0.8)";
                    ctx2.lineWidth = 1;
                    ctx2.beginPath();
                    ctx2.ellipse(sx + 8, haloY, 5, 1, 0, 0, Math.PI * 2);
                    ctx2.stroke();
                }

                // ==========================================
                // 2. DRAW HERO SPRITE
                // ==========================================
                ctx2.drawImage(img, (p.animFrame || 0) * 16, 0, 16, 16, sx, sy, 16, 16);
                
                // Reset graphics settings
                ctx2.shadowBlur = 0;
                ctx2.globalAlpha = 1.0; 

                // ==========================================
                // 3. VISUAL EFFECTS (In Front of Hero)
                // ==========================================
                
                // 💥 DRAW FEVER RESONANCE MARK
                if (p.cc && p.cc.hasResonance) {
                    ctx2.fillStyle = "#FF1493"; // Deep Pink
                    ctx2.beginPath();
                    ctx2.moveTo(sx + 8, sy - 14);
                    ctx2.lineTo(sx + 10, sy - 12);
                    ctx2.lineTo(sx + 8, sy - 10);
                    ctx2.lineTo(sx + 6, sy - 12);
                    ctx2.fill();
                }

                // ==========================================
                // 4. UI: NAMEPLATE & HEALTH BARS
                // ==========================================
                ctx2.fillStyle = p.isOffline ? "#888888" : "white"; 
                ctx2.font = "8px Arial";
                ctx2.textAlign = "center";
                const displayName = p.isOffline ? "SLEEPING" : p.id.substring(0, 4);
                ctx2.fillText(displayName, sx + 8, sy - 8); 
                
                // Base Health Bar (Red)
                const barW = 16, barH = 2;
                ctx2.fillStyle = "black";
                ctx2.fillRect(sx, sy - 4, barW, barH);
                
                // Shield Bar (Cyan, draws under HP if active)
                if (p.shield && p.shield > 0) {
                    ctx2.fillStyle = "rgba(100, 150, 255, 0.8)"; 
                    const shieldRatio = Math.min(1.0, p.shield / (p.maxHp || 100)); 
                    ctx2.fillRect(sx, sy - 2, barW * shieldRatio, barH);
                }

                // HP Fill (Red)
                ctx2.fillStyle = "#FF0000"; 
                ctx2.fillRect(sx, sy - 4, barW * (p.hp / (p.maxHp || 100)), barH);

                // ==========================================
                // 5. 🤖 DRAW REMOTE ZENITH GUARDIANS
                // ==========================================
                if (p.pet && p.pet.active) {
                    const petSx = (centerX + (p.pet.x - hX)) | 0;
                    const petSy = (centerY + (p.pet.y - hY)) | 0;
                    
                    import('./animations.js').then(({ getPetAnimationData }) => {
                        const petAnim = getPetAnimationData(p.pet, images);

                        if (petAnim.img && petAnim.img.complete) {
                            ctx2.drawImage(
                                petAnim.img,
                                petAnim.srcX, petAnim.srcY, petAnim.srcW, petAnim.srcH,
                                petSx - 12, petSy - 12, 24, 24
                            );
                        }

                        // Draw Pet Health Bar
                        const petHpPct = p.pet.hp / (p.maxHp * 1.8);
                        ctx2.fillStyle = "black";
                        ctx2.fillRect(petSx - 12, petSy - 16, 24, 2);
                        ctx2.fillStyle = "lime";
                        ctx2.fillRect(petSx - 12, petSy - 16, 24 * Math.max(0, petHpPct), 2);
                    });
                }
            });
        });
    });
}