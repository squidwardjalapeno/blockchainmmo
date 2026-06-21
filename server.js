import { CONFIG } from './src/config.js';
import { createVoucher, getContractTVL } from './src/voucherSystem.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// --- ADD STATIC FILE SERVING MIDDLEWARE HERE ---

// Serve static assets (such as styles.css, images) from the root folder
app.use(express.static(__dirname));

// Map the virtual '/js' path used in index.html to the actual 'src' directory where the game files live
app.use('/js', express.static(path.join(__dirname, 'src')));

// Explicitly serve index.html for root requests
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// 💾 DATABASE PERSISTENCE & REGISTRIES
// ==========================================
// ==========================================
let userDb = {};
let authDb = {};
let doorDb = {};
let oreDb = {};
let storeDb = {};
let cellarDb = {};
let hayDb = {};
let activeJobsDb = {}; // Consolidated Smelter, Anvil, Kitchen, and Hay Table DB

const serverBacteria = new Map();
const registeredServerRanches = new Set();
const fishingStates = new Map();
const chunkPlantsGenerated = new Set();
const serverPlants = new Map();
const serverAnimals = [];
const projectiles = [];
const players = {};
const worldSeed = Math.floor(Math.random() * 999999);
let activityLog = [];
let currentTVL = 0.0;
let globalDebt = 0.0;
let globalFishCount = 100;

// Load persisted DBs
const files = {
    'persistence.json': (data) => userDb = data,
    'doors.json': (data) => doorDb = data,
    'ores.json': (data) => oreDb = data,
    'auth.json': (data) => authDb = data,
    'activityLog.json': (data) => activityLog = data,
    'cellars.json': (data) => cellarDb = data,
    'hay.json': (data) => hayDb = data
};

