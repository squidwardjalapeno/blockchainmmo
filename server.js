const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// --- 🆕 STEP 1: IMPORT THE VOUCHER LOGIC ---
const { createVoucher } = require('./public/js/voucherSystem'); 

const POINT_VALUES = {
    "fish": 500,
    "grass_item": 50,
    "chicken_poop": 20,
    "cooked_fish": 800
};

// 1. SERVE STATIC FILES
// This tells the server that all your game files are in the /public folder
app.use(express.static(path.join(__dirname, 'public')));

// 2. GLOBAL GAME STATE
const players = {};
const worldSeed = Math.floor(Math.random() * 999999);





// 3. SOCKET CONNECTION (The Handshake)
io.on('connection', (socket) => {
    console.log(`✨ Player Connected: ${socket.id}`);

    // A. Initialize Player on Server
    players[socket.id] = {
        id: socket.id,
        x: 1600, // Default spawn
        y: 1600,
        hp: 580,
        mana: 300,
        dir: 'Down',
        animFrame: 0,
        isMoving: false
    };

    // B. Send "Secret" Data (Seed and ID) to the New Player
    socket.emit('secret', { 
        seed: worldSeed, 
        myId: socket.id 
    });

    // C. Handle Movement Updates
    socket.on('movement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].dir = data.dir;
            players[socket.id].animFrame = data.animFrame;
            players[socket.id].isMoving = data.isMoving;
        }
    });

    // D. Handle Combat (Spells/Abilities)
    socket.on('castAbility', (abilityData) => {
        // Broadcast to everyone else so they see the projectile
        socket.broadcast.emit('remoteAbility', {
            ownerId: socket.id,
            ...abilityData
        });
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

    // E. Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`❌ Player Left: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
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
