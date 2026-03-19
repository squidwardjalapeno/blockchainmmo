import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { spawnProjectile } from './combat.js';
import { hero } from './entities.js'; // 👈 ADD THIS LINE
// 3. The Sync (Required to pull the 250 points from Polygon)
import { refreshOnChainPoints } from './overworldGame.js';

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
                socket.emit('identifyWallet', playerWallet);

                // ✨ ADD THIS LINE HERE:
                await refreshOnChainPoints(); 
            } catch (err) {
                console.error("User denied wallet access", err);
            }
        } else {
            alert("Please install MetaMask!");
        }
    });

    // A. HANDSHAKE: Get your unique ID and the World Seed
    socket.on('secret', (data) => {
        myID = data.myId;
        console.log(`📡 Connected! My ID: ${myID} | World Seed: ${data.seed}`);
        // In the future, we can use this seed to sync the MapGenerator
    });

    // --- 🆕 STEP 2: CATCH THE VOUCHER ---
    socket.on('receiveVoucher', (voucher) => {
        console.log("📜 NEW VOUCHER RECEIVED!", voucher);
        pendingVouchers.push(voucher);
        // We can eventually draw a "(!) Redeeming available" alert on the HUD
    });

    // B. SYNC: Receive positions of all players from the server
    socket.on('position', (data) => {
        const { playerbase } = data;
        
        for (let id in playerbase) {
            // Don't add yourself to the "Remote Players" list
            if (id !== myID) {
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
 * RENDERER HOOK: Draws other players on the Entity Layer (ctx2)
 */
export function drawRemotePlayers(ctx2) {
    const [offX, offY] = viewport.offset;

    if (remotePlayers.size > 0) {
        // This will tell you exactly where the other guy is
        remotePlayers.forEach(p => {
            console.log(`Other Player is at: ${p.x}, ${p.y} | I am at: ${hero.x}, ${hero.y}`);
        });
    }



    remotePlayers.forEach(p => {
        // Only draw if the player is within the viewport bounds
        const sx = Math.floor(offX + p.x);
        const sy = Math.floor(offY + p.y);

        // Simple culling: don't draw if far off-screen
        if (sx > -32 && sx < window.innerWidth + 32 && sy > -32 && sy < window.innerHeight + 32) {
            
            // Pick the correct image based on their direction
            const img = images[`hero${p.dir}`] || images.heroDown;
            
            // Draw the Remote Hero (16x24 dest size, matches your hero)
            ctx2.drawImage(
                img,
                p.animFrame * 48, 0, 48, 72, // Source (48x72 frames)
                sx, sy - 8,                   // Destination (Y-8 for foot offset)
                16, 24                        // Scale
            );

            // OPTIONAL: Draw a small name tag
            ctx2.fillStyle = "white";
            ctx2.font = "10px Arial";
            ctx2.textAlign = "center";
            ctx2.fillText(`Player ${p.id.substring(0, 4)}`, sx + 8, sy - 12);
        }
    });
}