Object.keys(files).forEach(file => {
    if (fs.existsSync(file)) {
        try { files[file](JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { console.error(`Error loading ${file}:`, e); }
    }
});

if (fs.existsSync('debt.json')) {
    try { globalDebt = parseFloat(JSON.parse(fs.readFileSync('debt.json', 'utf8')).amount) || 0.0; } catch (e) { globalDebt = 0.0; }
}

// Clean up stale transient registries
if (fs.existsSync('chests.json')) { try { fs.unlinkSync('chests.json'); } catch(e){} }
if (fs.existsSync('stores.json')) { try { fs.unlinkSync('stores.json'); } catch(e){} }

function saveDb(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ==========================================
// 📊 ECONOMY SYNC
// ==========================================
async function syncTVLWithBlockchain() {
    const rawTvl = await getContractTVL();
    if (rawTvl === null) return;
    currentTVL = parseFloat(rawTvl) || 0;
    const effectiveTGV = Math.max(0, currentTVL - globalDebt);
    io.emit('position', { playerbase: players, projectiles: projectiles, tgvOverride: effectiveTGV });
    broadcastEffectiveTGV();
}
syncTVLWithBlockchain();
setInterval(syncTVLWithBlockchain, 60000);

// ==========================================
// 📚 GAME DATA DICTIONARIES
// ==========================================
const POINT_VALUES = {
    "grass_seed": 1, "rose_seed": 1, "violet_seed": 1, "sunflower_seed": 1,
    "turnip_seed": 1, "tomato_seed": 1, "eggplant_seed": 1, "strawberry_seed": 1,
    "pumpkin_seed": 1, "watermelon_seed": 1, "corn_seed": 1, "pineapple_seed": 1,
    "potato_seed": 1, "wheat_seed": 1
};

const BACTERIA_TYPES = {
    "organic_drop": 1, "fish": 1, "organic_plant": 2, "grass": 2,
    "plant_matter": 3, "chicken_poop": 4, "cooked_fish": 5,
    "turnip_item": 6, "tomato_item": 7, "eggplant_item": 8,
    "strawberry_item": 9, "pumpkin_item": 10, "watermelon_item": 11,
    "corn_item": 12, "pineapple_item": 13, "potato_item": 14,
    "wheat_item": 15, "egg": 16, "hay": 17,
    "grass_seed": 20, "turnip_seed": 21, "tomato_seed": 22, "eggplant_seed": 23,
    "strawberry_seed": 24, "pumpkin_seed": 25, "watermelon_seed": 26, "corn_seed": 27,
    "pineapple_seed": 28, "potato_seed": 29, "wheat_seed": 30,
    "rose_seed": 31, "violet_seed": 32, "sunflower_seed": 33,
    "fish_trout": 40, "fish_panfish": 41, "fish_mackerel": 42, 
    "fish_muskellunge": 43, "fish_trevally": 44, "fish_squid": 45, 
    "fish_octopus": 46, "fish_eel": 47, "fish_angler": 48,
    "raw_chicken": 50, "weapon_dagger": 60, "key": 61
};

const SERVER_PLANT_DEFS = {
    'grass': { growthRate: 0.5, stages: 5, window: 1 },
    'rose': { growthRate: 0.25, stages: 5, window: 1 },
    'violet': { growthRate: 0.25, stages: 5, window: 1 },
    'sunflower': { growthRate: 0.25, stages: 5, window: 1 },
    'turnip': { growthRate: 0.4, stages: 4, window: 1 },
    'tomato': { growthRate: 0.2, stages: 12, window: 3, isCyclical: true, resetGrowth: 26 },
    'eggplant': { growthRate: 0.15, stages: 10, window: 1, isCyclical: true, resetGrowth: 31 },
    'strawberry': { growthRate: 0.24, stages: 10, window: 1, isCyclical: true, resetGrowth: 31 },
    'pumpkin': { growthRate: 0.35, stages: 4, window: 1 },
    'watermelon': { growthRate: 0.35, stages: 4, window: 1 },
    'corn': { growthRate: 0.35, stages: 4, window: 1 },
    'wheat': { growthRate: 0.4, stages: 4, window: 1 },
    'pineapple': { growthRate: 0.05, stages: 5, window: 1 },
    'potato': { growthRate: 0.15, stages: 5, window: 1 }
};

const SERVER_ITEM_TYPES = {
    TURNIP_ITEM: { name: "Turnip", seedType: "turnip_item", baseHealth: 30, baseVirulence: 0, spriteID: 0, tileset: "cropTileset", maxStack: 8 },
    TOMATO_ITEM: { name: "Tomato", seedType: "tomato_item", baseHealth: 30, baseVirulence: 0, spriteID: 24, tileset: "cropTileset", maxStack: 8 },
    EGGPLANT_ITEM: { name: "Eggplant", seedType: "eggplant_item", baseHealth: 30, baseVirulence: 0, spriteID: 36, tileset: "cropTileset", maxStack: 8 },
    STRAWBERRY_ITEM: { name: "Strawberry", seedType: "strawberry_item", baseHealth: 20, baseVirulence: 0, spriteID: 72, tileset: "cropTileset", maxStack: 8 },
    PUMPKIN_ITEM: { name: "Pumpkin", seedType: "pumpkin_item", baseHealth: 40, baseVirulence: 0, spriteID: 96, tileset: "cropTileset", maxStack: 8 },
    WATERMELON_ITEM: { name: "Watermelon", seedType: "watermelon_item", baseHealth: 40, baseVirulence: 0, spriteID: 30, tileset: "cropTileset", maxStack: 8 },
    CORN_ITEM: { name: "Corn", seedType: "corn_item", baseHealth: 30, baseVirulence: 0, spriteID: 108, tileset: "cropTileset", maxStack: 8 },
    PINEAPPLE_ITEM: { name: "Pineapple", seedType: "pineapple_item", baseHealth: 40, baseVirulence: 0, spriteID: 48, tileset: "cropTileset", maxStack: 8 },
    POTATO_ITEM: { name: "Potato", seedType: "potato_item", baseHealth: 30, baseVirulence: 0, spriteID: 84, tileset: "cropTileset", maxStack: 8 },
    WHEAT_ITEM: { name: "Wheat", seedType: "wheat_item", baseHealth: 20, baseVirulence: 0, spriteID: 168, tileset: "gardenTileset", maxStack: 8 }, 
    PLANT_MATTER: { name: "Plant Matter", seedType: "plant_matter", baseHealth: 12, baseVirulence: 2, spriteID: 152, tileset: "gardenTileset", maxStack: 8 },
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
    GRASS_SEED: { name: "Grass Seed", seedType: "grass_seed", baseHealth: 10, baseVirulence: 0, spriteID: 0, tileset: "gardenTileset", maxStack: 64 },
    ROSE_SEED: { name: "Rose Seed", seedType: "rose_seed", baseHealth: 10, baseVirulence: 0, spriteID: 11, tileset: "cropTileset", maxStack: 64 },
    VIOLET_SEED: { name: "Violet Seed", seedType: "violet_seed", baseHealth: 10, baseVirulence: 0, spriteID: 23, tileset: "cropTileset", maxStack: 64 },
    SUNFLOWER_SEED: { name: "Sunflower Seed", seedType: "sunflower_seed", baseHealth: 10, baseVirulence: 0, spriteID: 119, tileset: "cropTileset", maxStack: 64 },
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
    EGG: { name: "Farm Egg", seedType: "egg", baseHealth: 30, baseVirulence: 0, spriteID: 60, tileset: "foodTileset", maxStack: 8 },
    RAW_CHICKEN: { name: "Raw Chicken", seedType: "raw_chicken", baseHealth: 50, baseVirulence: 10, spriteID: 15, tileset: "foodTileset", maxStack: 8 },
    KEY: { name: "House Key", seedType: "key", spriteID: 38, tileset: "keyTileset", isKey: true, baseHealth: 100, baseVirulence: 0, maxStack: 1 },
    DAGGER: { name: "Rusty Dagger", seedType: "weapon_dagger", spriteID: 0, tileset: "weaponTileset", isWeapon: true, ad: 5, baseHealth: 100, maxStack: 1 },
    PICKAXE: { name: "Miner's Pickaxe", seedType: "tool_pickaxe", spriteID: 69, tileset: "transparentTileset", isWeapon: true, ad: 3, baseHealth: 100, maxStack: 1 },
    IRON_ORE: { name: "Iron Ore", seedType: "iron_ore", spriteID: 32, tileset: "craftingTileset", baseHealth: 100, maxStack: 64 },
    IRON_INGOT: { name: "Iron Ingot", seedType: "iron_ingot", spriteID: 36, tileset: "craftingTileset", baseHealth: 100, maxStack: 64 },
    HAY: { name: "Dried Hay", seedType: "hay", spriteID: 168, tileset: "gardenTileset", baseHealth: 100, maxStack: 64 }
};

const PROCESS_CONFIGS = {
    SMELTER: { maxWork: 200, cost: 0.0678, input: 'iron_ore', inputQty: 1, output: 'iron_ingot', outputQty: 1 },
    ANVIL: { maxWork: 300, cost: 0.10167, input: 'iron_ingot', inputQty: 1, output: 'weapon_dagger', outputQty: 1 },
    HAY_TABLE: { maxWork: 120, cost: 0.0407, input: 'plant_matter', inputQty: 8, output: 'hay', outputQty: 1 }
};

function createServerItem(template) {
    return { ...template, health: template.baseHealth, virulence: template.baseVirulence || 0, count: 1, timestamp: Date.now() };
}

function giveItemToServerInventory(player, newItem) {
    if (!newItem) return false;
    const maxSlots = 10;
    if (newItem.maxStack > 1) {
        const existing = player.inventory.find(i => i.seedType === newItem.seedType && i.count < newItem.maxStack);
        if (existing) {
            const space = newItem.maxStack - existing.count;
            if (newItem.count <= space) { existing.count += newItem.count; return true; }
            else { existing.count = newItem.maxStack; newItem.count -= space; }
        }
    }
    if (player.inventory.length < maxSlots) { player.inventory.push(newItem); return true; }
    return false;
}

function isServerPlantMature(plant, currentGrowth) {
    const def = SERVER_PLANT_DEFS[plant.type];
    if (!def) return false;
    const currentStageIdx = Math.min(def.stages - 1, Math.floor(currentGrowth / (100 / def.stages)));
    return currentStageIdx >= (def.stages - (def.window || 1));
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

function generateServerFloraForChunk(cx, cy) {
    const density = 0.50;
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
                gx, gy, type: plantType, growth: initialAge, growthRate: gRate, timestamp: Date.now()
            });
        }
    }
}

