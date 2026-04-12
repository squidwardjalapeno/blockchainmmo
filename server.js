// 1. Modern Imports (ES Modules)
import { CONFIG } from './public/js/config.js';
// 4. Import your custom logic (Make sure voucherSystem.js uses 'export')
import { createVoucher } from './public/js/voucherSystem.js'; 
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

// 2. Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. Initialize App & Socket
const app = express();
const http = createServer(app);
const io = new Server(http);

const POINT_VALUES = {
    "fish": 500,
    "grass_item": 50,
    "chicken_poop": 20,
    "cooked_fish": 800
};

// 5. Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// 6. Global Game State
const players = {};
const worldSeed = Math.floor(Math.random() * 999999);

let userDb = {};

// --- 🗑️ WIPE ON START: Delete old records every time server boots ---
if (fs.existsSync('persistence.json')) {
    try {
        fs.unlinkSync('persistence.json');
        console.log("🗑️ Persistence file deleted. Starting with a fresh database.");
    } catch (err) {
        console.error("Error deleting persistence file:", err);
    }
} else {
    console.log("🆕 No database found. Starting fresh.");
}




io.on('connection', (socket) => {
    console.log(`✨ Player Connected: ${socket.id}`);

    players[socket.id] = {
        id: socket.id,
        x: 1600,
        y: 1600,
        hp: CONFIG.HERO_HP,
        maxHp: CONFIG.HERO_HP, // Added maxHp for bars
        ad: CONFIG.HERO_ATTACK,
        armor: CONFIG.HERO_ARMOR,
        magic: CONFIG.HERO_MAGIC,
        mr: CONFIG.HERO_MAGIC_RESISTANCE,
        dir: 'Down',
        animFrame: 0,
        isMoving: false,
        isWindingUp: false // Sync the "Shake" animation
    };

    socket.emit('secret', { seed: worldSeed, myId: socket.id });

    // A. Handle Movement & Animation States
    socket.on('movement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].dir = data.dir;
            players[socket.id].animFrame = data.animFrame;
            players[socket.id].isMoving = data.isMoving;
            players[socket.id].isWindingUp = data.isWindingUp; // New: Sync the punch wind-up
            players[socket.id].currentTileID = data.currentTileID;
        }
    });



socket.on('updateStats', (data) => {
    const p = players[socket.id];
    if (!p) return;

    // 1. LIVE UPDATE: Merge the data into the active player object
    Object.assign(p, data);
    
    // Log for debugging (like your old listener did)
    console.log(`📊 Stats Sync [${socket.id}]: Armor ${p.armor} | XP ${p.xp}`);

    // 2. PERSISTENCE: If they are logged in via wallet, save to the "Cloud"
    if (socket.wallet) {
        // Create a clean "Save State" copy (no circular references)
        userDb[socket.wallet] = {
            ...p,
            id: undefined,  // Strip temporary socket ID
            target: null    // Strip combat target
        };

        // Write to disk (Safe for JSON)
        fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
    }
});


// --- ⚔️ UPDATED: LOGARITHMIC ARMOR SCALING ---
socket.on('pvpAttack', (data) => {
    const victim = players[data.targetId];
    const attacker = players[socket.id];

    if (victim && attacker && victim.hp > 0) {
        // 1. DAMAGE CALCULATION (Logarithmic Scaling)
        // This math ensures: 
        // 10 Armor = 0.5 multiplier (50% reduction)
        // 100 Armor = 0.25 multiplier (75% reduction)
        // 1000 Armor = 0.125 multiplier (87.5% reduction)
        
        const victimArmor = Math.max(1, victim.armor || 1); // Prevent Log10(0) errors
        const armorReduction = Math.pow(0.5, Math.log10(victimArmor));
        
        const finalDamage = Math.max(1, Math.floor(attacker.ad * armorReduction));

        // 2. APPLY DAMAGE
        victim.hp -= finalDamage;
        console.log(`⚔️ ${attacker.id} hit ${victim.id} for ${finalDamage} (Blocked: ${Math.round((1 - armorReduction) * 100)}%)`);

        // 3. BROADCAST THE HIT
        io.emit('playerHit', {
            victimId: victim.id,
            newHp: victim.hp,
            attackerId: attacker.id
        });

        // 4. DEATH HANDLER
        if (victim.hp <= 0) {

            // Log this to see what the server actually sees
        console.log(`DEBUG: Victim ${victim.id} had ${victim.xp} XP on server.`);

            victim.hp = 0;
            
            // Calculate XP (30% of total)
            const xpGain = (victim.xp || 0) * 0.30;
            attacker.xp = (attacker.xp || 0) + xpGain;

            // ✨ ADD THIS: If victim has a wallet, update their DB record immediately
    if (victim.wallet) {
        userDb[victim.wallet].hp = 0;
        userDb[victim.wallet].xp = victim.xp; // Save the loss of XP too
        fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
    }

            io.emit('playerKilled', { 
                victimId: victim.id, 
                killerId: attacker.id,
                xpGained: xpGain,
                newAttackerXp: attacker.xp
            });

            console.log(`💀 Player ${victim.id} was slain! Killer earned ${xpGain} XP.`);

            
        }
    }
});

    // server.js
