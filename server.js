// server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { CONFIG } from './src/config.js';
import { 
    players, 
    worldSeed, 
    runOfflineChickenSimulation 
} from './serverState.js';
import { 
    syncTVLWithBlockchain, 
    tickExtractionQueues, 
    tickHobbitQueues 
} from './serverBlockchain.js';
import { 
    tickCombat, 
    tickWorld 
} from './serverSimulation.js';
import { registerSocketHandlers } from './serverSocketHandlers.js';

// Setup __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. APP & SOCKET.IO SERVER INITIALIZATION
// ==========================================
const app = express();
const http = createServer(app);
const io = new Server(http, {
    cors: {
        origin: [
            "http://localhost:10000",
            "https://seedsandbones.onrender.com"
        ],
        methods: ["GET", "POST"]
    }
});

// Static assets & script routes
app.use(express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/js', express.static(path.join(__dirname, 'src')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 2. BOOTSTRAP BACKGROUND SYSTEMS & TIMERS
// ==========================================

// Run Drunkard's Walk catch-up simulation for pasture chickens
runOfflineChickenSimulation();

// TVL / TGV Synchronization with Unichain
syncTVLWithBlockchain(io);
setInterval(() => syncTVLWithBlockchain(io), 60000);

// 30 Hz Combat Loop (Inputs, Projectiles, Fog-of-War)
setInterval(() => tickCombat(io), 33.33);

// 5 Hz World Loop (Sieges, Chicken AI, Plant Lifecycle)
setInterval(() => tickWorld(io), 200.00);

// 15s Sweepers for Grand Exchange extractions & Hobbit NFA exports
setInterval(() => tickExtractionQueues(io), 15000);
setInterval(() => tickHobbitQueues(io), 15000);

// ==========================================
// 3. ROOT CONNECTION ROUTER
// ==========================================
io.on('connection', (socket) => {
    console.log(`✨ Player Connected: ${socket.id}`);

    // Initialize the authoritative player record in memory
    players[socket.id] = {
        id: socket.id,
        x: 80800,
        y: 80800,
        hp: CONFIG.HERO_HP,
        maxHp: CONFIG.HERO_HP,
        shield: 0,
        inventory: [],
        hasDivineBubble: false,
        isInvincible: false,
        passives: { hasFever: false },
        resonanceTimer: 0,
        energy: 100,
        maxEnergy: 100,
        ad: CONFIG.HERO_ATTACK,
        armor: CONFIG.HERO_ARMOR,
        magic: CONFIG.HERO_MAGIC,
        mr: CONFIG.HERO_MAGIC_RESISTANCE,
        dir: 'South',
        inGameUni: 0,
        animFrame: 0,
        isMoving: false,
        isWindingUp: false
    };

    // Send world seed and identity handshake to client
    socket.emit('secret', { seed: worldSeed, myId: socket.id });

    // Register all modular socket listeners
    registerSocketHandlers(io, socket);
});

// ==========================================
// 4. BIND & START HTTP SERVER
// ==========================================
const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
    console.log(`
    🎮 MOBA Ecosystem Server Active (Decoupled 5-Module Architecture Loaded)!
    🔗 URL: http://localhost:${PORT}
    🛠  Press Ctrl+C to stop
    `);
});