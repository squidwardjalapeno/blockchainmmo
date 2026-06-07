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

// server.js
async function syncTVLWithBlockchain() {
    const rawTvl = await getContractTVL();
    
    // 1. If the RPC failed, don't overwrite our current data with 0
    if (rawTvl === null) {
        console.log("⚠️ RPC Query failed. Keeping last known TGV.");
        return;
    }
    
    // 2. FORCE numeric types (prevents NaN bugs)
    currentTVL = parseFloat(rawTvl) || 0;
    const debt = parseFloat(globalDebt) || 0;

    // 3. Calculate Effective TGV
    const effectiveTGV = Math.max(0, currentTVL - debt);
    
    // 4. Update Game State for all players
    io.emit('position', { 
        playerbase: players, 
        projectiles: projectiles,
        tgvOverride: effectiveTGV 
    });

    broadcastEffectiveTGV();

    // 5. Detailed Logging (Check your Render dashboard for this!)
    console.log(`📊 ECONOMY SYNC | Raw: ${currentTVL.toFixed(8)} | Debt: ${debt.toFixed(8)} | Final TGV: ${effectiveTGV.toFixed(8)}`);
}

// 👈 Run immediately
syncTVLWithBlockchain();

// 👈 Increased frequency: 10 seconds
setInterval(syncTVLWithBlockchain, 60000);

// Only seeds are allowed! We use '1' as a multiplier flag.
const POINT_VALUES = {
    "grass_seed": 1, "rose_seed": 1, "violet_seed": 1, "sunflower_seed": 1,
    "turnip_seed": 1, "tomato_seed": 1, "eggplant_seed": 1, "strawberry_seed": 1,
    "pumpkin_seed": 1, "watermelon_seed": 1, "corn_seed": 1, "pineapple_seed": 1,
    "potato_seed": 1, "wheat_seed": 1
};

// Inside server.js:


// Add this definition to server.js:

const BACTERIA_TYPES = {
    "organic_drop": 1, "fish": 1, "organic_plant": 2, "grass": 2,
    "plant_matter": 3, "chicken_poop": 4, "cooked_fish": 5,
    "turnip_item": 6, "tomato_item": 7, "eggplant_item": 8,
    "strawberry_item": 9, "pumpkin_item": 10, "watermelon_item": 11,
    "corn_item": 12, "pineapple_item": 13, "potato_item": 14,
    "wheat_item": 15, "egg": 16,
    
    "grass_seed": 20, "turnip_seed": 21, "tomato_seed": 22, "eggplant_seed": 23,
    "strawberry_seed": 24, "pumpkin_seed": 25, "watermelon_seed": 26, "corn_seed": 27,
    "pineapple_seed": 28, "potato_seed": 29, "wheat_seed": 30,
    "rose_seed": 31, "violet_seed": 32, "sunflower_seed": 33,

    "fish_trout": 40, "fish_panfish": 41, "fish_mackerel": 42, 
    "fish_muskellunge": 43, "fish_trevally": 44, "fish_squid": 45, 
    "fish_octopus": 46, "fish_eel": 47, "fish_angler": 48,

    "raw_chicken": 50, 
    "weapon_dagger": 60,
    "key": 61,
};

// Add this definition map to server.js:

// Replace the SERVER_PLANT_DEFS block in server.js with this:

const SERVER_PLANT_DEFS = {
    'grass':     { growthRate: 0.5,  stages: 5, window: 1 },
    'rose':      { growthRate: 0.25, stages: 5, window: 1 },
    'violet':    { growthRate: 0.25, stages: 5, window: 1 },
    'sunflower': { growthRate: 0.25, stages: 5, window: 1 },
    'turnip':    { growthRate: 0.4,  stages: 4, window: 1 },
    'tomato':    { growthRate: 0.2,  stages: 12, window: 3, isCyclical: true, resetGrowth: 26 },
    'eggplant':  { growthRate: 0.15, stages: 10, window: 1, isCyclical: true, resetGrowth: 31 },
    'strawberry':{ growthRate: 0.24, stages: 10, window: 1, isCyclical: true, resetGrowth: 31 },
    'pumpkin':   { growthRate: 0.35, stages: 4, window: 1 },
    'watermelon':{ growthRate: 0.35, stages: 4, window: 1 },
    'corn':      { growthRate: 0.35, stages: 4, window: 1 },
    'wheat':     { growthRate: 0.4,  stages: 4, window: 1 },
    'pineapple': { growthRate: 0.05, stages: 5, window: 1 },
    'potato':    { growthRate: 0.15, stages: 5, window: 1 }
};

// Inside server.js:

// Replace the SERVER_ITEM_TYPES definition block in server.js with this:

