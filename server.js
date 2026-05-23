// 1. Modern Imports (ES Modules)
import { CONFIG } from './src/config.js'; // Points to src/
import { createVoucher, getContractTVL   } from './src/voucherSystem.js'; // Points to src/
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// We are no longer using the cdnjs polyfill, so remove this import:
// import https from 'https'; 

// 2. Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. Initialize App & Socket
const app = express();
const http = createServer(app);
const io = new Server(http, {
    cors: {
        origin: [
            "http://localhost:10000",                  // Local testing
            "https://seedsandbones.onrender.com"       // 👈 FIXED: Added the 's' in https!
        ],
        methods: ["GET", "POST"]
    }
});


// server.js
let currentTVL = 0.0;

async function syncTVLWithBlockchain() {
    const tvl = await getContractTVL();
    
    // Safety check for RPC glitches
    if (tvl === null || (tvl === 0 && currentTVL > 0)) {
        console.log("⚠️ TGV query skipped (RPC busy or returning 0)");
        return;
    }
    
    currentTVL = tvl;
    
    // 👈 KEEPING YOUR DEBT LOGIC:
    const effectiveTGV = Math.max(0, currentTVL - globalDebt);
    
    // Sync positions and TGV in the main loop
    io.emit('position', { 
        playerbase: players, 
        projectiles: projectiles,
        tgvOverride: effectiveTGV 
    });

    // Sync the HUD specifically
    broadcastEffectiveTGV();
    console.log(`💰 TGV Synced: ${effectiveTGV.toFixed(8)} (Raw: ${currentTVL.toFixed(4)}, Debt: ${globalDebt.toFixed(4)})`);
}

// 👈 Run immediately
syncTVLWithBlockchain();

// 👈 Increased frequency: 10 seconds
setInterval(syncTVLWithBlockchain, 10000);

// Only seeds are allowed! We use '1' as a multiplier flag.
const POINT_VALUES = {
    "grass_seed": 1, "rose_seed": 1, "violet_seed": 1, "sunflower_seed": 1,
    "turnip_seed": 1, "tomato_seed": 1, "eggplant_seed": 1, "strawberry_seed": 1,
    "pumpkin_seed": 1, "watermelon_seed": 1, "corn_seed": 1, "pineapple_seed": 1,
    "potato_seed": 1, "wheat_seed": 1
};