// ==========================================
// ⚔️ COMBAT & DEBUFF DAMAGE SOLVER
// ==========================================
function applyMagicSpellDamage(attacker, victim, baseDamage) {
    if (victim.isInvincible) return;
    if (victim.hasDivineBubble) {
        victim.hasDivineBubble = false;
        io.emit('playerHit', { victimId: victim.id, newHp: victim.hp, bubblePopped: true });
        return;
    }

    const victimMr = Math.max(1, victim.mr || 1);
    const mrReduction = Math.pow(0.5, Math.log10(victimMr));
    let finalDamage = Math.max(1, Math.floor(baseDamage * mrReduction));

    // Fever (Resonance Consumption)
    if (attacker.passives && attacker.passives.hasFever) {
        if (victim.resonanceTimer > 0) {
            victim.resonanceTimer = 0; 
            const percentMissing = 0.08 + ((attacker.magic || 0) * 0.0001); 
            const executeDamage = Math.floor(((victim.maxHp || 100) - victim.hp) * percentMissing);
            finalDamage += executeDamage;
        } else {
            victim.resonanceTimer = 4.0; 
            io.emit('playerCC', { victimId: victim.id, ccType: 'resonanceApply' });
        }
    }

    if (victim.shield > 0) {
        const dmgToShield = Math.min(victim.shield, finalDamage);
        victim.shield -= dmgToShield;
        finalDamage -= dmgToShield;
    }

    victim.hp = Math.max(0, victim.hp - finalDamage);
    io.emit('playerHit', { victimId: victim.id, newHp: victim.hp, newShield: victim.shield, attackerId: attacker.id });

    if (victim.hp <= 0) {
        const xpGain = (victim.xp || 0) * 0.30;
        attacker.xp = (attacker.xp || 0) + xpGain;
        if (victim.wallet) {
            userDb[victim.wallet].hp = 0; 
            userDb[victim.wallet].xp = victim.xp;
            saveDb('persistence.json', userDb);
        }
        io.emit('playerKilled', { victimId: victim.id, killerId: attacker.id, xpGained: xpGain, newAttackerXp: attacker.xp });
    }
}

