import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
//import { spawnProjectile } from './combat.js';
import { hero } from './entities.js'; // 👈 ADD THIS LINE
// 3. The Sync (Required to pull the 250 points from Polygon)
import { refreshOnChainPoints } from './blockchainManager.js';

import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js';

// 1. GLOBAL MULTIPLAYER STATE
export const remotePlayers = new Map(); // Store other players by ID
export let socket = null;
export let myID = null;

export let playerWallet = null; // 👈 STORE THE ADDRESS HERE
export let pendingVouchers = []; // 👈 STORE VOUCHERS TO REDEEM LATER



/**
 * Initializes the connection to the server
 */
export async function initMultiplayer() {
    socket = io();

    const connectBtn = document.getElementById('connectBtn');
    
    connectBtn.addEventListener('click', async () => {
        if (window.ethereum) {
            try {
                // ethers v6 syntax for requesting accounts
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_requestAccounts", []);
                
                playerWallet = accounts[0]; // Take the first address
                console.log("🦊 Wallet Connected:", playerWallet);
                
                // Update UI
                connectBtn.innerText = `Connected: ${playerWallet.substring(0, 6)}...`;
                
                // Tell the server who we are
                // Inside connectBtn.addEventListener in multiplayer.js
socket.emit('identifyWallet', {
    address: playerWallet,
    x: hero.x,
    y: hero.y
});

                // ✨ ADD THIS LINE HERE:
                await refreshOnChainPoints(); 
            } catch (err) {
                console.error("User denied wallet access", err);
            }
        } else {
            alert("Please install MetaMask!");
        }
    });

    // Inside multiplayer.js
socket.on('secret', (data) => {
    myID = data.myId;
    window.worldSeed = data.seed; // 👈 SAVE THIS HERE

    // ✨ INITIAL SYNC: Tell the server who we are and what we're worth
    socket.emit('updateStats', {
        xp: hero.xp,        // Sends 1000
        hp: hero.hp,
        maxHp: hero.maxHp,
        ad: hero.ad,
        armor: hero.armor,
        magic: hero.magic,
        mr: hero.mr,
        speed: hero.speed
    });
    console.log(`📡 Connected! Seed: ${data.seed}`);
});

socket.on('restoreHero', (data) => {
    // Restore stats
    hero.xp = data.xp;
    hero.maxHp = data.maxHp;
    hero.hp = data.hp;
    hero.ad = data.ad;
    hero.armor = data.armor;
    hero.magic = data.magic;
    hero.mr = data.mr;
    hero.speed = data.speed;
    hero.spentPoints = data.spentPoints;

    // --- 📍 THE SNAP: Only happens for returning players ---
    if(data.x !== undefined) hero.x = data.x;
    if(data.y !== undefined) hero.y = data.y;

    console.log("✅ Identity confirmed. Stats and Position restored from Database.");
});


    // --- 🆕 STEP 2: CATCH THE VOUCHER ---
    socket.on('receiveVoucher', (voucher) => {
        console.log("📜 NEW VOUCHER RECEIVED!", voucher);
        pendingVouchers.push(voucher);
        // We can eventually draw a "(!) Redeeming available" alert on the HUD
    });

    // --- ⚔️ PVP SYNC LISTENERS ---

// 1. Update HP when ANY player is hit
socket.on('playerHit', (data) => {
    const victim = (data.victimId === myID) ? hero : remotePlayers.get(data.victimId);
    
    if (victim) {
        // Sync HP from Server Truth
        victim.hp = data.newHp;
        
        // CLEANUP: If our current target just hit 0, stop attacking immediately
        if (hero.target && data.victimId === hero.target.id && data.newHp <= 0) {
            stopCombat();
        }

        console.log(`💥 ${data.victimId} hit! HP: ${victim.hp}`);
    }
});

// 2. Handle Deaths
socket.on('playerKilled', (data) => {
    console.log(`💀 ${data.victimId} slain by ${data.killerId}!`);

    console.log("📥 DEATH DATA:", data); // Check if 'newKillerXp' is in this object!

    // --- ✨ THE MISSING LINK: XP UPDATE ---
    if (data.killerId === myID) {
        // Capture the server's truth for your new XP
        const oldXp = hero.xp;
        hero.xp = data.newAttackerXp; 
        
        console.log(`🎯 BOUNTY RECEIVED! XP: ${oldXp} -> ${hero.xp} (+${data.xpGained})`);
    }

    // Ensure we stop attacking if this was our target
    if (hero.target && data.victimId === hero.target.id) {
        stopCombat();
    }
});

/**
 * HELPER: Reset combat states in one place
 */
function stopCombat() {
    hero.isAttacking = false;
    hero.target = null;
    hero.isWindingUp = false;
    hero.attackTimer = 0; // Reset cooldown so we're ready for the next fight
}


    // 3. Handle Respawn
    socket.on('playerRespawn', (data) => {
        const p = (data.id === myID) ? hero : remotePlayers.get(data.id);
        if (p) {
            p.hp = data.hp;
            // Server resets their X/Y, so the 'position' sync will move them
            console.log(`✨ Player ${data.id} has respawned.`);
        }
    });


    // B. SYNC: Receive positions of all players from the server
    socket.on('position', (data) => {
        const { playerbase } = data;
        
        for (let id in playerbase) {
            // Don't add yourself to the "Remote Players" list
            if (id !== myID) {
            let p = remotePlayers.get(id);
            if (p && hero.target && hero.target.id === id) {
                // 🕵️ DEBUG LOG: Check if the server is forcing the HP back to 40
                if (p.hp !== playerbase[id].hp) {
                    console.log(`⚠️ HP SYNC OVERWRITE: Local was ${p.hp}, Server says ${playerbase[id].hp}`);
                }
            }
            
            // This is the line doing the damage:
            remotePlayers.set(id, playerbase[id]); 
        }
        }
    });

    // C. COMBAT: See when another player fires a spell
    socket.on('remoteAbility', (data) => {
        console.log(`💥 Remote Spell from ${data.ownerId}`);
        // Reuse your existing projectile system!
        // We pass the remote player object as the "owner"
        spawnProjectile(remotePlayers.get(data.ownerId), data.targetX, data.targetY, 400, 100, 6);
    });

    // D. CLEANUP: Remove players who leave
    socket.on('playerLeft', (id) => {
        remotePlayers.delete(id);
        console.log(`❌ Player ${id} left the game.`);
    });
}