// 1. Serve static files from the public and src folders
app.use(express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src'))); // Expose src for ES Modules
app.use('/js', express.static(path.join(__dirname, 'src')));  // Alias /js to /src for existing HTML imports

// 2. Standard Routing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// 6. Global Game State
const players = {};
const worldSeed = Math.floor(Math.random() * 999999);


// 💾 PLAYER DATABASE INITIALIZATION
let userDb = {}; 
if (fs.existsSync('persistence.json')) {
    try { 
        userDb = JSON.parse(fs.readFileSync('persistence.json', 'utf8')); 
        console.log(`✅ Loaded ${Object.keys(userDb).length} player profiles.`);
    } catch(err){ console.error("Database load error:", err); }
}
let chestDb = {}; // 🆕 Database for all chests in the world
let storeDb = {}; // 🆕 Database for General Stores
let cellarDb = {}; // ✅ This was the missing line
let hayDb = {}; // 🆕 Database for Hay Storage
let oreDb = {}; // ⛏️ NEW: Database for mining jobs!
let smelterDb = {};
let anvilDb = {};

// 📖 DAILY ACTIVITY LEDGER
let activityLog = [];
if (fs.existsSync('activityLog.json')) {
    try { 
        activityLog = JSON.parse(fs.readFileSync('activityLog.json', 'utf8')); 
    } catch(err) { console.error("Activity load error:", err); }
}

function logActivity(type, wallet, description) {
    const now = Date.now();
    
    // Add new event to the top of the list
    activityLog.unshift({ type, wallet, description, timestamp: now });
    
    // Filter out anything older than 24 hours (86,400,000 milliseconds)
    activityLog = activityLog.filter(a => now - a.timestamp < 86400000);
    
    // Hard cap at 100 recent events so the file doesn't get massive on busy days
    if (activityLog.length > 100) activityLog.pop();
    
    fs.writeFileSync('activityLog.json', JSON.stringify(activityLog, null, 2));
}



// 🏦 DEBT SYSTEM INITIALIZATION
let globalDebt = 0.0;
if (fs.existsSync('debt.json')) {
    try { 
        const savedDebt = JSON.parse(fs.readFileSync('debt.json', 'utf8'));
        globalDebt = savedDebt.amount || 0;
    } catch(err) { console.error("Debt load error:", err); }
}

function saveDebt() {
    fs.writeFileSync('debt.json', JSON.stringify({ amount: globalDebt }, null, 2));
}

if (fs.existsSync('ores.json')) {
    try { oreDb = JSON.parse(fs.readFileSync('ores.json', 'utf8')); } catch(err){}
}

// In server.js
let authDb = {}; 
if (fs.existsSync('auth.json')) {
    try { authDb = JSON.parse(fs.readFileSync('auth.json', 'utf8')); } catch(err){}
}
function saveAuth() {
    fs.writeFileSync('auth.json', JSON.stringify(authDb, null, 2));
}

// ... scroll down to io.on('connection', (socket) => { ...

// --- 🗑️ WIPE ON START ---
if (fs.existsSync('chests.json')) fs.unlinkSync('chests.json');
if (fs.existsSync('stores.json')) {
    try { fs.unlinkSync('stores.json'); console.log("🗑️ Stores file deleted."); } catch(err){}
}
if (fs.existsSync('cellars.json')) { try { fs.unlinkSync('cellars.json'); } catch(err){} }
if (fs.existsSync('hay.json')) { try { fs.unlinkSync('hay.json'); console.log("🗑️ Hay Storage file deleted."); } catch(err){} }

// Add these near your other global variables (like players = {})
const projectiles = [];

// ==========================================
    // SERVER-SIDE MAGIC DAMAGE HELPER
    // ==========================================
    function applyMagicSpellDamage(attacker, victim, baseDamage) {
        if (victim.isInvincible) return;
        if (victim.hasDivineBubble) {
            victim.hasDivineBubble = false;
            io.emit('playerHit', { victimId: victim.id, newHp: victim.hp, bubblePopped: true });
            return;
        }

        // 1. Calculate Standard Magic Damage
        const victimMr = Math.max(1, victim.mr || 1);
        const mrReduction = Math.pow(0.5, Math.log10(victimMr));
        let finalDamage = Math.max(1, Math.floor(baseDamage * mrReduction));

        // 2. FEVER (p10) RESONANCE LOGIC
        if (attacker.passives && attacker.passives.hasFever) {
            if (victim.resonanceTimer > 0) {
                // CONSUME RESONANCE!
                victim.resonanceTimer = 0; 

                const percentMissing = 0.08 + ((attacker.magic || 0) * 0.0001); 
                const missingHp = (victim.maxHp || 100) - victim.hp;
                const executeDamage = Math.floor(missingHp * percentMissing);
                
                finalDamage += executeDamage;
                console.log(`🔥 Resonance Consumed! +${executeDamage} Execute Damage`);
            } else {
                // APPLY RESONANCE! (Lasts 4 seconds)
                victim.resonanceTimer = 4.0; 
                io.emit('playerCC', { victimId: victim.id, ccType: 'resonanceApply' });
                console.log(`✨ Resonance Applied to ${victim.id}`);
            }
        }

        // 3. Shield Absorption
        if (victim.shield > 0) {
            const dmgToShield = Math.min(victim.shield, finalDamage);
            victim.shield -= dmgToShield;
            finalDamage -= dmgToShield;
        }

        // 4. Apply HP Damage & Emit
        victim.hp -= finalDamage;
        io.emit('playerHit', { 
            victimId: victim.id, newHp: victim.hp, newShield: victim.shield, attackerId: attacker.id 
        });

        // 5. Death Logic
        if (victim.hp <= 0) {
            const xpGain = (victim.xp || 0) * 0.30;
            attacker.xp = (attacker.xp || 0) + xpGain;
            if (victim.wallet) {
                userDb[victim.wallet].hp = 0; userDb[victim.wallet].xp = victim.xp;
            }
            io.emit('playerKilled', { victimId: victim.id, killerId: attacker.id, xpGained: xpGain, newAttackerXp: attacker.xp });
        }
    }

io.on('connection', (socket) => {
    console.log(`✨ Player Connected: ${socket.id}`);

    players[socket.id] = {
        id: socket.id,
        x: 1600,
        y: 1600,
        hp: CONFIG.HERO_HP,
        maxHp: CONFIG.HERO_HP, // Added maxHp for bars
        shield: 0,

        hasDivineBubble: false, // 👈 NEW

        isInvincible: false,
        passives: { hasFever: false }, // 👈 Track attacker passives
        resonanceTimer: 0,             // 👈 Track victim debuffs



        energy: 100,      // 🆕 Default Energy
        maxEnergy: 100,   // 🆕 Default Max Energy
        ad: CONFIG.HERO_ATTACK,
        armor: CONFIG.HERO_ARMOR,
        magic: CONFIG.HERO_MAGIC,
        mr: CONFIG.HERO_MAGIC_RESISTANCE,
        dir: 'South',
        inGameUni: 0, // 🆕 NEW STAT: Replaces onChainPoints
        animFrame: 0,
        isMoving: false,
        isWindingUp: false // Sync the "Shake" animation
    };

    socket.emit('secret', { seed: worldSeed, myId: socket.id });


    // 🆕 USERNAME/PASSWORD SYSTEM
    socket.on('registerUser', (data) => {
        const { username, password } = data;
        const safeUser = username.trim().toLowerCase();
        
        if (authDb[safeUser]) {
            socket.emit('authResponse', { success: false, message: "Username already taken." });
            return;
        }
        
        authDb[safeUser] = password; // In a production game, we would hash this!
        saveAuth();
        socket.emit('authResponse', { success: true, wallet: `User_${safeUser}` });
    });

    socket.on('loginUser', (data) => {
        const { username, password } = data;
        const safeUser = username.trim().toLowerCase();

        if (authDb[safeUser] && authDb[safeUser] === password) {
            socket.emit('authResponse', { success: true, wallet: `User_${safeUser}` });
        } else {
            socket.emit('authResponse', { success: false, message: "Invalid username or password." });
        }
    });

    // 💬 CHAT SYSTEM
    socket.on('chatMessage', (data) => {
        // Broadcast the message to everyone connected
        const senderName = socket.wallet || `Guest_${socket.id.substring(0, 4)}`;
        io.emit('chatMessage', { sender: senderName, message: data.message });
    });

    // --- SMELTER JOBS ---
socket.on('requestSmelter', (jobId) => {
    if (!smelterDb[jobId]) smelterDb[jobId] = { workLeft: 200, maxWork: 200, active: false, ready: false };
    socket.emit('smelterData', { jobId, data: smelterDb[jobId] });
});

// ==========================================
// 🔥 SECURE SMELTER JOB
// ==========================================
// 🔥 SECURE SMELTER JOB
// ==========================================
socket.on('startSmelterJob', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // 🛡️ RATE LIMITER: 1 request per second
    const now = Date.now();
    if (player.lastSmelt && now - player.lastSmelt < 1000) return;
    player.lastSmelt = now;

    const job = smelterDb[data.jobId];
    if (!job || job.active || job.ready) return;

    // Start the job
    job.active = true;
    job.workLeft = 200;
    job.ready = false;
    
    io.emit('smelterUpdated', { jobId: data.jobId, data: job });
});

socket.on('workSmelterStrike', (data) => {
    const job = smelterDb[data.jobId];
    if (job && job.active && job.workLeft > 0) {
        job.workLeft--;
        if (job.workLeft <= 0) job.ready = true;
        if (job.workLeft % 5 === 0 || job.workLeft === 0) io.emit('smelterUpdated', { jobId: data.jobId, data: job });
    }
});

// ==========================================
    // ⛏️ MINING SPEED UP (50 UNI)
    // ==========================================
    socket.on('speedUpOre', (data) => {
        const { oreId } = data;
        const player = players[socket.id];
        const ore = oreDb[oreId];
        
        if (!ore || !player) return;

        const SPEEDUP_COST = 1.22; 
        const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
        const now = Date.now();

        if (now - ore.lastSpeedUp < COOLDOWN_MS) {
            socket.emit('oreMessage', "The blast charges are still cooling down. Try again tomorrow!");
            return;
        }

        // Check if player has enough points!
        if (player.inGameUni >= SPEEDUP_COST) {
            player.inGameUni -= SPEEDUP_COST; // Deduct the points
            ore.workLeft = 0;                 // Finish the job
            ore.lastSpeedUp = now; 
            
            player.inGameUni -= SPEEDUP_COST;
            globalDebt = Math.max(0, globalDebt - SPEEDUP_COST); // 👈 REDUCE DEBT (Debt is cancelled/burned)
            saveDebt();
            logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${SPEEDUP_COST} UNI to blast an Iron Vein`);
            
            // Save & Sync
            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
            io.emit('oreUpdated', { oreId, data: ore });
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni }); // Updates the HUD instantly
            
            console.log(`🧨 ${socket.wallet} paid ${SPEEDUP_COST} UNI to blast open ${oreId}!`);
        } else {
            socket.emit('oreMessage', `Insufficient funds! You need ${SPEEDUP_COST} UNI.`);
        }
            
        broadcastEffectiveTGV()
        syncPlayerAndSave(socket.id)

    });

    // ==========================================
    // 🔥 SMELTER SPEED UP (50 UNI)
    // ==========================================
    socket.on('speedUpSmelter', (data) => {
        const player = players[socket.id];
        const job = smelterDb[data.jobId];
        const SPEEDUP_COST = 0.0007;

        if (job && job.active && player) {
            if (player.inGameUni >= SPEEDUP_COST) {
                player.inGameUni -= SPEEDUP_COST; // Deduct points
                job.workLeft = 0;                 // Finish the job
                job.ready = true;

                player.inGameUni -= SPEEDUP_COST;
                globalDebt = Math.max(0, globalDebt - SPEEDUP_COST); // 👈 REDUCE DEBT (Debt is cancelled/burned)
                saveDebt();
                logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${SPEEDUP_COST} UNI to speed up the Smelter`);
                
                // Sync
                io.emit('smelterUpdated', { jobId: data.jobId, data: job });
                socket.emit('balanceUpdated', { inGameUni: player.inGameUni }); // Updates HUD
                
                console.log(`🔥 ${socket.wallet} paid ${SPEEDUP_COST} UNI to speed up the Smelter!`);
            } else {
                // We can use the generic oreMessage to pop an alert on the client
                socket.emit('oreMessage', `Insufficient funds! You need ${SPEEDUP_COST} UNI.`);
            }
        }

        broadcastEffectiveTGV()
        syncPlayerAndSave(socket.id)

    });

    // ==========================================
    // 🔨 ANVIL SPEED UP (50 UNI)
    // ==========================================
    socket.on('speedUpAnvil', (data) => {
        const player = players[socket.id];
        const job = anvilDb[data.jobId];
        const SPEEDUP_COST = 0.0001;

        if (job && job.active && player) {
            if (player.inGameUni >= SPEEDUP_COST) {
                player.inGameUni -= SPEEDUP_COST; // Deduct points
                job.workLeft = 0;                 // Finish the job
                job.ready = true;

                player.inGameUni -= SPEEDUP_COST;
                globalDebt = Math.max(0, globalDebt - SPEEDUP_COST); // 👈 REDUCE DEBT (Debt is cancelled/burned)
                saveDebt();
                logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${SPEEDUP_COST} UNI to speed up the Anvil`);
                
                // Sync
                io.emit('anvilUpdated', { jobId: data.jobId, data: job });
                socket.emit('balanceUpdated', { inGameUni: player.inGameUni }); // Updates HUD
                
                console.log(`🔨 ${socket.wallet} paid ${SPEEDUP_COST} UNI to speed up the Anvil!`);
            } else {
                socket.emit('oreMessage', `Insufficient funds! You need ${SPEEDUP_COST} UNI.`);
            }
        }
            
        broadcastEffectiveTGV()
        syncPlayerAndSave(socket.id)

    });


socket.on('collectSmelter', (data) => {
    const job = smelterDb[data.jobId];
    if (job && job.ready) {
        job.active = false; job.ready = false; job.workLeft = 200;
        io.emit('smelterUpdated', { jobId: data.jobId, data: job });
        socket.emit('receiveSmelterLoot');
    }
});

// --- ANVIL JOBS ---
socket.on('requestAnvil', (jobId) => {
    if (!anvilDb[jobId]) anvilDb[jobId] = { workLeft: 300, maxWork: 300, active: false, ready: false };
    socket.emit('anvilData', { jobId, data: anvilDb[jobId] });
});

// ==========================================
// 🔨 SECURE ANVIL JOB
// ==========================================
// 🔨 SECURE ANVIL JOB
// ==========================================
socket.on('startAnvilJob', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // 🛡️ RATE LIMITER: 1 request per second
    const now = Date.now();
    if (player.lastAnvil && now - player.lastAnvil < 1000) return;
    player.lastAnvil = now;

    const job = anvilDb[data.jobId];
    if (!job || job.active || job.ready) return;

    // Start the job
    job.active = true;
    job.workLeft = 300;
    job.ready = false;
    
    io.emit('anvilUpdated', { jobId: data.jobId, data: job });
});

socket.on('workAnvilStrike', (data) => {
    const job = anvilDb[data.jobId];
    if (job && job.active && job.workLeft > 0) {
        job.workLeft--;
        if (job.workLeft <= 0) job.ready = true;
        if (job.workLeft % 5 === 0 || job.workLeft === 0) io.emit('anvilUpdated', { jobId: data.jobId, data: job });
    }
});


socket.on('collectAnvil', (data) => {
    const job = anvilDb[data.jobId];
    if (job && job.ready) {
        job.active = false; job.ready = false; job.workLeft = 300;
        io.emit('anvilUpdated', { jobId: data.jobId, data: job });
        socket.emit('receiveAnvilLoot');
    }
});

    socket.on('requestChest', (chestId) => {
        // If chest doesn't exist in DB yet, spawn it with default loot!
        if (!chestDb[chestId]) {
            chestDb[chestId] = [
                {
                    name: "Miner's Pickaxe",
                    seedType: "tool_pickaxe",
                    spriteID: 69,
                    tileset: "transparentTileset",
                    isWeapon: true,
                    ad: 3,
                    health: 100,
                    virulence: 0,
                    fertility: 0,
                    count: 1,      
                    maxStack: 1,   
                    drawSize: 8,
                    timestamp: Date.now()
                }
                
                ,
                // 👇 DEBUG: THE SONIC TOMATO
                {
                    name: "Tomato",
                    seedType: "tomato_item",
                    spriteID: 24, // Assuming Tile 24 on your cropTileset
                    tileset: "cropTileset",
                    health: 30,
                    virulence: 0,
                    fertility: 25,
                    count: 8,      // Give them a full stack of 8!
                    maxStack: 8,
                    typeLabel: "Food", 
                    energy: 35, 
                    description: "A hearty fruit.",
                    timestamp: Date.now()
                },
                    
            ];
        }
        // Send the data back ONLY to the player who asked
        socket.emit('chestData', { chestId, items: chestDb[chestId] });
    });

    socket.on('updateChest', (data) => {
        // 1. Update the Server RAM
        chestDb[data.chestId] = data.items;
        
        // 2. Write to disk
        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));

        // 3. 📡 Broadcast to everyone ELSE in case they are looking in the same chest!
        socket.broadcast.emit('chestUpdated', data);
    });

    // ==========================================
    // 🆕 GENERAL STORE (TRADE COUNTER) SYSTEM
    // ==========================================
    
    socket.on('requestStore', (storeId) => {
        if (!storeDb[storeId]) {
            // listings: active trades. storage: items waiting for pickup by wallet
            storeDb[storeId] = { listings: [], storage: {} }; 
        }
        socket.emit('storeData', { storeId, data: storeDb[storeId] });
    });

    socket.on('createListing', (data) => {
        const { storeId, wallet, offeredItem, wantedType } = data;
        storeDb[storeId].listings.push({
            id: Date.now().toString(),
            seller: wallet,
            offeredItem: offeredItem,
            wantedType: wantedType,
            counterOffer: null
        });
        saveStores();
        io.emit('storeUpdated', { storeId, data: storeDb[storeId] }); // Tell everyone looking
    });

    socket.on('buyListing', (data) => {
        const { storeId, listingId, buyerWallet, paymentItem } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);
        
        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            // 1. Move the listed item to the Buyer's storage
            if (!store.storage[buyerWallet]) store.storage[buyerWallet] = [];
            store.storage[buyerWallet].push(listing.offeredItem);
            
            // 2. Move the payment to the Seller's storage
            if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
            store.storage[listing.seller].push(paymentItem);

            // 3. Remove listing
            store.listings.splice(listIdx, 1);
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('makeCounterOffer', (data) => {
        const { storeId, listingId, buyerWallet, counterItem } = data;
        const store = storeDb[storeId];
        const listing = store.listings.find(l => l.id === listingId);
        
        if (listing) {
            listing.counterOffer = { buyer: buyerWallet, item: counterItem };
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('resolveCounterOffer', (data) => {
        const { storeId, listingId, accept } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);
        
        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            if (accept) {
                // Swap items into respective storages
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer].push(listing.offeredItem);

                if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
                store.storage[listing.seller].push(listing.counterOffer.item);

                store.listings.splice(listIdx, 1);
            } else {
                // Reject: Return counter-item to buyer's storage, keep listing active
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer].push(listing.counterOffer.item);
                listing.counterOffer = null;
            }
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('cancelListing', (data) => {
        const { storeId, listingId, wallet } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);
        
        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            // Return item to seller storage
            if (!store.storage[wallet]) store.storage[wallet] = [];
            store.storage[wallet].push(listing.offeredItem);
            
            // If there was a pending counter-offer, return that to the buyer
            if (listing.counterOffer) {
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer].push(listing.counterOffer.item);
            }

            store.listings.splice(listIdx, 1);
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('claimStorage', (data) => {
        const { storeId, wallet } = data;
        const store = storeDb[storeId];
        
        if (store.storage[wallet]) {
            // Send items back to client (they will be added to inventory locally)
            socket.emit('storageClaimed', { items: store.storage[wallet] });
            store.storage[wallet] = []; // Clear storage
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });




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

            // 👈 NEW: Sync Pet
            players[socket.id].pet = data.pet; 
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

    // ==========================================
    // 🏦 WITHDRAWAL LOGIC
    // ==========================================
    socket.on('requestWithdrawal', async (reqData) => {
        const player = players[socket.id];
        
        // Unpack the new object payload
        const amount = typeof reqData === 'object' ? reqData.amount : reqData;
        const targetAddress = (typeof reqData === 'object' && reqData.targetAddress) ? reqData.targetAddress : socket.wallet;
        
        console.log(`🏦 Withdrawal Request from ${socket.wallet} to Web3 Address ${targetAddress}`);

        if (!player || player.inGameUni < amount || !socket.wallet) {
            console.error("❌ Invalid Withdrawal Request.");
            return;
        }

        // Subtract and create voucher
        player.inGameUni -= amount;
        globalDebt = Math.max(0, globalDebt - amount);
        saveDebt();
        syncPlayerAndSave(socket.id);
        
        socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        broadcastEffectiveTGV(); // 👈 ADDED: Updates the HUD for everyone instantly!

        const nonce = Math.floor(Math.random() * 1000000000);
        try {
            const voucher = await createVoucher(targetAddress, amount, nonce);
            
            socket.emit('receiveWithdrawalVoucher', voucher);
            console.log(`📜 Withdrawal Voucher generated for ${targetAddress}`);
        } catch (err) {
            console.error("Voucher failed!", err);
            // Refund on failure
            player.inGameUni += amount;
            globalDebt += amount;
            saveDebt();
            syncPlayerAndSave(socket.id);
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            broadcastEffectiveTGV(); // 👈 ADDED: Revert the TGV if the voucher fails!
        }
    });

    // 👈 Add this inside your io.on('connection') block:
socket.on('requestActivityLog', () => {
    socket.emit('activityData', activityLog);
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

        // ... inside server.js -> socket.on('pvpAttack' ...
        
        // 👇 1. HEAVEN'S HALO CHECK (Absolute Immunity)
        if (victim.isInvincible) {
            console.log(`👼 ${victim.id} is Invincible! Damage ignored.`);
            // Optionally, tell the attacker "IMMUNE!" (Requires a new emit/UI text)
            return; // 🛑 EXIT EARLY: No damage applied!
        }

        // 👇 1. DIVINE BUBBLE CHECK (Blocks 1 instance of damage completely)
        if (victim.hasDivineBubble) {
            console.log(`✨ DIVINE BUBBLE POPPED on ${victim.id}! Blocked ${finalDamage} damage.`);
            victim.hasDivineBubble = false;
            
            // Tell clients the bubble popped (so they can update visuals/UI)
            io.emit('playerHit', {
                victimId: victim.id,
                newHp: victim.hp,
                newShield: victim.shield,
                bubblePopped: true, // 👈 New flag
                attackerId: attacker.id
            });
            return; // 🛑 EXIT EARLY: No damage applied!
        }

        
// 👇 🆕 NEW SHIELD LOGIC
        if (victim.shield > 0) {
            // How much of the damage hits the shield?
            const damageToShield = Math.min(victim.shield, finalDamage);
            victim.shield -= damageToShield;
            finalDamage -= damageToShield; // Subtract absorbed damage
            
            console.log(`🛡️ Shield absorbed ${damageToShield} damage! Remaining Shield: ${victim.shield}`);
        }

        // Apply remaining damage to HP
        victim.hp -= finalDamage;
        
        // 3. BROADCAST THE HIT (Now includes shield data!)
        io.emit('playerHit', {
            victimId: victim.id,
            newHp: victim.hp,
            newShield: victim.shield, // 👈 Send shield updates to everyone
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

// ==========================================
    // AREA OF EFFECT (AoE) ABILITY LISTENER
    // ==========================================
    socket.on('abilityAoE', (data) => {
        const attacker = players[socket.id];
        if (!attacker) return;

        for (let vid in players) {
            if (vid === socket.id) continue; // Don't hit yourself
            
            const victim = players[vid];
            const dx = victim.x - data.x;
            const dy = victim.y - data.y;
            const distSq = (dx * dx) + (dy * dy);
            const radiusSq = data.radius * data.radius;

            if (distSq <= radiusSq && victim.hp > 0) {
                
                // --- p3: DIVINE BUBBLE EXPLOSION ---
                if (data.type === 'divineBubbleExplosion') {
                    // 1. Knockback Math
                    const dist = Math.sqrt(distSq) || 1; 
                    const pushPower = 32; 
                    victim.x += (dx / dist) * pushPower;
                    victim.y += (dy / dist) * pushPower;
                    
                    // Tell all clients to update this player's position
                    io.emit('forcedMovement', { id: victim.id, x: victim.x, y: victim.y });

                    // 2. Apply Unified Magic Damage (Triggers Fever/Resonance)
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                // --- p5: RADIANT NOVA EXPLOSION ---
                if (data.type === 'radiantNovaExplosion') {
                    // 1. Apply Slow CC (Lasts 2.0 seconds)
                    io.emit('playerCC', { victimId: victim.id, ccType: 'slow', duration: 2.0 });

                    // 2. Apply Unified Magic Damage (Triggers Fever/Resonance)
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                // --- p11: RING OF PENANCE ---
                if (data.type === 'ringOfPenance') {
                    // 1. Apply IMPRISON CC (Mask: 13, Duration: 1.5s)
                    // Note: You can hardcode 13 here, or copy the CC object into server.js
                    const IMPRISON_MASK = 1 | 4 | 8; // MOVE + CAST_MOVE + CAST_NON_MOVE
                    
                    io.emit('playerCC', { 
                        victimId: victim.id, 
                        ccMask: IMPRISON_MASK, 
                        duration: 1.5 
                    });

                    // 2. Apply Unified Magic Damage (Triggers Fever/Resonance)
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                // --- p14: CONSECRATION TICK ---
                if (data.type === 'consecrationTick') {
                    // No CC, just raw Magic Damage! 
                    // This will naturally apply and consume Resonance!
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                // --- p16: ZENITH GUARDIAN SPAWN ---
                if (data.type === 'zenithGuardianSpawn') {
                    // BIND CC: Cannot Move or Attack (1 | 2 = 3)
                    const BIND_MASK = 1 | 2; 
                    
                    io.emit('playerCC', { 
                        victimId: victim.id, 
                        ccMask: BIND_MASK, 
                        duration: 1.5 
                    });

                    // Apply Magic Damage (Triggers Resonance!)
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }
            }
        }
    });

    // Allow players to heal each other
    socket.on('healPlayer', (data) => {
        const target = players[data.targetId];
        if (target && target.hp > 0) {
            target.hp = Math.min(target.maxHp || 100, target.hp + data.amount);
            io.emit('playerHealed', { targetId: target.id, newHp: target.hp, amount: data.amount });
        }
    });

    // --- ADD THIS inside io.on('connection') in server.js ---

    // Route targeted buffs to allies
    socket.on('castBuffOnAlly', (data) => {
        // Send a private message ONLY to the targeted ally
        io.to(data.targetId).emit('receiveAllyBuff', data);
    });

    // --- Add inside io.on('connection') ---
    socket.on('fireProjectile', (data) => {
        // We add the socket.id so the projectile knows who fired it (no friendly fire)
        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id,
            type: data.type,
            x: data.x,
            y: data.y,
            dx: data.dx,
            dy: data.dy,
            speed: data.speed,
            life: data.life,
            radius: data.radius,
            damage: data.damage
        });
    });

    // --- Inside io.on('connection') ---
    socket.on('fireHomingProjectile', (data) => {
        const attacker = players[socket.id];
        const target = players[data.targetId];
        if (!attacker || !target) return;

        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id,
            type: data.type,
            targetId: data.targetId, // Homing flag
            x: attacker.x + 8,
            y: attacker.y + 8,
            speed: 350, // Fast!
            life: 2.0,  // Fizzles after 2s if it can't catch them
            damage: data.damage,
            skillIndex: data.skillIndex
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
    // ==========================================
    // 💎 DYNAMIC LIQUIDITY-BASED SACRIFICE
    // ==========================================
    // ==========================================
    // 💎 SECURE DYNAMIC SACRIFICE LOGIC
    // ==========================================
    // 💎 SECURE DYNAMIC SACRIFICE LOGIC
    // ==========================================
    // 💎 SECURE DYNAMIC SACRIFICE LOGIC
    // ==========================================
    socket.on('sacrificeItem', (data) => {
        const player = players[socket.id];
        if (!player) return;

        // 🛡️ RATE LIMITER: Only allow 1 sacrifice per second
        const now = Date.now();
        if (player.lastSacrifice && now - player.lastSacrifice < 1000) {
            console.log(`🚨 SPAM BLOCKED: ${socket.wallet} is sending packets too fast.`);
            return;
        }
        player.lastSacrifice = now;

        const isValidSeed = POINT_VALUES[data.itemType];
        if (!isValidSeed) return;

        // 🛡️ HARD CAP: Hackers cannot spoof millions. Max 64 (1 stack).
        const requestedCount = Math.min(64, Math.max(1, data.count || 1)); 

        // Calculate Payout
        const effectiveTGV = Math.max(0.00000001, currentTVL - globalDebt);
        const pointsPerSeed = effectiveTGV / 640000;
        const totalPoints = pointsPerSeed * requestedCount; 

        // Apply Points
        player.inGameUni = (parseFloat(player.inGameUni) || 0.0) + totalPoints;
        globalDebt = (parseFloat(globalDebt) || 0.0) + totalPoints;
        
        saveDebt();
        syncPlayerAndSave(socket.id); 
        
        socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        
        if (typeof broadcastEffectiveTGV === 'function') broadcastEffectiveTGV();
        if (typeof logActivity === 'function') {
            logActivity('SACRIFICE', socket.wallet || socket.id, `Sacrificed ${requestedCount}x ${data.itemType} for ${totalPoints.toFixed(8)} UNI`);
        }

        console.log(`💎 ${socket.wallet || socket.id} sacrificed ${requestedCount}x ${data.itemType}`);
    });
    // ==========================================
    // ⛏️ MINING JOB SYSTEM
    // ==========================================
    socket.on('requestOre', (oreId) => {
        if (!oreDb[oreId]) {
            oreDb[oreId] = {
                workLeft: 3600, // 1 hour of manual striking
                maxWork: 3600,
                lastSpeedUp: 0,
                claimed: false
            };
        }
        socket.emit('oreData', { oreId, data: oreDb[oreId] });
    });

    // 🌟 NEW: Processes manual strikes from pickaxes!
    socket.on('mineOreStrike', (data) => {
        const { oreId } = data;
        
        // If someone hits it before opening the menu, initialize it!
        if (!oreDb[oreId]) {
            oreDb[oreId] = { workLeft: 3600, maxWork: 3600, lastSpeedUp: 0, claimed: false };
        }

        const ore = oreDb[oreId];
        if (ore.workLeft > 0) {
            ore.workLeft--;
            
            // Broadcast every 5 ticks so the server doesn't lag
            if (ore.workLeft % 5 === 0 || ore.workLeft === 0) {
                io.emit('oreUpdated', { oreId, data: ore });
                fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
            }
        }
    });


    socket.on('collectOre', (data) => {
        const { oreId } = data;
        const ore = oreDb[oreId];
        
        if (ore && ore.workLeft === 0 && !ore.claimed) {
            ore.claimed = true;
            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
            io.emit('oreUpdated', { oreId, data: ore });
            
            socket.emit('receiveOreLoot');
            console.log(`⛏️ ${socket.wallet} claimed ore from ${oreId}!`);
        }
    });

    // ==========================================
    // ♻️ REFUND FAILED WITHDRAWALS
    // ==========================================
    // ♻️ REFUND FAILED WITHDRAWALS
    // ==========================================
    socket.on('refundWithdrawal', (amountStr) => {
        const player = players[socket.id];
        const amount = parseFloat(amountStr); // Convert back to number
        
        if (player && amount > 0) {
            player.inGameUni += amount;
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            console.log(`♻️ Refunded ${amount.toFixed(8)} UNI to ${socket.wallet}`);
        }

        broadcastEffectiveTGV()
        syncPlayerAndSave(socket.id)

    });


    socket.on('requestCellar', (cellarId) => {
        if (!cellarDb[cellarId]) {
            cellarDb[cellarId] = [];
        }
        socket.emit('cellarData', { cellarId, items: cellarDb[cellarId] });
    });

    socket.on('updateCellar', (data) => {
        cellarDb[data.cellarId] = data.items;
        fs.writeFileSync('cellars.json', JSON.stringify(cellarDb, null, 2));
        socket.broadcast.emit('cellarUpdated', data);
    });

    // ==========================================
    // 🆕 HAY STORAGE SYSTEM
    // ==========================================
    socket.on('requestHayStorage', (hayStorageId) => {
        if (!hayDb[hayStorageId]) {
            hayDb[hayStorageId] = [];
        }
        socket.emit('hayStorageData', { hayStorageId, items: hayDb[hayStorageId] });
    });

    socket.on('updateHayStorage', (data) => {
        hayDb[data.hayStorageId] = data.items;
        fs.writeFileSync('hay.json', JSON.stringify(hayDb, null, 2));
        socket.broadcast.emit('hayStorageUpdated', data);
    });

// ... inside io.on('connection', (socket) => { ...

socket.on('identifyWallet', (data) => {
    const address = (typeof data === 'object') ? data.address : data;
    if (!address) return;

    socket.wallet = address;

    // 1. Check for stationary "Sleeper" in world
    let existingSocketId = Object.keys(players).find(id => players[id].wallet === address);

    if (existingSocketId) {
        console.log(`🔗 ${address} is re-possessing their body.`);
        io.emit('playerLeft', existingSocketId);
        players[socket.id] = { ...players[existingSocketId], id: socket.id, isOffline: false };
        if (existingSocketId !== socket.id) delete players[existingSocketId];
        socket.emit('restoreHero', players[socket.id]);
    } 
    // 2. Load from Database (This is what fixes your issue!)
    else if (userDb[address]) {
        console.log(`💾 ${address} returning. Balance: ${userDb[address].inGameUni} UNI`);
        // Merge stored data into active player object
        players[socket.id] = { ...players[socket.id], ...userDb[address], id: socket.id, isOffline: false };
        socket.emit('restoreHero', players[socket.id]);
    } 
    // 3. Brand new player
    else {
        console.log(`🆕 New player: ${address}.`);
        socket.emit('needsCharacterCreation');
    }
});

// 🆕 ADD THIS NEW LISTENER:
socket.on('createCharacter', (data) => {
    const { wallet, charClass, skills } = data;
    
    players[socket.id].wallet = wallet;
    players[socket.id].charClass = charClass;
    players[socket.id].skills = skills;
    
    // 👈 THE FIX: Only set to 0 if they don't have a balance in the DB yet!
    if (players[socket.id].inGameUni === undefined) {
        players[socket.id].inGameUni = 0;
    }
    
    syncPlayerAndSave(socket.id);
    socket.emit('restoreHero', players[socket.id]);
});

// ... keep the rest unchanged

socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;

    // --- 🛌 SAVE DATA (for real wallets) ---
    if (socket.wallet) {
        syncPlayerAndSave(socket.id);
    }

    // --- 🧹 GUEST DEBT RECOVERY ---
    // If a Guest logs off, their points are lost forever.
    // We remove their balance from the Global Debt to "recycle" the liquidity.
    if (p.wallet && p.wallet.startsWith('Guest_')) {
        const abandonedUNI = p.inGameUni || 0;
        if (abandonedUNI > 0) {
            globalDebt = Math.max(0, globalDebt - abandonedUNI);
            saveDebt();
            broadcastEffectiveTGV(); // 👈 Recalculates TGV for active players
            console.log(`🧹 Guest ${p.wallet} logged off. ${abandonedUNI.toFixed(8)} UNI recycled to TGV.`);
        }
    }

    // --- 🛌 HARDCORE LOGOUT CHECK ---
    const safeTiles = [60, 61, 42, 48, 50];
    const isOnSafeTile = safeTiles.includes(p.currentTileID);

    if (isOnSafeTile) {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    } else {
        p.isOffline = true;
        p.isMoving = false;
    }
});

});

function saveStores() {
    fs.writeFileSync('stores.json', JSON.stringify(storeDb, null, 2));
}

function syncPlayerAndSave(socketId) {
    const p = players[socketId];
    if (!p || !p.wallet) return;

    // 1. Sync RAM to Database
    if (!userDb[p.wallet]) userDb[p.wallet] = {};
    Object.assign(userDb[p.wallet], p);
    
    // 2. Persist to persistence.json
    fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
}

// Add this function at the bottom of server.js
function broadcastEffectiveTGV() {
    const effectiveTGV = Math.max(0, currentTVL - globalDebt);
    io.emit('tgvUpdate', { tgv: effectiveTGV });
}

// --- Replace your setInterval at the bottom of server.js ---

// ==========================================
// THE HEARTBEAT (50ms Physics Loop)
// ==========================================
setInterval(() => {
    const delta = 0.05; // 50ms in seconds

    // 1. UPDATE DEBUFF TIMERS (Resonance)
    for (let vid in players) {
        const p = players[vid];
        if (p.resonanceTimer > 0) {
            p.resonanceTimer -= delta;
            if (p.resonanceTimer <= 0) {
                io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
            }
        }
    }

    // 2. UPDATE FLYING PROJECTILES
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];

        // 🎯 HOMING LOGIC
        if (p.targetId) {
            const target = players[p.targetId];
            if (target && target.hp > 0) {
                // Adjust dx/dy every frame to perfectly track the target
                const tx = (target.x + 8) - p.x;
                const ty = (target.y + 8) - p.y;
                const dist = Math.sqrt(tx*tx + ty*ty);
                if (dist > 0) { p.dx = tx/dist; p.dy = ty/dist; }
            } else {
                p.life = 0; // Target died/logged off, fizzle the spell
            }
        }

        p.x += p.dx * p.speed * delta;
        p.y += p.dy * p.speed * delta;
        p.life -= delta;

        let hit = false;

        // Check collision (If Homing, ONLY collide with the target!)
        for (let vid in players) {
            if (vid === p.ownerId) continue; 
            if (p.targetId && vid !== p.targetId) continue; // 👈 Bypass other players if homing
            
            const victim = players[vid];
            if (victim.hp <= 0) continue; 

            const dx = (victim.x + 8) - p.x;
            const dy = (victim.y + 8) - p.y;
            const distSq = (dx * dx) + (dy * dy);
            const hitRadius = p.radius || 8 + 8;

            if (distSq <= hitRadius * hitRadius) {
                hit = true;
                const attacker = players[p.ownerId];
                if (attacker) {
                    
                    // --- p12: ZEPHYR IMPACT ---
                    if (p.type === 'zephyr') {
                        // 🌟 THE SYNERGY CHECK!
                        if (victim.resonanceTimer > 0) {
                            console.log(`💨 Zephyr consumed Resonance on ${vid}! Refunding Cooldown.`);
                            // Send a private message back to the caster to refund 80% of the 12s cooldown (9.6s)
                            io.to(p.ownerId).emit('refundCooldown', { index: p.skillIndex, amount: 9.6 });
                            
                            // If they DON'T have fever, we must manually clear the resonance
                            // (If they DO have fever, applyMagicSpellDamage will handle consuming it and adding the execute damage!)
                            if (!attacker.passives || !attacker.passives.hasFever) {
                                victim.resonanceTimer = 0;
                                io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
                            }
                        }
                        
                        applyMagicSpellDamage(attacker, victim, p.damage);
                    }

                    // --- p13: VANGUARD IMPACT ---
                    if (p.type === 'vanguard') {
                        
                        // 1. Apply RAPTURE CC (Mask: 1 + 2 + 8 + 16 = 27)
                        // MOVE(1) | ATTACK(2) | NON_MOVE(8) | CLEANSE(16)
                        const RAPTURE_MASK = 1 | 2 | 8 | 16; 
                        
                        io.emit('playerCC', { 
                            victimId: vid, 
                            ccMask: RAPTURE_MASK, 
                            duration: 2.0 
                        });

                        // 2. Apply Unified Magic Damage
                        applyMagicSpellDamage(attacker, victim, p.damage);
                    }
                    // --- p9: FLARE IMPACT ---
                    else if (p.type === 'flare') {
                        applyMagicSpellDamage(attacker, victim, p.damage);
                    }
                }
                break; 
            }
        }

        if (hit || p.life <= 0) projectiles.splice(i, 1); 
    }

    // 3. BROADCAST POSITIONS
    io.emit('position', { 
        playerbase: players,
        projectiles: projectiles
    });
}, 50);

// 5. START SERVER
const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
    console.log(`
    🎮 MOBA Ecosystem Server Active!
    🔗 URL: http://localhost:${PORT}
    🛠️  Press Ctrl+C to stop
    `);
});