const SERVER_ITEM_TYPES = {
    // Standard Crops (maxStack: 8, custom drawSizes)
    TURNIP_ITEM: { name: "Turnip", seedType: "turnip_item", baseHealth: 30, baseVirulence: 0, spriteID: 0, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    TOMATO_ITEM: { name: "Tomato", seedType: "tomato_item", baseHealth: 30, baseVirulence: 0, spriteID: 24, tileset: "cropTileset", maxStack: 8, drawSize: 4 },
    EGGPLANT_ITEM: { name: "Eggplant", seedType: "eggplant_item", baseHealth: 30, baseVirulence: 0, spriteID: 36, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    STRAWBERRY_ITEM: { name: "Strawberry", seedType: "strawberry_item", baseHealth: 20, baseVirulence: 0, spriteID: 72, tileset: "cropTileset", maxStack: 8, drawSize: 4 },
    PUMPKIN_ITEM: { name: "Pumpkin", seedType: "pumpkin_item", baseHealth: 40, baseVirulence: 0, spriteID: 96, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    WATERMELON_ITEM: { name: "Watermelon", seedType: "watermelon_item", baseHealth: 40, baseVirulence: 0, spriteID: 30, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    CORN_ITEM: { name: "Corn", seedType: "corn_item", baseHealth: 30, baseVirulence: 0, spriteID: 108, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    PINEAPPLE_ITEM: { name: "Pineapple", seedType: "pineapple_item", baseHealth: 40, baseVirulence: 0, spriteID: 48, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    POTATO_ITEM: { name: "Potato", seedType: "potato_item", baseHealth: 30, baseVirulence: 0, spriteID: 84, tileset: "cropTileset", maxStack: 8, drawSize: 4 },
    WHEAT_ITEM: { name: "Wheat", seedType: "wheat_item", baseHealth: 20, baseVirulence: 0, spriteID: 168, tileset: "gardenTileset", maxStack: 8 }, 
    PLANT_MATTER: { name: "Plant Matter", seedType: "plant_matter", baseHealth: 12, baseVirulence: 2, spriteID: 152, tileset: "gardenTileset", maxStack: 8 },

    // Seeds (maxStack: 64, standard 16px asset slices)
    TURNIP_SEED: { name: "Turnip Seed", seedType: "turnip_seed", baseHealth: 10, baseVirulence: 0, spriteID: 5, tileset: "cropTileset", maxStack: 64 },
    TOMATO_SEED: { name: "Tomato Seed", seedType: "tomato_seed", baseHealth: 10, baseVirulence: 0, spriteID: 29, tileset: "cropTileset", maxStack: 64 },
    EGGPLANT_SEED: { name: "Eggplant Seed", seedType: "eggplant_seed", baseHealth: 10, baseVirulence: 0, spriteID: 41, tileset: "cropTileset", maxStack: 64 },
    STRAWBERRY_SEED: { name: "Strawberry Seed", seedType: "strawberry_seed", baseHealth: 10, baseVirulence: 0, spriteID: 77, tileset: "cropTileset", maxStack: 64 },
    PUMPKIN_SEED: { name: "Pumpkin Seed", seedType: "pumpkin_seed", baseHealth: 10, baseVirulence: 0, spriteID: 101, tileset: "cropTileset", maxStack: 64 },
    WATERMELON_SEED: { name: "Watermelon Seed", seedType: "watermelon_seed", baseHealth: 10, baseVirulence: 0, spriteID: 35, tileset: "cropTileset", maxStack: 64 },
    CORN_SEED: { name: "Corn Seed", seedType: "corn_seed", baseHealth: 10, baseVirulence: 0, spriteID: 113, tileset: "cropTileset", maxStack: 64 },
    PINEAPPLE_SEED: { name: "Pineapple Crown", seedType: "pineapple_seed", baseHealth: 10, baseVirulence: 0, spriteID: 1, tileset: "gardenTileset", maxStack: 64 },
    POTATO_SEED: { name: "Potato Eye", seedType: "potato_seed", baseHealth: 10, baseVirulence: 0, spriteID: 2, tileset: "gardenTileset", maxStack: 64 },
    WHEAT_SEED: { name: "Wheat Seed", seedType: "wheat_seed", baseHealth: 10, baseVirulence: 0, spriteID: 65, tileset: "cropTileset", maxStack: 64 },
    
    // Wild Flower Seeds (maxStack: 64)
    GRASS_SEED: { name: "Grass Seed", seedType: "grass_seed", baseHealth: 10, baseVirulence: 0, spriteID: 0, tileset: "gardenTileset", maxStack: 64 },
    ROSE_SEED: { name: "Rose Seed", seedType: "rose_seed", baseHealth: 10, baseVirulence: 0, spriteID: 11, tileset: "cropTileset", maxStack: 64 },
    VIOLET_SEED: { name: "Violet Seed", seedType: "violet_seed", baseHealth: 10, baseVirulence: 0, spriteID: 23, tileset: "cropTileset", maxStack: 64 },
    SUNFLOWER_SEED: { name: "Sunflower Seed", seedType: "sunflower_seed", baseHealth: 10, baseVirulence: 0, spriteID: 119, tileset: "cropTileset", maxStack: 64 },

    // Fish Templates (maxStack: 8, standard 16px assets)
    BASS: { name: "River Bass", seedType: "fish", baseHealth: 40, baseVirulence: 10, spriteID: 43, tileset: "fishTileset", maxStack: 8 },
    TROUT: { name: "Trout", seedType: "fish_trout", baseHealth: 40, baseVirulence: 10, spriteID: 16, tileset: "fishTileset", maxStack: 8 },
    PANFISH: { name: "Panfish", seedType: "fish_panfish", baseHealth: 30, baseVirulence: 10, spriteID: 2, tileset: "fishTileset", maxStack: 8 },
    MACKEREL: { name: "Mackerel", seedType: "fish_mackerel", baseHealth: 50, baseVirulence: 10, spriteID: 70, tileset: "fishTileset", maxStack: 8 },
    MUSKELLUNGE: { name: "Muskellunge", seedType: "fish_muskellunge", baseHealth: 100, baseVirulence: 10, spriteID: 91, tileset: "fishTileset", maxStack: 8 },
    GIANT_TREVALLY: { name: "Giant Trevally", seedType: "fish_trevally", baseHealth: 80, baseVirulence: 10, spriteID: 35, tileset: "fishTileset", maxStack: 8 },
    SQUID: { name: "Squid", seedType: "fish_squid", baseHealth: 50, baseVirulence: 10, spriteID: 84, tileset: "fishTileset", maxStack: 8 },
    OCTOPUS: { name: "Octopus", seedType: "fish_octopus", baseHealth: 60, baseVirulence: 10, spriteID: 107, tileset: "fishTileset", maxStack: 8 },
    EEL: { name: "Eel", seedType: "fish_eel", baseHealth: 50, baseVirulence: 10, spriteID: 59, tileset: "fishTileset", maxStack: 8 },
    ANGLERFISH: { name: "Anglerfish", seedType: "fish_angler", baseHealth: 80, baseVirulence: 10, spriteID: 29, tileset: "fishTileset", maxStack: 8 },

    // Animal Products & Drops (maxStack: 8, custom drawSizes)
    EGG: { name: "Farm Egg", seedType: "egg", baseHealth: 30, baseVirulence: 0, spriteID: 60, tileset: "foodTileset", maxStack: 8, drawSize: 4 },
    RAW_CHICKEN: { name: "Raw Chicken", seedType: "raw_chicken", baseHealth: 50, baseVirulence: 10, spriteID: 15, tileset: "foodTileset", maxStack: 8, drawSize: 8 },

    // Keys & Weapons (maxStack: 1, custom drawSizes)
    KEY: { name: "House Key", seedType: "key", spriteID: 38, tileset: "keyTileset", isKey: true, baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 1, drawSize: 12 },
    DAGGER: { name: "Rusty Dagger", seedType: "weapon_dagger", spriteID: 0, tileset: "weaponTileset", isWeapon: true, ad: 5, baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 1, drawSize: 8 },
    PICKAXE: { name: "Miner's Pickaxe", seedType: "tool_pickaxe", spriteID: 69, tileset: "transparentTileset", isWeapon: true, ad: 3, baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 1, drawSize: 8 },

    // Metal Ore & Ingots (maxStack: 64, custom drawSizes)
    IRON_ORE: { name: "Iron Ore", seedType: "iron_ore", spriteID: 32, tileset: "craftingTileset", baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 64, drawSize: 8 },
    IRON_INGOT: { name: "Iron Ingot", seedType: "iron_ingot", spriteID: 36, tileset: "craftingTileset", baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 64, drawSize: 8 },
};



function createServerItem(template) {
    return {
        ...template,
        health: template.baseHealth,
        virulence: template.baseVirulence,
        count: 1,
        timestamp: Date.now()
    };
}

// Add this helper function to server.js:

function giveItemToServerInventory(player, newItem) {
    if (!newItem) return false;

    const maxSlots = 10;

    // 1. Try to merge with an existing stack
    if (newItem.maxStack > 1) {
        const existing = player.inventory.find(i => i.seedType === newItem.seedType && i.count < newItem.maxStack);
        if (existing) {
            const space = newItem.maxStack - existing.count;
            if (newItem.count <= space) {
                existing.count += newItem.count;
                return true;
            } else {
                existing.count = newItem.maxStack;
                newItem.count -= space;
            }
        }
    }

    // 2. Add to a new slot
    if (player.inventory.length < maxSlots) {
        player.inventory.push(newItem);
        return true;
    }

    return false; // Backpack full
}

// Add this helper function to server.js:

function isServerPlantMature(plant, currentGrowth) {
    const def = SERVER_PLANT_DEFS[plant.type];
    if (!def) return false;

    const stagesLength = def.stages;
    const harvestWindow = def.window || 1;

    // Calculate current stage index exactly like the client
    const currentStageIdx = Math.min(stagesLength - 1, Math.floor(currentGrowth / (100 / stagesLength)));
    
    // Is mature if current stage index is within the mature window
    return currentStageIdx >= (stagesLength - harvestWindow);
}


function getRandomServerFish() {
    const roll = Math.random() * 100;
    if (roll < 0.5) return SERVER_ITEM_TYPES.MUSKELLUNGE;    
    if (roll < 1.5) return SERVER_ITEM_TYPES.GIANT_TREVALLY; 
    if (roll < 3.5) return SERVER_ITEM_TYPES.ANGLERFISH;     
    if (roll < 7.0) return SERVER_ITEM_TYPES.OCTOPUS;        
    if (roll < 12.0) return SERVER_ITEM_TYPES.SQUID;         
    if (roll < 20.0) return SERVER_ITEM_TYPES.EEL;           
    if (roll < 35.0) return SERVER_ITEM_TYPES.MACKEREL;      
    if (roll < 60.0) return SERVER_ITEM_TYPES.TROUT;         
    if (roll < 80.0) return SERVER_ITEM_TYPES.BASS;          
    return SERVER_ITEM_TYPES.PANFISH;                        
}



// 2. Server-Side Plant Database
const serverPlants = new Map();

// Near the top of server.js:

const registeredServerRanches = new Set(); // 👈 🎯 THE FIX: Tracks registered ranch coordinates

// 3. Server-Side Active Fishing State Registry
const fishingStates = new Map(); // Key: socket.id, Value: { startTime, waitTime, active: true }

// Add these declarations near the top of server.js (with your other global arrays):

const chunkPlantsGenerated = new Set(); // Tracks generated chunk coordinate strings
const serverAnimals = [];              // Master server-side chicken database

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



// server.js (near top)
let globalDebt = 0.0;
if (fs.existsSync('debt.json')) {
    try { 
        const savedDebt = JSON.parse(fs.readFileSync('debt.json', 'utf8'));
        // 👈 THE FIX: Force it to be a Number immediately
        globalDebt = parseFloat(savedDebt.amount) || 0.0;
    } catch(err) { globalDebt = 0.0; }
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


function initServerAnimals() {
    for (let i = 0; i < 15; i++) {
        serverAnimals.push({
            id: 'animal_' + Math.random().toString(36).substr(2, 9),
            x: 1550 + Math.random() * 100, 
            y: 1550 + Math.random() * 100,
            speed: 20,
            hp: 30,
            maxHp: 30,
            state: 'idle',
            dir: 'East',
            moveTimer: Math.random() * 3,
            targetX: null,
            targetY: null,
            eggTimer: 15 + Math.random() * 20,  // Ready to lay in 15-35s
            poopTimer: 10 + Math.random() * 20  // Ready to poop in 10-30s
        });
    }
}
initServerAnimals(); // Execute startup spawn

// Add this helper function to server.js:

function generateServerFloraForChunk(cx, cy) {
    const density = 0.50; // 50% of the chunk's tiles will spawn flora
    for (let i = 0; i < 10000; i++) {
        if (Math.random() < density) {
            const lx = i % 100;
            const ly = Math.floor(i / 100);
            const gx = cx * 100 + lx;
            const gy = cy * 100 + ly;

            const roll = Math.random();
            let plantType = 'grass';
            if (roll > 0.95) plantType = 'sunflower';
            else if (roll > 0.85) plantType = 'rose';
            else if (roll > 0.70) plantType = 'violet';

            const gRate = SERVER_PLANT_DEFS[plantType]?.growthRate || 0.4;
            const initialAge = Math.floor(Math.random() * 100);

            serverPlants.set(`${gx}_${gy}`, {
                gx, gy,
                type: plantType,
                growth: initialAge,
                growthRate: gRate,
                timestamp: Date.now()
            });
        }
    }
}

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
        maxHp: CONFIG.HERO_HP,
        shield: 0,
        inventory: [], // 👈 THE CRITICAL FIX: Add this line!
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

    // ==========================================
    // 🎒 AUTHORITATIVE INVENTORY SYNC
    // ==========================================
    socket.on('syncInventory', (data) => {
        const player = players[socket.id];
        if (!player) return;

        // Sync the server-side representation with the validated client state
        player.inventory = data.inventory || [];
        player.equipment = data.equipment || { mainHand: null };

        // Force immediate save to persistence.json
        syncPlayerAndSave(socket.id);
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

// A. Plant Seed Request
    socket.on('requestPlantSeed', (data) => {
        const { tx, ty, index } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const item = player.inventory[index];
        if (!item || !(item.seedType.includes("_seed") || item.seedType === "potato_item")) return;

        // Distance validation
        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        const plantKey = `${tx}_${ty}`;
        if (serverPlants.has(plantKey)) return; // Spot occupied

        const plantType = item.seedType.replace("_seed", "").replace("_item", "");
        
        // Register securely on the server
        serverPlants.set(plantKey, {
            gx: tx, gy: ty,
            type: plantType,
            growth: 0,
            timestamp: Date.now()
        });

        // Deduct seed from server inventory
        item.count--;
        if (item.count <= 0) {
            player.inventory.splice(index, 1);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);

        // Broadcast the new plant to all nearby players
        io.emit('plantCreated', { gx: tx, gy: ty, type: plantType, growth: 0 });
    });

    // Replace the requestHarvest socket listener inside server.js with this:

    // Replace the requestHarvest socket listener inside server.js with this:

    // Replace the requestHarvest socket listener inside server.js with this:

    socket.on('requestHarvest', (data) => {
        const { tx, ty } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const plantKey = `${tx}_${ty}`;
        const plant = serverPlants.get(plantKey);
        if (!plant) return; 

        // Distance validation
        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        if (player.inventory.length >= 10) {
            socket.emit('inventoryFull');
            return;
        }

        const def = SERVER_PLANT_DEFS[plant.type];
        // 🎯 CHANGE THIS LINE: Fall back to 95% if harvestThreshold is undefined
        const threshold = (def && def.harvestThreshold !== undefined) ? def.harvestThreshold : 95;
        
        // Calculate growth securely
        const elapsedSeconds = plant.timestamp ? (Date.now() - plant.timestamp) / 1000 : 0;
        let startGrowth = plant.growth !== undefined ? parseFloat(plant.growth) : 0;
        if (isNaN(startGrowth)) startGrowth = 0;
        let gRate = plant.growthRate !== undefined ? parseFloat(plant.growthRate) : 0.4;
        if (isNaN(gRate)) gRate = 0.4;

        const currentGrowth = startGrowth + (gRate * 0.1 * elapsedSeconds);

        // 🎯 CHANGE THIS LINE: Use the identical visual-stage helper instead of a flat threshold!
        const isMature = isServerPlantMature(plant, currentGrowth);

        if (isMature) {
            // ==========================================
            // 🍇 1. SECURE MATURE HARVEST
            // ==========================================
            const yieldMap = {
                'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM',
                'eggplant': 'EGGPLANT_ITEM', 'strawberry': 'STRAWBERRY_ITEM',
                'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
                'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM',
                'potato': 'POTATO_ITEM', 'wheat': 'WHEAT_ITEM',
                'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
                'violet': 'PLANT_MATTER', 'sunflower': 'PLANT_MATTER'
            };

            const itemTypeName = yieldMap[plant.type] || 'PLANT_MATTER';
            const cropTemplate = SERVER_ITEM_TYPES[itemTypeName];
            
            if (cropTemplate) {
                giveItemToServerInventory(player, createServerItem(cropTemplate));
            }

            // Seed Drop
            const seedConstName = `${plant.type.toUpperCase()}_SEED`;
            const seedTemplate = SERVER_ITEM_TYPES[seedConstName];
            if (seedTemplate) {
                const seedCount = Math.floor(Math.random() * 2) + 1; 
                const seedItem = createServerItem(seedTemplate);
                seedItem.count = seedCount;
                giveItemToServerInventory(player, seedItem);
            }

            // Cyclical check
            if (def && def.isCyclical) {
                plant.growth = def.resetGrowth;
                plant.timestamp = Date.now(); 
                io.emit('plantReset', { gx: tx, gy: ty, growth: def.resetGrowth }); 
            } else {
                serverPlants.delete(plantKey);
                io.emit('plantRemoved', { gx: tx, gy: ty }); 
            }
        } 
        else {
            // ==========================================
            // 🍂 2. SECURE IMMATURE EARLY HARVEST (Wither/Destroy)
            // ==========================================
            console.log(`🍂 Early Pick! ${player.wallet} pulled immature ${plant.type} at [${tx}, ${ty}]`);
            
            // Give exactly 1x ruined Plant Matter securely
            const template = SERVER_ITEM_TYPES.PLANT_MATTER;
            if (template) {
                giveItemToServerInventory(player, createServerItem(template));
            }

            // Early-picked plants are always permanently deleted (never cyclical)
            serverPlants.delete(plantKey);
            io.emit('plantRemoved', { gx: tx, gy: ty }); 
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
    });
    // ==========================================
    // 🎣 SECURE SERVER-AUTHORITATIVE FISHING
    // ==========================================

    // A. Cast Line Request
    socket.on('requestCastLine', (data) => {
        const { tx, ty } = data;
        const player = players[socket.id];
        if (!player) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        // Calculate waiting time securely on the server
        const safeCount = Math.max(1, globalFishCount);
        const multiplier = Math.sqrt(10000 / safeCount);
        const scarcityMod = Math.min(30.0, multiplier);
        const waitTime = (2 + Math.random() * 3) * scarcityMod * 1000; // in milliseconds

        // Register the active fishing state for this socket
        fishingStates.set(socket.id, {
            startTime: Date.now(),
            waitTime: waitTime,
            active: true
        });

        // Send confirmation and the secure wait time back to the client
        socket.emit('fishingCastConfirmed', { waitTime });
    });

    // Replace the requestReelIn socket listener inside server.js with this:

    socket.on('requestReelIn', () => {
        const state = fishingStates.get(socket.id);
        const player = players[socket.id];
        if (!state || !state.active || !player) return;

        const elapsed = Date.now() - state.startTime;
        if (elapsed < state.waitTime) {
            console.log(`🚨 Hack blocked: ${player.wallet} tried to bypass the fishing timer.`);
            return;
        }

        // Catch a fish securely on the server
        const caughtFishTemplate = getRandomServerFish();
        const fishItem = createServerItem(caughtFishTemplate);

        // 🎯 Securely stack the fish
        if (giveItemToServerInventory(player, fishItem)) {
            // Subtract from global fish population only if player successfully received the fish
            globalFishCount = Math.max(0, globalFishCount - 1);
        } else {
            socket.emit('inventoryFull');
        }

        fishingStates.delete(socket.id); 

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('fishingFinished'); 
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

    // Inside io.on('connection', (socket) => { ... }) in server.js:

    // Replace the registerRanch socket listener inside server.js with this:

    socket.on('registerRanch', (data) => {
        const { gx, gy, w, h } = data;
        const ranchKey = `${gx}_${gy}`;

        if (registeredServerRanches.has(ranchKey)) {
            return; 
        }
        registeredServerRanches.add(ranchKey);

        console.log(`🐓 Registering new Server Ranch at [${gx}, ${gy}]. Spawning pasture chickens.`);

        const numChickens = Math.floor(Math.random() * 2) + 2; 
        
        for (let i = 0; i < numChickens; i++) {
            const rx = (gx + 1 + Math.random() * (w - 2)) * 16;
            const ry = (gy - h + 2 + Math.random() * (h - 2)) * 16;

            serverAnimals.push({
                id: 'animal_' + Math.random().toString(36).substr(2, 9),
                x: rx,
                y: ry,
                speed: 20,
                hp: 30,
                maxHp: 30,
                state: 'idle',
                dir: 'East',
                moveTimer: Math.random() * 3,
                targetX: null,
                targetY: null,
                eggTimer: 15 + Math.random() * 20,  // Ready to lay in 15-35s
                poopTimer: 10 + Math.random() * 20, // Ready to poop in 10-30s
                
                ranchBounds: { 
                    minX: (gx + 1) * 16, 
                    maxX: (gx + w - 2) * 16, 
                    minY: (gy - h + 2) * 16, 
                    maxY: (gy - 1) * 16 
                }
            });
        }
    });



    // Inside io.on('connection', (socket) => { ... }) in server.js:

    // 🎯 DYNAMIC CHUNK PLANT SYSTEM
    socket.on('requestChunkPlants', (data) => {
        const { cx, cy } = data;
        const chunkKey = `${cx}_${cy}`;

        // If this chunk has never been populated on the server, spawn it now!
        if (!chunkPlantsGenerated.has(chunkKey)) {
            chunkPlantsGenerated.add(chunkKey);
            generateServerFloraForChunk(cx, cy);
        }

        // Gather all active plants inside this chunk
        const chunkPlants = [];
        for (let [key, plant] of serverPlants) {
            const pCX = Math.floor(plant.gx / 100);
            const pCY = Math.floor(plant.gy / 100);
            if (pCX === cx && pCY === cy) {
                const elapsed = (Date.now() - plant.timestamp) / 1000;
                const currentGrowth = Math.min(100, plant.growth + (plant.growthRate * 0.1 * elapsed));
                
                chunkPlants.push({
                    gx: plant.gx,
                    gy: plant.gy,
                    type: plant.type,
                    growth: currentGrowth
                });
            }
        }

        socket.emit('chunkPlantsData', { cx, cy, plants: chunkPlants });
    });

    // 🎯 UPDATE MOVEMENT (Includes isLunge)
    socket.on('movement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].dir = data.dir;
            players[socket.id].animFrame = data.animFrame;
            players[socket.id].isMoving = data.isMoving;
            players[socket.id].isWindingUp = data.isWindingUp;
            players[socket.id].isLunge = data.isLunge; // 👈 Save the lunge flag
            players[socket.id].currentTileID = data.currentTileID;
            players[socket.id].pet = data.pet;
        }
    });



// Inside socket.on('updateStats') in server.js:

socket.on('updateStats', (data) => {
    const p = players[socket.id];
    if (!p) return;

    if (data.inventory) delete data.inventory;

    Object.assign(p, data);
    
    if (socket.wallet) {
        userDb[socket.wallet] = {
            ...userDb[socket.wallet], 
            ...data, // 🎯 Writes the active energy updates to persistence.json
            id: undefined,
            target: null
        };

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

// Inside socket.on('requestPickup'...) in server.js:

     // 1. Secure Server-Authoritative Pickup
    socket.on('requestPickup', (itemData) => {
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        // Distance validation (Anti-teleport/vacuum)
        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - itemData.tx) + Math.abs(py - itemData.ty) > 5) return;

        // 🎯 THE FIX: Map seedType to template keys to load secure properties (maxStack, drawSize)
        const seedTypeToKeyMap = {};
        for (let key in SERVER_ITEM_TYPES) {
            seedTypeToKeyMap[SERVER_ITEM_TYPES[key].seedType] = key;
        }
        
        const templateKey = seedTypeToKeyMap[itemData.seedType];
        const template = SERVER_ITEM_TYPES[templateKey];

        if (!template) {
            console.log(`❌ Secure template not found for: ${itemData.seedType}`);
            return;
        }

        // Create item using the trusted server-side template
        const newItem = createServerItem(template);
        
        // If it's a key, apply the specific houseId
        if (template.isKey) {
            newItem.houseId = itemData.houseId;
            newItem.name = `Key to House #${itemData.houseId}`;
        }

        // 🎯 THE FIX: Use our secure stacking helper!
        const success = giveItemToServerInventory(player, newItem);

        if (success) {
            // Wipe the ground tile
            io.emit('syncTile', { gx: itemData.tx, gy: itemData.ty, traits: 0 });
            
            syncPlayerAndSave(socket.id);
            socket.emit('updateInventory', player.inventory);
        } else {
            socket.emit('inventoryFull');
        }
    });

    // Inside io.on('connection', (socket) => { ... }) in server.js:

    // Inside io.on('connection', (socket) => { ... }) in server.js:

    // C. Register Wild Plant Request (Client-notified procedural spawner)
    socket.on('registerWildPlant', (data) => {
        const { gx, gy, type, growth } = data;
        const plantKey = `${gx}_${gy}`;
        
        // Register the plant if it is not already tracked by the server
        if (!serverPlants.has(plantKey)) {
            serverPlants.set(plantKey, {
                gx: gx, gy: gy,
                type: type,
                growth: growth || 0,
                timestamp: Date.now()
            });
        }
    });

    // ==========================================
    // 🎒 SECURE SERVER-AUTHORITATIVE INVENTORY
    // ==========================================

    // 2. Secure Equip Request
    socket.on('requestEquip', (data) => {
        const { index, currentEnergy } = data; // 👈 🎯 THE FIX: Accept currentEnergy
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        // Update the server's record with the active stamina value
        if (currentEnergy !== undefined) {
            player.energy = parseFloat(currentEnergy) || 100;
        }

        if (!player.equipment) player.equipment = { mainHand: null };
        const itemToEquip = player.inventory[index];
        if (!itemToEquip) return;

        if (player.equipment.mainHand) {
            const currentInHand = player.equipment.mainHand;
            player.equipment.mainHand = itemToEquip;
            player.inventory[index] = currentInHand;
        } else {
            player.equipment.mainHand = itemToEquip;
            player.inventory.splice(index, 1);
        }

        // Recalculate stats server-side
        player.ad = CONFIG.HERO_ATTACK;
        if (player.equipment.mainHand && player.equipment.mainHand.isWeapon) {
            player.ad += (player.equipment.mainHand.ad || 0);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('updateEquipment', player.equipment);
        socket.emit('restoreHero', player); // Safely restores active stamina
    });

    // 3. Secure Unequip Request
    socket.on('requestUnequip', (data) => {
        const { currentEnergy } = data || {}; // 👈 🎯 THE FIX: Accept currentEnergy
        const player = players[socket.id];
        if (!player || !player.inventory || !player.equipment || !player.equipment.mainHand) return;

        if (player.inventory.length >= 10) {
            socket.emit('inventoryFull');
            return;
        }

        // Update the server's record with the active stamina value
        if (currentEnergy !== undefined) {
            player.energy = parseFloat(currentEnergy) || 100;
        }

        player.inventory.push(player.equipment.mainHand);
        player.equipment.mainHand = null;

        player.ad = CONFIG.HERO_ATTACK;

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('updateEquipment', player.equipment);
        socket.emit('restoreHero', player); // Safely restores active stamina
    });


    // Replace the requestDrop socket listener inside server.js with this:

    socket.on('requestDrop', (data) => {
        const { index, amount, tx, ty } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const item = player.inventory[index];
        if (!item || item.count < amount) return;

        // Validate player is near the drop coordinate (Anti-vacuum/teleport)
        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) {
            console.log(`🚨 Hack blocked: ${player.wallet} tried to drop item too far away.`);
            return; 
        }

        const typeId = BACTERIA_TYPES[item.seedType] || 0; 
        let packedTraits = 0;
        
        if (typeId === 61) {
            packedTraits = ((item.houseId & 0xFFFF) | ((typeId & 0xFF) << 20)) >>> 0;
        } else {
            // Apply safe numerical defaults in case properties are missing
            const hVal = item.health !== undefined ? item.health : (item.baseHealth || 100);
            const vVal = item.virulence !== undefined ? item.virulence : (item.baseVirulence || 0);

            packedTraits = ((Math.floor(hVal) & 0xFF) | ((Math.floor(vVal) & 0xFF) << 8) | ((2 & 0x0F) << 16) | ((typeId & 0xFF) << 20)) >>> 0;
        }

        // Broadcast the new item drop on the ground to all clients
        io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });

        // Subtract from server inventory
        item.count -= amount;
        if (item.count <= 0) {
            player.inventory.splice(index, 1);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
    });

    // Locate socket.on('requestChestTransfer') inside server.js and replace its logic with this:
    socket.on('requestChestTransfer', (data) => {
        const { chestId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        // Validate distance to chest
        const cx = Math.floor(player.x / 16);
        const cy = Math.floor(player.y / 16);
        const coords = chestId.split('_');
        const tx = parseInt(coords[1]);
        const ty = parseInt(coords[2]);
        if (Math.abs(cx - tx) + Math.abs(cy - ty) > 5) return; 

        if (!chestDb[chestId]) chestDb[chestId] = [];
        const chestItems = chestDb[chestId];

        if (direction === 'to_chest') {
            const item = player.inventory[index];
            if (!item) return;

            player.inventory.splice(index, 1);

            // 🎯 THE FIX: Try to merge with an existing stack in the chest first
            let merged = false;
            if (item.maxStack > 1) {
                const existing = chestItems.find(i => i.seedType === item.seedType && i.count < item.maxStack);
                if (existing) {
                    const space = item.maxStack - existing.count;
                    if (item.count <= space) {
                        existing.count += item.count;
                        merged = true;
                    } else {
                        existing.count = item.maxStack;
                        item.count -= space;
                    }
                }
            }

            if (!merged) {
                chestItems.push(item);
            }
        } else if (direction === 'to_hero') {
            const item = chestItems[index];
            if (!item) return;

            chestItems.splice(index, 1);

            // 🎯 THE FIX: Use our secure stacking helper to merge into player's backpack
            const success = giveItemToServerInventory(player, item);
            if (!success) {
                chestItems.push(item); // Refund chest if backpack full
                socket.emit('inventoryFull');
                return;
            }
        }

        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));
        syncPlayerAndSave(socket.id);

        socket.emit('updateInventory', player.inventory);
        io.emit('chestUpdated', { chestId, items: chestItems });
    });

    // 5. Root Cellar Transfer Request
    socket.on('requestCellarTransfer', (data) => {
        const { cellarId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (!cellarDb[cellarId]) cellarDb[cellarId] = [];
        const cellarItems = cellarDb[cellarId];

        if (direction === 'to_cellar') {
            const item = player.inventory[index];
            if (!item || !["fish", "cooked_fish", "grass_item"].includes(item.seedType)) return;

            player.inventory.splice(index, 1);
            cellarItems.push(item);
        } else if (direction === 'to_hero') {
            if (player.inventory.length >= 10) {
                socket.emit('inventoryFull');
                return;
            }
            const item = cellarItems[index];
            if (!item) return;

            cellarItems.splice(index, 1);
            player.inventory.push(item);
        }

        fs.writeFileSync('cellars.json', JSON.stringify(cellarDb, null, 2));
        syncPlayerAndSave(socket.id);

        socket.emit('updateInventory', player.inventory);
        io.emit('cellarUpdated', { cellarId, items: cellarItems });
    });

    // 6. Hay Storage Transfer Request
    socket.on('requestHayTransfer', (data) => {
        const { hayStorageId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (!hayDb[hayStorageId]) hayDb[hayStorageId] = [];
        const hayItems = hayDb[hayStorageId];

        if (direction === 'to_storage') {
            const item = player.inventory[index];
            if (!item || item.seedType !== 'hay') return;

            player.inventory.splice(index, 1);
            hayItems.push(item);
        } else if (direction === 'to_hero') {
            if (player.inventory.length >= 10) {
                socket.emit('inventoryFull');
                return;
            }
            const item = hayItems[index];
            if (!item) return;

            hayItems.splice(index, 1);
            player.inventory.push(item);
        }

        fs.writeFileSync('hay.json', JSON.stringify(hayDb, null, 2));
        syncPlayerAndSave(socket.id);

        socket.emit('updateInventory', player.inventory);
        io.emit('hayStorageUpdated', { hayStorageId, items: hayItems });
    });

    // 7. Secure Altar Sacrifice (Index-based)
    socket.on('sacrificeItem', (data) => {
        const { index } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const item = player.inventory[index];
        if (!item) return;

        const isValidSeed = POINT_VALUES[item.seedType];
        if (!isValidSeed) return;

        const count = Math.min(64, Math.max(1, item.count || 1));

        // Calculate Payout securely on server
        const effectiveTGV = Math.max(0.00000001, currentTVL - globalDebt);
        const pointsPerSeed = effectiveTGV / 640000;
        const totalPoints = pointsPerSeed * count;

        // Deduct item from server inventory
        player.inventory.splice(index, 1);

        // Apply Points and Debt
        player.inGameUni = (parseFloat(player.inGameUni) || 0.0) + totalPoints;
        globalDebt = (parseFloat(globalDebt) || 0.0) + totalPoints;
        
        saveDebt();
        syncPlayerAndSave(socket.id); 
        
        socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        socket.emit('updateInventory', player.inventory); // Sync changes to client
        
        if (typeof broadcastEffectiveTGV === 'function') broadcastEffectiveTGV();
        if (typeof logActivity === 'function') {
            logActivity('SACRIFICE', socket.wallet || socket.id, `Sacrificed ${count}x ${item.seedType} for ${totalPoints.toFixed(8)} UNI`);
        }

        console.log(`💎 ${socket.wallet || socket.id} sacrificed ${count}x ${item.seedType} securely`);
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
    const rawAddress = (typeof data === 'object') ? data.address : data;
    if (!rawAddress) return;
    const address = (rawAddress.startsWith('0x')) ? ethers.getAddress(rawAddress) : rawAddress;
    socket.wallet = address;

    if (userDb[address]) {
        console.log(`💾 Restore: ${address} (${userDb[address].inventory?.length || 0} items)`);
        
        // 🛡️ THE FIX: Merge the database record into the active RAM object
        // This ensures stats AND inventory are both restored.
        players[socket.id] = { 
            ...players[socket.id], 
            ...userDb[address], 
            id: socket.id, 
            isOffline: false 
        };
        
        socket.emit('restoreHero', players[socket.id]);
    } else {
        socket.emit('needsCharacterCreation');
    }
});

// 🆕 ADD THIS NEW LISTENER:
socket.on('createCharacter', (data) => {
    const { wallet, charClass, skills } = data;
    const address = (wallet.startsWith('0x')) ? ethers.getAddress(wallet) : wallet;

    players[socket.id].wallet = address;
    players[socket.id].charClass = charClass;
    players[socket.id].skills = skills;
    
    // 🛡️ THE FIX: Only initialize to empty if there is no saved bag
    if (!userDb[address] || !userDb[address].inventory) {
        players[socket.id].inventory = [];
    } else {
        players[socket.id].inventory = userDb[address].inventory;
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

// server.js
function syncPlayerAndSave(socketId) {
    const p = players[socketId];
    if (!p || !p.wallet) return;

    // 🛡️ THE FIX: Ensure we create a copy of the player that includes the inventory
    userDb[p.wallet] = {
        ...p,
        id: undefined,  // Strip temp socket ID
        target: null    // Strip temp combat targets
    };

    fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
}

// Add this function at the bottom of server.js
function broadcastEffectiveTGV() {
    const effectiveTGV = Math.max(0, currentTVL - globalDebt);
    io.emit('tgvUpdate', { tgv: effectiveTGV });
}

// Add this interval to the bottom of server.js:


// --- Replace your setInterval at the bottom of server.js ---

// ==========================================
// THE HEARTBEAT (50ms Physics Loop)
// Update the 50ms heartbeat loop in server.js:
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

    // 🎯 UPDATE SERVER-SIDE CHICKENS (With strict pasture containment)
    serverAnimals.forEach(a => {
        // Initialize timers if missing
        if (a.eggTimer === undefined) a.eggTimer = 15;
        if (a.poopTimer === undefined) a.poopTimer = 10;

        // Tick timers down by delta
        a.eggTimer -= delta;
        a.poopTimer -= delta;

        const tx = Math.floor(a.x / 16);
        const ty = Math.floor(a.y / 16);

        // Lay Egg
        if (a.eggTimer <= 0) {
            a.eggTimer = 30 + Math.random() * 30; // Reset
            const packedTraits = (1 & 0xFF) | ((16 & 0xFF) << 20); // 30 hp, TypeID 16 (Egg)
            io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });
        }

        // Drop Poop
        if (a.poopTimer <= 0) {
            a.poopTimer = 20 + Math.random() * 30; // Reset
            const packedTraits = (3 & 0xFF) | ((12 & 0xFF) << 8) | ((4 & 0xFF) << 20); // 3 hp, 12 vir, TypeID 4 (Poop)
            io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });
        }

        a.moveTimer -= delta;
        if (a.moveTimer <= 0) {
            a.moveTimer = 2 + Math.random() * 3;
            
            let targetX, targetY;
            
            if (a.ranchBounds) {
                const rx = a.ranchBounds.maxX - a.ranchBounds.minX;
                const ry = a.ranchBounds.maxY - a.ranchBounds.minY;
                targetX = a.ranchBounds.minX + Math.random() * rx;
                targetY = a.ranchBounds.minY + Math.random() * ry;
            } else {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 50;
                targetX = a.x + Math.cos(angle) * dist;
                targetY = a.y + Math.sin(angle) * dist;
            }

            a.targetX = targetX;
            a.targetY = targetY;
            a.state = 'walking';
        }

        if (a.state === 'walking' && a.targetX !== null) {
            const dx = a.targetX - a.x;
            const dy = a.targetY - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 2) {
                a.x += (dx / dist) * a.speed * delta;
                a.y += (dy / dist) * a.speed * delta;
                a.dir = dx > 0 ? 'East' : 'West';
            } else {
                a.state = 'idle';
                a.targetX = null;
            }
        }
    });

    // 3. UPDATE FLYING PROJECTILES
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];

        if (p.targetId) {
            const target = players[p.targetId];
            if (target && target.hp > 0) {
                const tx = (target.x + 8) - p.x;
                const ty = (target.y + 8) - p.y;
                const dist = Math.sqrt(tx*tx + ty*ty);
                if (dist > 0) { p.dx = tx/dist; p.dy = ty/dist; }
            } else {
                p.life = 0; 
            }
        }

        p.x += p.dx * p.speed * delta;
        p.y += p.dy * p.speed * delta;
        p.life -= delta;

        let hit = false;

        for (let vid in players) {
            if (vid === p.ownerId) continue; 
            if (p.targetId && vid !== p.targetId) continue; 
            
            const victim = players[vid];
            if (victim.hp <= 0) continue; 

            const dx = (victim.x + 8) - p.x;
            const dy = (victim.y + 8) - p.y;
            const distSq = (dx * dx) + (dy * dy);
            const hitRadius = p.radius || 16;

            if (distSq <= hitRadius * hitRadius) {
                hit = true;
                const attacker = players[p.ownerId];
                if (attacker) {
                    if (p.type === 'zephyr') {
                        if (victim.resonanceTimer > 0) {
                            io.to(p.ownerId).emit('refundCooldown', { index: p.skillIndex, amount: 9.6 });
                            if (!attacker.passives || !attacker.passives.hasFever) {
                                victim.resonanceTimer = 0;
                                io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
                            }
                        }
                        applyMagicSpellDamage(attacker, victim, p.damage);
                    }
                    if (p.type === 'vanguard') {
                        const RAPTURE_MASK = 1 | 2 | 8 | 16; 
                        io.emit('playerCC', { victimId: vid, ccMask: RAPTURE_MASK, duration: 2.0 });
                        applyMagicSpellDamage(attacker, victim, p.damage);
                    }
                    else if (p.type === 'flare') {
                        applyMagicSpellDamage(attacker, victim, p.damage);
                    }
                }
                break; 
            }
        }

        if (hit || p.life <= 0) projectiles.splice(i, 1); 
    }

    // 🎯 4. BROADCAST ALL ENTITIES
    io.emit('position', { 
        playerbase: players,
        projectiles: projectiles,
        animals: serverAnimals 
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