socket.on('syncTile', (data) => {
    // Keep the name consistent: syncTile -> syncTile
    socket.broadcast.emit('syncTile', data);
});

    // G. Handle Item Drops
    socket.on('dropItem', (data) => {
        // data = { gx, gy, itemType, health, virulence }
        socket.broadcast.emit('remoteDrop', data);
    });

    // --- 🆕 STEP 2: THE SACRIFICE LISTENER ---
    // Place this right before your 'disconnect' handler
    socket.on('sacrificeToWell', async (data) => {
        // data should include { itemType, playerWalletAddress }
        const points = POINT_VALUES[data.itemType] || 10;
        
        // Nonce should ideally be tracked in a database, 
        // but a random large number works for your first test!
        const nonce = Math.floor(Math.random() * 1000000000);

        try {
            // Generate the mathematically signed "Permission Slip"
            const voucher = await createVoucher(data.playerWalletAddress, points, nonce);

            // Send the signed voucher ONLY to the player who sacrificed
            socket.emit('receiveVoucher', voucher);
            
            console.log(`📜 Voucher issued: ${points} pts to ${data.playerWalletAddress}`);
        } catch (err) {
            console.error("Voucher generation failed:", err);
        }
    });

   socket.on('identifyWallet', (data) => {
    const address = (typeof data === 'object') ? data.address : data;
    if (!address) return;

    socket.wallet = address;

    // 1. Check if this wallet already has a body standing in the game world (Sleeper)
    let existingSocketId = Object.keys(players).find(id => players[id].wallet === address);

    if (existingSocketId) {
        console.log(`🔗 ${address} is re-possessing their stationary body (${existingSocketId}).`);
        
        // --- 👻 THE GHOST FIX ---
        // Tell all clients to remove the old stationary sprite immediately
        io.emit('playerLeft', existingSocketId);

        // Transfer the data from the sleeper body to the NEW active socket
        players[socket.id] = {
            ...players[existingSocketId],
            id: socket.id,       // Assign new socket ID
            isOffline: false     // Mark as active
        };

        // Remove the old "Ghost" reference from the server memory
        if (existingSocketId !== socket.id) {
            delete players[existingSocketId];
        }

        // Tell the player's client to snap to this position and restore stats
        socket.emit('restoreHero', players[socket.id]);
    } 
    // 2. If no body in world, check the database (Safe Logout recovery)
    else if (userDb[address]) {
        console.log(`💾 ${address} returning from safe logout.`);
        players[socket.id] = { ...userDb[address], id: socket.id, isOffline: false };
        socket.emit('restoreHero', players[socket.id]);
    } 
    // 3. Brand new player (First time ever)
    else {
        console.log(`🆕 New player: ${address}`);
        players[socket.id].wallet = address;
        players[socket.id].xp = 1000;
        
        // Create initial save record
        userDb[address] = { ...players[socket.id], id: undefined, target: null };
        fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
    }
});

socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;

    // --- 💾 ALWAYS SAVE DATA ---
    if (socket.wallet) {
        userDb[socket.wallet] = { ...p, id: undefined, target: null };
        fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
    }

    // --- 🛌 HARDCORE LOGOUT CHECK ---
    const safeTiles = [60, 61, 42, 48, 50];
    const isOnSafeTile = safeTiles.includes(p.currentTileID);

    if (isOnSafeTile) {
        console.log(`🛌 Safe Logout: ${socket.wallet} removed from world.`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id); // Tell clients to remove sprite
    } else {
        // 🛑 DO NOT DELETE. DO NOT EMIT playerLeft.
        console.log(`⚠️ Unsafe Logout: ${socket.wallet} stays in world at [${Math.floor(p.x)}, ${Math.floor(p.y)}]`);
        p.isOffline = true;
        p.isMoving = false; // Ensure they aren't "running in place"
    }
});

});

// 4. THE HEARTBEAT (60fps Sync)
// We broadcast the positions of all players to every client
setInterval(() => {
    io.emit('position', { playerbase: players });
}, 1000 / 60);

// 5. START SERVER
const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
    console.log(`
    🎮 MOBA Ecosystem Server Active!
    🔗 URL: http://localhost:${PORT}
    🛠️  Press Ctrl+C to stop
    `);
});