/**
 * UPDATED: Draws remote players with HP bars and Wind-up Shake
 */
export function drawRemotePlayers(ctx2) {
    const [offX, offY] = viewport.offset;

    remotePlayers.forEach(p => {
        let sx = Math.floor(offX + p.x);
        let sy = Math.floor(offY + p.y);

        if (sx < -32 || sx > window.innerWidth + 32 || sy < -32 || sy > window.innerHeight + 32) return;

        // --- 💤 OFFLINE VISUALS ---
        if (p.isOffline) {
            ctx2.globalAlpha = 0.5; // Make them look faded/sleeping
        }

        const img = images[`hero${p.dir}`] || images.heroDown;
        ctx2.drawImage(
            img,
            p.animFrame * 48, 0, 48, 72,
            sx, sy - 8,
            16, 24
        );

        ctx2.globalAlpha = 1.0; // Reset alpha for everything else

        // --- NAME TAG ---
        ctx2.fillStyle = p.isOffline ? "#888888" : "white"; // Gray text for offline
        ctx2.font = "8px Arial";
        ctx2.textAlign = "center";
        
        // Show "SLEEPING" or their ID
        const displayName = p.isOffline ? "SLEEPING" : p.id.substring(0, 4);
        ctx2.fillText(displayName, sx + 8, sy - 18);

        // --- HP BAR ---
        const barW = 16, barH = 2;
        ctx2.fillStyle = "black";
        ctx2.fillRect(sx, sy - 14, barW, barH);
        ctx2.fillStyle = "#FF0000"; 
        ctx2.fillRect(sx, sy - 14, barW * (p.hp / (p.maxHp || 100)), barH);
    });
}