// ==========================================
// 🛰️ SOCKET CONNECTION CONTROLLERS
// ==========================================
io.on('connection', (socket) => {
    console.log(`✨ Connected: ${socket.id}`);

    players[socket.id] = {
        id: socket.id, x: 1600, y: 1600, hp: CONFIG.HERO_HP, maxHp: CONFIG.HERO_HP,
        shield: 0, inventory: [], hasDivineBubble: false, isInvincible: false,
        passives: { hasFever: false }, resonanceTimer: 0, energy: 100, maxEnergy: 100,
        ad: CONFIG.HERO_ATTACK, armor: CONFIG.HERO_ARMOR, magic: CONFIG.HERO_MAGIC, mr: CONFIG.HERO_MAGIC_RESISTANCE,
        dir: 'South', inGameUni: 0, animFrame: 0, isMoving: false, isWindingUp: false
    };

    socket.emit('secret', { seed: worldSeed, myId: socket.id });

    socket.on('registerUser', (data) => {
        const user = data.username.trim().toLowerCase();
        if (authDb[user]) { socket.emit('authResponse', { success: false, message: "Username taken." }); return; }
        authDb[user] = data.password;
        saveDb('auth.json', authDb);
        socket.emit('authResponse', { success: true, wallet: `User_${user}` });
    });

    socket.on('loginUser', (data) => {
        const user = data.username.trim().toLowerCase();
        if (authDb[user] && authDb[user] === data.password) {
            socket.emit('authResponse', { success: true, wallet: `User_${user}` });
        } else { socket.emit('authResponse', { success: false, message: "Invalid credentials." }); }
    });

    socket.on('chatMessage', (data) => {
        const sender = socket.wallet || `Guest_${socket.id.substring(0, 4)}`;
        io.emit('chatMessage', { sender, message: data.message });
    });

    socket.on('syncInventory', (data) => {
        const p = players[socket.id];
        if (!p) return;
        p.inventory = data.inventory || [];
        p.equipment = data.equipment || { mainHand: null };
        syncPlayerAndSave(socket.id);
    });

    // Unified process table actions
    socket.on('startJob', (data) => {
        const { jobId, type, recipe } = data;
        const p = players[socket.id];
        if (!p || activeJobsDb[jobId]) return;

        const config = PROCESS_CONFIGS[type];
        if (type === 'KITCHEN') {
            let maxWork = 50;
            if (recipe === 'COOK_FISH') {
                const idx = p.inventory.findIndex(item => item.seedType === 'fish');
                if (idx === -1) return;
                p.inventory.splice(idx, 1);
            } else if (recipe.startsWith('EXTRACT_')) {
                const crop = recipe.replace('EXTRACT_', '').toLowerCase();
                const idx = p.inventory.findIndex(item => item.seedType === crop);
                if (idx === -1) return;
                p.inventory.splice(idx, 1);
                maxWork = 20;
            } else { return; }
            activeJobsDb[jobId] = { workLeft: maxWork, maxWork, active: true, ready: false, type, recipe };
        } else if (config) {
            const idx = p.inventory.findIndex(item => item.seedType === config.input);
            if (idx === -1 || p.inventory[idx].count < config.inputQty) return;
            p.inventory[idx].count -= config.inputQty;
            if (p.inventory[idx].count <= 0) p.inventory.splice(idx, 1);
            activeJobsDb[jobId] = { workLeft: config.maxWork, maxWork: config.maxWork, active: true, ready: false, type };
        }
        io.emit('jobUpdated', { jobId, data: activeJobsDb[jobId] });
        socket.emit('updateInventory', p.inventory);
    });

    socket.on('workSmelterStrike', (data) => { processStrike(data.jobId); });
    socket.on('workAnvilStrike', (data) => { processStrike(data.jobId); });
    socket.on('workKitchenStrike', (data) => { processStrike(data.jobId); });
    socket.on('workHayTableStrike', (data) => { processStrike(data.jobId); });

    function processStrike(jobId) {
        const job = activeJobsDb[jobId];
        if (job && job.active && job.workLeft > 0) {
            job.workLeft--;
            if (job.workLeft <= 0) job.ready = true;
            if (job.workLeft % 5 === 0 || job.workLeft === 0) io.emit('jobUpdated', { jobId, data: job });
        }
    }

    socket.on('speedUpJob', (data) => {
        const { jobId, type } = data;
        const p = players[socket.id];
        const job = activeJobsDb[jobId];
        if (!job || !job.active || !p) return;

        let cost = 0.0678;
        if (type === 'HAY_TABLE') cost = 0.0407;
        else if (type === 'ANVIL') cost = 0.10167;
        else if (type === 'KITCHEN') cost = job.recipe === 'COOK_FISH' ? 0.0169 : 0.0068;

        if (p.inGameUni >= cost) {
            p.inGameUni -= cost;
            globalDebt = Math.max(0, globalDebt - cost);
            saveDb('debt.json', { amount: globalDebt });
            logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${cost} UNI to speed up ${type} table`);

            job.workLeft = 0;
            job.ready = true;
            io.emit('jobUpdated', { jobId, data: job });
            socket.emit('balanceUpdated', { inGameUni: p.inGameUni });
            broadcastEffectiveTGV();
            syncPlayerAndSave(socket.id);
        }
    });

    socket.on('collectJob', (data) => {
        const { jobId, type } = data;
        const job = activeJobsDb[jobId];
        const p = players[socket.id];
        if (!job || !job.ready || !p) return;

        let itemType = 'iron_ingot';
        let qty = 1;

        if (type === 'ANVIL') itemType = 'weapon_dagger';
        else if (type === 'HAY_TABLE') itemType = 'hay';
        else if (type === 'KITCHEN') {
            if (job.recipe === 'COOK_FISH') itemType = 'cooked_fish';
            else if (job.recipe.startsWith('EXTRACT_')) {
                itemType = `${job.recipe.replace('EXTRACT_', '').replace('_ITEM', '').toLowerCase()}_seed`;
                qty = Math.floor(Math.random() * 4) + 5;
            }
        }

        const template = SERVER_ITEM_TYPES[itemType.toUpperCase()];
        if (template) {
            const item = createServerItem(template);
            item.count = qty;
            if (giveItemToServerInventory(p, item)) {
                delete activeJobsDb[jobId];
                io.emit('jobUpdated', { jobId, data: null });
                socket.emit('updateInventory', p.inventory);
            }
        }
    });

    socket.on('requestOre', (oreId) => {
        if (!oreDb[oreId]) oreDb[oreId] = { workLeft: 3600, maxWork: 3600, lastSpeedUp: 0, claimed: false };
        socket.emit('oreData', { oreId, data: oreDb[oreId] });
    });

    socket.on('mineOreStrike', (data) => {
        const { oreId } = data;
        const ore = oreDb[oreId];
        if (ore && ore.workLeft > 0) {
            ore.workLeft--;
            if (ore.workLeft % 5 === 0 || ore.workLeft === 0) {
                io.emit('oreUpdated', { oreId, data: ore });
                saveDb('ores.json', oreDb);
            }
        }
    });

    socket.on('speedUpOre', (data) => {
        const { oreId } = data;
        const p = players[socket.id];
        const ore = oreDb[oreId];
        if (!ore || !p) return;

        const cost = 1.22;
        if (p.inGameUni >= cost) {
            p.inGameUni -= cost;
            ore.workLeft = 0;
            globalDebt = Math.max(0, globalDebt - cost);
            saveDb('debt.json', { amount: globalDebt });
            saveDb('ores.json', oreDb);
            io.emit('oreUpdated', { oreId, data: ore });
            socket.emit('balanceUpdated', { inGameUni: p.inGameUni });
            broadcastEffectiveTGV();
            syncPlayerAndSave(socket.id);
        }
    });

    socket.on('collectOre', (data) => {
        const { oreId } = data;
        const ore = oreDb[oreId];
        if (ore && ore.workLeft === 0 && !ore.claimed) {
            ore.claimed = true;
            saveDb('ores.json', oreDb);
            io.emit('oreUpdated', { oreId, data: ore });
            socket.emit('receiveOreLoot');
        }
    });

    // Fishing casts
    socket.on('requestCastLine', (data) => {
        const { tx, ty } = data;
        const p = players[socket.id];
        if (!p) return;
        if (Math.abs(Math.floor(p.x / 16) - tx) + Math.abs(Math.floor(p.y / 16) - ty) > 5) return;

        const safeCount = Math.max(1, globalFishCount);
        const waitTime = (2 + Math.random() * 3) * Math.min(30.0, Math.sqrt(10000 / safeCount)) * 1000;

        fishingStates.set(socket.id, { startTime: Date.now(), waitTime, active: true });
        socket.emit('fishingCastConfirmed', { waitTime });
    });

    socket.on('requestReelIn', () => {
        const state = fishingStates.get(socket.id);
        const p = players[socket.id];
        if (!state || !state.active || !p) return;

        if (Date.now() - state.startTime < state.waitTime) return;

        const template = getRandomServerFish();
        const fish = createServerItem(template);
        if (giveItemToServerInventory(p, fish)) {
            globalFishCount = Math.max(0, globalFishCount - 1);
        }
        fishingStates.delete(socket.id);
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
        socket.emit('fishingFinished');
    });

    // Ranches
    socket.on('registerRanch', (data) => {
        const { gx, gy, w, h } = data;
        const ranchKey = `${gx}_${gy}`;
        if (registeredServerRanches.has(ranchKey)) return;
        registeredServerRanches.add(ranchKey);

        const count = Math.floor(Math.random() * 2) + 2;
        for (let i = 0; i < count; i++) {
            const rx = (gx + 1 + Math.random() * (w - 2)) * 16;
            const ry = (gy - h + 2 + Math.random() * (h - 2)) * 16;

            serverAnimals.push({
                id: 'animal_' + Math.random().toString(36).substr(2, 9),
                x: rx, y: ry, speed: 35, hp: 30, maxHp: 30, energy: 100,
                goal: 'wander', state: 'idle', dir: 'East', moveTimer: Math.random() * 3,
                eggTimer: 15 + Math.random() * 20, poopTimer: 10 + Math.random() * 20,
                ranchBounds: {
                    minX: (gx + 1) * 16, maxX: (gx + w - 2) * 16,
                    minY: (gy - h + 2) * 16, maxY: (gy - 1) * 16
                }
            });
        }
    });

    // Farming & Harvesting
    socket.on('requestPlantSeed', (data) => {
        const { tx, ty, index } = data;
        const p = players[socket.id];
        if (!p) return;

        let item = p.equipment?.mainHand;
        let isEquipped = true;
        if (!item || !(item.seedType.includes("_seed") || item.seedType === "potato_item")) {
            item = p.inventory[index];
            isEquipped = false;
        }
        if (!item) return;

        if (Math.abs(Math.floor(p.x / 16) - tx) + Math.abs(Math.floor(p.y / 16) - ty) > 5) return;
        const key = `${tx}_${ty}`;
        if (serverPlants.has(key)) return;

        const plantType = item.seedType.replace("_seed", "").replace("_item", "");
        serverPlants.set(key, { gx: tx, gy: ty, type: plantType, growth: 0, timestamp: Date.now() });

        if (isEquipped) {
            p.equipment.mainHand.count--;
            if (p.equipment.mainHand.count <= 0) p.equipment.mainHand = null;
            socket.emit('updateEquipment', p.equipment);
        } else {
            item.count--;
            if (item.count <= 0) p.inventory.splice(index, 1);
            socket.emit('updateInventory', p.inventory);
        }

        syncPlayerAndSave(socket.id);
        io.emit('plantCreated', { gx: tx, gy: ty, type: plantType, growth: 0 });
    });

    socket.on('registerWildPlant', (data) => {
        const key = `${data.gx}_${data.gy}`;
        serverPlants.set(key, { gx: data.gx, gy: data.gy, type: data.type, growth: data.growth || 0, timestamp: Date.now() });
    });

    socket.on('requestHarvest', (data) => {
        const { tx, ty } = data;
        const p = players[socket.id];
        if (!p || !p.inventory) return;

        const key = `${tx}_${ty}`;
        const plant = serverPlants.get(key);
        if (!plant) return;

        if (Math.abs(Math.floor(p.x / 16) - tx) + Math.abs(Math.floor(p.y / 16) - ty) > 5) return;
        if (p.inventory.length >= 10) { socket.emit('inventoryFull'); return; }

        const def = SERVER_PLANT_DEFS[plant.type];
        const elapsed = (Date.now() - plant.timestamp) / 1000;
        const currentGrowth = Math.min(100, (parseFloat(plant.growth) || 0) + (def?.growthRate || 0.4) * 0.1 * elapsed);

        const isMature = isServerPlantMature(plant, currentGrowth);
        if (isMature) {
            const yieldMap = {
                'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM',
                'eggplant': 'EGGPLANT_ITEM', 'strawberry': 'STRAWBERRY_ITEM',
                'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
                'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM',
                'potato': 'POTATO_ITEM', 'wheat': 'WHEAT_ITEM',
                'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
                'violet': 'PLANT_MATTER', 'sunflower': 'PLANT_MATTER'
            };
            const crop = SERVER_ITEM_TYPES[yieldMap[plant.type] || 'PLANT_MATTER'];
            if (crop) giveItemToServerInventory(p, createServerItem(crop));

            // Dynamic seeds for wild non-farm flowers
            const farmCrops = ['turnip', 'tomato', 'eggplant', 'strawberry', 'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato', 'wheat'];
            if (!farmCrops.includes(plant.type)) {
                const seedTemplate = SERVER_ITEM_TYPES[`${plant.type.toUpperCase()}_SEED`];
                if (seedTemplate) {
                    const seedItem = createServerItem(seedTemplate);
                    seedItem.count = Math.floor(Math.random() * 2) + 1;
                    giveItemToServerInventory(p, seedItem);
                }
            }

            if (def && def.isCyclical) {
                plant.growth = def.resetGrowth;
                plant.timestamp = Date.now();
                io.emit('plantReset', { gx: tx, gy: ty, growth: def.resetGrowth });
            } else {
                serverPlants.delete(key);
                io.emit('plantRemoved', { gx: tx, gy: ty });
            }
        } else {
            // Immature early picked wither
            giveItemToServerInventory(p, createServerItem(SERVER_ITEM_TYPES.PLANT_MATTER));
            serverPlants.delete(key);
            io.emit('plantRemoved', { gx: tx, gy: ty });
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
    });

    socket.on('requestChunkPlants', (data) => {
        const { cx, cy } = data;
        const key = `${cx}_${cy}`;
        if (!chunkPlantsGenerated.has(key)) {
            chunkPlantsGenerated.add(key);
            generateServerFloraForChunk(cx, cy);
        }

        const chunkPlants = [];
        for (let [pKey, plant] of serverPlants) {
            if (Math.floor(plant.gx / 100) === cx && Math.floor(plant.gy / 100) === cy) {
                const elapsed = (Date.now() - plant.timestamp) / 1000;
                const def = SERVER_PLANT_DEFS[plant.type];
                const currentGrowth = Math.min(100, (parseFloat(plant.growth) || 0) + (def?.growthRate || 0.4) * 0.1 * elapsed);
                chunkPlants.push({ gx: plant.gx, gy: plant.gy, type: plant.type, growth: currentGrowth });
            }
        }
        socket.emit('chunkPlantsData', { cx, cy, plants: chunkPlants });
    });

    // Doors state logic
    socket.emit('initDoorStates', doorDb);

    socket.on('requestDoorState', (data) => {
        const key = `${data.gx}_${data.gy}`;
        const state = doorDb[key] || { locked: true };
        socket.emit('doorState', { gx: data.gx, gy: data.gy, locked: state.locked });
    });

    socket.on('setDoorLock', (data) => {
        const key = `${data.gx}_${data.gy}`;
        doorDb[key] = { locked: data.locked };
        saveDb('doors.json', doorDb);
        io.emit('doorStateUpdated', { gx: data.gx, gy: data.gy, locked: data.locked });
    });

    // Movement update loop
    socket.on('movement', (data) => {
        const p = players[socket.id];
        if (p) {
            p.x = data.x; p.y = data.y; p.dir = data.dir;
            p.animFrame = data.animFrame; p.isMoving = data.isMoving;
            p.isWindingUp = data.isWindingUp; p.isLunge = data.isLunge;
            p.currentTileID = data.currentTileID; p.pet = data.pet;
        }
    });

    socket.on('updateStats', (data) => {
        const p = players[socket.id];
        if (!p) return;
        if (data.inventory) delete data.inventory;
        Object.assign(p, data);

        if (socket.wallet) {
            userDb[socket.wallet] = { ...userDb[socket.wallet], ...data, id: undefined, target: null };
            saveDb('persistence.json', userDb);
        }
    });

    // Web3 payments pay-out redemptions
    socket.on('requestWithdrawal', async (reqData) => {
        const p = players[socket.id];
        const amount = typeof reqData === 'object' ? reqData.amount : reqData;
        const target = (typeof reqData === 'object' && reqData.targetAddress) ? reqData.targetAddress : socket.wallet;

        if (!p || p.inGameUni < amount || !socket.wallet) return;

        p.inGameUni -= amount;
        globalDebt = Math.max(0, globalDebt - amount);
        saveDb('debt.json', { amount: globalDebt });
        syncPlayerAndSave(socket.id);

        socket.emit('balanceUpdated', { inGameUni: p.inGameUni });
        broadcastEffectiveTGV();

        const nonce = Math.floor(Math.random() * 1000000000);
        try {
            const voucher = await createVoucher(target, amount, nonce);
            socket.emit('receiveWithdrawalVoucher', voucher);
        } catch (err) {
            p.inGameUni += amount;
            globalDebt += amount;
            saveDb('debt.json', { amount: globalDebt });
            syncPlayerAndSave(socket.id);
            socket.emit('balanceUpdated', { inGameUni: p.inGameUni });
            broadcastEffectiveTGV();
        }
    });

    socket.on('requestActivityLog', () => { socket.emit('activityData', activityLog); });

    socket.on('requestEquip', (data) => {
        const p = players[socket.id];
        if (!p || !p.inventory) return;

        if (data.currentEnergy !== undefined) p.energy = parseFloat(data.currentEnergy) || 100;
        if (!p.equipment) p.equipment = { mainHand: null };

        const item = p.inventory[data.index];
        if (!item) return;

        if (p.equipment.mainHand) {
            const current = p.equipment.mainHand;
            p.equipment.mainHand = item;
            p.inventory[data.index] = current;
        } else {
            p.equipment.mainHand = item;
            p.inventory.splice(data.index, 1);
        }

        p.ad = CONFIG.HERO_ATTACK;
        if (p.equipment.mainHand && p.equipment.mainHand.isWeapon) {
            p.ad += (p.equipment.mainHand.ad || 0);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
        socket.emit('updateEquipment', p.equipment);
        socket.emit('restoreHero', p);
    });

    socket.on('requestUnequip', (data) => {
        const p = players[socket.id];
        if (!p || !p.inventory || !p.equipment || !p.equipment.mainHand) return;
        if (p.inventory.length >= 10) { socket.emit('inventoryFull'); return; }

        if (data?.currentEnergy !== undefined) p.energy = parseFloat(data.currentEnergy) || 100;

        p.inventory.push(p.equipment.mainHand);
        p.equipment.mainHand = null;
        p.ad = CONFIG.HERO_ATTACK;

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
        socket.emit('updateEquipment', p.equipment);
        socket.emit('restoreHero', p);
    });

    // Storage updates
    socket.on('requestChestTransfer', (data) => {
        const { chestId, index, direction } = data;
        const p = players[socket.id];
        if (!p || !p.inventory) return;

        const coords = chestId.split('_');
        if (Math.abs(Math.floor(p.x / 16) - parseInt(coords[1])) + Math.abs(Math.floor(p.y / 16) - parseInt(coords[2])) > 5) return;

        if (!storeDb[chestId]) storeDb[chestId] = [];
        const chestItems = storeDb[chestId];

        if (direction === 'to_chest') {
            const item = p.inventory[index];
            if (!item) return;
            if (chestItems.length >= 8) { socket.emit('oreMessage', "This chest is full! Maximum 8 slots."); return; }

            p.inventory.splice(index, 1);
            let merged = false;
            if (item.maxStack > 1) {
                const exist = chestItems.find(i => i.seedType === item.seedType && i.count < item.maxStack);
                if (exist) {
                    const space = item.maxStack - exist.count;
                    if (item.count <= space) { exist.count += item.count; merged = true; }
                    else { exist.count = item.maxStack; item.count -= space; }
                }
            }
            if (!merged) chestItems.push(item);
        } else {
            const item = chestItems[index];
            if (!item) return;
            chestItems.splice(index, 1);
            if (!giveItemToServerInventory(p, item)) {
                chestItems.push(item);
                socket.emit('inventoryFull');
                return;
            }
        }

        saveDb('chests.json', storeDb);
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
        io.emit('chestUpdated', { chestId, items: chestItems });
    });

    socket.on('requestCellarTransfer', (data) => {
        const { cellarId, index, direction } = data;
        const p = players[socket.id];
        if (!p || !p.inventory) return;

        if (!cellarDb[cellarId]) cellarDb[cellarId] = [];
        const items = cellarDb[cellarId];

        if (direction === 'to_cellar') {
            const item = p.inventory[index];
            if (!item || !["fish", "cooked_fish", "grass_item"].includes(item.seedType)) return;
            p.inventory.splice(index, 1);
            items.push(item);
        } else {
            if (p.inventory.length >= 10) { socket.emit('inventoryFull'); return; }
            const item = items[index];
            if (!item) return;
            items.splice(index, 1);
            p.inventory.push(item);
        }

        saveDb('cellars.json', cellarDb);
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
        io.emit('cellarUpdated', { cellarId, items });
    });

    socket.on('requestHayTransfer', (data) => {
        const { hayStorageId, index, direction } = data;
        const p = players[socket.id];
        if (!p || !p.inventory) return;

        if (!hayDb[hayStorageId]) hayDb[hayStorageId] = [];
        const items = hayDb[hayStorageId];

        if (direction === 'to_storage') {
            const item = p.inventory[index];
            if (!item || (item.seedType !== 'hay' && item.seedType !== 'plant_matter')) return;
            p.inventory.splice(index, 1);
            items.push(item);
        } else {
            if (p.inventory.length >= 10) { socket.emit('inventoryFull'); return; }
            const item = items[index];
            if (!item) return;
            items.splice(index, 1);
            p.inventory.push(item);
        }

        saveDb('hay.json', hayDb);
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', p.inventory);
        io.emit('hayStorageUpdated', { hayStorageId, items });
    });

    // Store listing controls
    socket.on('requestStore', (storeId) => {
        if (!storeDb[storeId]) storeDb[storeId] = { listings: [], storage: {} };
        socket.emit('storeData', { storeId, data: storeDb[storeId] });
    });

    socket.on('createListing', (data) => {
        const { storeId, wallet, offeredItem, wantedType } = data;
        storeDb[storeId].listings.push({ id: Date.now().toString(), seller: wallet, offeredItem, wantedType, counterOffer: null });
        saveDb('stores.json', storeDb);
        io.emit('storeUpdated', { storeId, data: storeDb[storeId] });
    });

    socket.on('buyListing', (data) => {
        const { storeId, listingId, buyerWallet, paymentItem, isHobbit } = data;
        const store = storeDb[storeId];
        const idx = store.listings.findIndex(l => l.id === listingId);
        if (idx !== -1) {
            const listing = store.listings[idx];
            if (!isHobbit) {
                if (!store.storage[buyerWallet]) store.storage[buyerWallet] = [];
                store.storage[buyerWallet].push(listing.offeredItem);
            }
            if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
            store.storage[listing.seller].push(paymentItem);
            store.listings.splice(idx, 1);
            saveDb('stores.json', storeDb);
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('claimStorage', (data) => {
        const { storeId, wallet } = data;
        const store = storeDb[storeId];
        if (store.storage[wallet]) {
            socket.emit('storageClaimed', { items: store.storage[wallet] });
            store.storage[wallet] = [];
            saveDb('stores.json', storeDb);
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    // Area-Of-Effect (AoE) castings
    socket.on('abilityAoE', (data) => {
        const attacker = players[socket.id];
        if (!attacker) return;

        for (let vid in players) {
            if (vid === socket.id) continue;
            const victim = players[vid];
            const dx = victim.x - data.x;
            const dy = victim.y - data.y;
            const distSq = (dx * dx) + (dy * dy);

            if (distSq <= data.radius * data.radius && victim.hp > 0) {
                if (data.type === 'divineBubbleExplosion') {
                    const dist = Math.sqrt(distSq) || 1;
                    victim.x += (dx / dist) * 32;
                    victim.y += (dy / dist) * 32;
                    io.emit('forcedMovement', { id: victim.id, x: victim.x, y: victim.y });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }
                else if (data.type === 'radiantNovaExplosion') {
                    io.emit('playerCC', { victimId: victim.id, ccType: 'slow', duration: 2.0 });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }
                else if (data.type === 'ringOfPenance') {
                    io.emit('playerCC', { victimId: victim.id, ccMask: 13, duration: 1.5 });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }
                else if (data.type === 'consecrationTick' || data.type === 'zenithGuardianSpawn') {
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }
            }
        }
    });

    // Skillshot Projectiles
    socket.on('fireProjectile', (data) => {
        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id, type: data.type,
            x: data.x, y: data.y, dx: data.dx, dy: data.dy,
            speed: data.speed, life: data.life, radius: data.radius, damage: data.damage
        });
    });

    socket.on('fireHomingProjectile', (data) => {
        const p = players[socket.id];
        if (!p) return;
        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id, type: data.type, targetId: data.targetId,
            x: p.x + 8, y: p.y + 8, speed: 350, life: 2.0, damage: data.damage, skillIndex: data.skillIndex
        });
    });

    socket.on('refundWithdrawal', (amt) => {
        const p = players[socket.id];
        const val = parseFloat(amt);
        if (p && val > 0) {
            p.inGameUni += val;
            socket.emit('balanceUpdated', { inGameUni: p.inGameUni });
        }
    });

    socket.on('identifyWallet', (data) => {
        const address = data.address || data;
        socket.wallet = address;
        if (userDb[address]) {
            players[socket.id] = { ...players[socket.id], ...userDb[address], id: socket.id };
            socket.emit('restoreHero', players[socket.id]);
        } else {
            socket.emit('needsCharacterCreation');
        }
    });

    socket.on('createCharacter', (data) => {
        const address = data.wallet;
        players[socket.id].wallet = address;
        players[socket.id].charClass = data.charClass;
        players[socket.id].skills = data.skills;
        players[socket.id].inventory = [];
        syncPlayerAndSave(socket.id);
        socket.emit('restoreHero', players[socket.id]);
    });

    socket.on('disconnect', () => {
        if (socket.wallet) syncPlayerAndSave(socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

function syncPlayerAndSave(id) {
    const p = players[id];
    if (!p || !p.wallet) return;
    userDb[p.wallet] = { ...p, id: undefined, target: null };
    saveDb('persistence.json', userDb);
}

function broadcastEffectiveTGV() {
    io.emit('tgvUpdate', { tgv: Math.max(0, currentTVL - globalDebt) });
}

// ==========================================
// ⏱️ CORE HEARTBEAT (50ms PHYSICS TICK)
// ==========================================
setInterval(() => {
    const delta = 0.05;

    // Tick resonance debuffs
    for (let vid in players) {
        const p = players[vid];
        if (p.resonanceTimer > 0) {
            p.resonanceTimer -= delta;
            if (p.resonanceTimer <= 0) io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
        }
    }

    // Tick Animals (Chicken AI loops)
    serverAnimals.forEach(a => {
        if (a.eggTimer === undefined) a.eggTimer = 15;
        if (a.poopTimer === undefined) a.poopTimer = 10;
        if (a.energy === undefined) a.energy = 100;

        a.eggTimer -= delta;
        a.poopTimer -= delta;
        a.energy = Math.max(0, a.energy - (delta * 1.5));

        const tx = Math.floor(a.x / 16);
        const ty = Math.floor(a.y / 16);
        const cx = Math.floor(tx / 100);
        const cy = Math.floor(ty / 100);

        if (a.eggTimer <= 0 && a.energy > 30) {
            a.eggTimer = 30 + Math.random() * 30;
            io.emit('syncTile', { gx: tx, gy: ty, traits: (1 & 0xFF) | ((16 & 0xFF) << 20) });
        }

        if (a.poopTimer <= 0) {
            a.poopTimer = 20 + Math.random() * 30;
            io.emit('syncTile', { gx: tx, gy: ty, traits: (3 & 0xFF) | ((12 & 0xFF) << 8) | ((4 & 0xFF) << 20) });
        }

        // Hunger search routines
        if (a.energy < 50 && a.goal !== 'eating') {
            let found = false;
            // Scan proximity for Hay items
            for (let ox = -5; ox <= 5; ox++) {
                for (let oy = -5; oy <= 5; oy++) {
                    const checkKey = `${tx + ox}_${ty + oy}`;
                    if (serverBacteria.has(checkKey)) {
                        const traits = serverBacteria.get(checkKey);
                        if (((traits >> 20) & 0xFF) === 17) {
                            a.targetX = (tx + ox) * 16 + 8;
                            a.targetY = (ty + oy) * 16 + 8;
                            a.goal = 'eating';
                            a.foodType = 'hay';
                            a.foodKey = checkKey;
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }

            if (!found) {
                let nearestPlant = null;
                let nearestDist = Infinity;
                for (let [key, plant] of serverPlants) {
                    if (Math.floor(plant.gx / 100) !== cx || Math.floor(plant.gy / 100) !== cy) continue;
                    if (Math.abs(plant.gx - tx) > 8 || Math.abs(plant.gy - ty) > 8) continue;
                    const dist = Math.hypot((plant.gx * 16 + 8) - a.x, (plant.gy * 16 + 8) - a.y);
                    if (dist < 120 && dist < nearestDist) {
                        nearestDist = dist;
                        nearestPlant = plant;
                    }
                }
                if (nearestPlant) {
                    a.targetX = nearestPlant.gx * 16 + 8;
                    a.targetY = nearestPlant.gy * 16 + 8;
                    a.goal = 'eating';
                    a.foodType = 'crop';
                    a.foodKey = `${nearestPlant.gx}_${nearestPlant.gy}`;
                }
            }
        }

        a.moveTimer -= delta;
        if (a.moveTimer <= 0 && a.goal !== 'eating') {
            a.moveTimer = 2 + Math.random() * 3;
            let targetX, targetY;
            if (a.ranchBounds) {
                targetX = a.ranchBounds.minX + Math.random() * (a.ranchBounds.maxX - a.ranchBounds.minX);
                targetY = a.ranchBounds.minY + Math.random() * (a.ranchBounds.maxY - a.ranchBounds.minY);
            } else {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 50;
                targetX = a.x + Math.cos(angle) * dist;
                targetY = a.y + Math.sin(angle) * dist;
            }
            a.targetX = targetX; a.targetY = targetY;
            a.state = 'walking'; a.goal = 'wander';
        }

        // Processing movement steps
        if (a.targetX !== undefined) {
            const dx = a.targetX - a.x;
            const dy = a.targetY - a.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 4) {
                a.x += (dx / dist) * a.speed * delta;
                a.y += (dy / dist) * a.speed * delta;
                a.dir = dx > 0 ? 'East' : 'West';
                a.state = 'walking';
            } else {
                a.state = 'idle';
                a.targetX = undefined;
                a.targetY = undefined;

                if (a.goal === 'eating') {
                    if (a.foodType === 'hay') {
                        const coords = a.foodKey.split('_');
                        const hx = parseInt(coords[0]), hy = parseInt(coords[1]);
                        if (serverBacteria.has(a.foodKey)) {
                            let traits = serverBacteria.get(a.foodKey);
                            let health = Math.max(0, (traits & 0xFF) - 10);
                            if (health <= 0) {
                                serverBacteria.delete(a.foodKey);
                                io.emit('syncTile', { gx: hx, gy: hy, traits: 0 });
                            } else {
                                const typeID = (traits >> 20) & 0xFF;
                                const newTraits = ((health & 0xFF) | ((typeID & 0xFF) << 20)) >>> 0;
                                serverBacteria.set(a.foodKey, newTraits);
                                io.emit('syncTile', { gx: hx, gy: hy, traits: newTraits });
                            }
                            a.energy = 100;
                        }
                    } else if (a.foodType === 'crop') {
                        if (serverPlants.has(a.foodKey)) {
                            const plant = serverPlants.get(a.foodKey);
                            serverPlants.delete(a.foodKey);
                            io.emit('plantRemoved', { gx: plant.gx, gy: plant.gy });
                            a.energy = 100;
                        }
                    }
                    a.goal = 'wander';
                }
            }
        }
    });

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        if (p.targetId) {
            const target = players[p.targetId];
            if (target && target.hp > 0) {
                const tx = (target.x + 8) - p.x;
                const ty = (target.y + 8) - p.y;
                const dist = Math.sqrt(tx*tx + ty*ty);
                if (dist > 0) { p.dx = tx/dist; p.dy = ty/dist; }
            } else { p.life = 0; }
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
            const radius = p.radius || 16;

            if (distSq <= radius * radius) {
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
                    else if (p.type === 'vanguard') {
                        io.emit('playerCC', { victimId: vid, ccMask: 30, duration: 2.0 });
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

    io.emit('position', { playerbase: players, projectiles: projectiles, animals: serverAnimals });
}, 50);

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
    console.log(`🎮 Authority logic, projectiles, combat and AI systems fully armed on port ${PORT}`);
});