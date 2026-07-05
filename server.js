// server.js

// 1. Modern Imports (ES Modules)
import { CONFIG } from './src/config.js'; 
import { createVoucher, getContractTVL   } from './src/voucherSystem.js'; 
import { ITEM_TYPES, createItem } from './src/items.js'; // 👈 Loaded from items.js as the single source of truth
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ethers } from 'ethers';

// 2. Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverBacteria = new Map(); 

// 3. Initialize App & Socket
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

let currentTVL = 0.0;

async function syncTVLWithBlockchain() {
    const rawTvl = await getContractTVL();
    
    if (rawTvl === null) {
        console.log("⚠️ RPC Query failed. Keeping last known TGV.");
        return;
    }
    
    currentTVL = parseFloat(rawTvl) || 0;
    const debt = parseFloat(globalDebt) || 0;

    const effectiveTGV = Math.max(0, currentTVL - debt);
    
    io.emit('position', { 
        playerbase: players, 
        projectiles: projectiles,
        tgvOverride: effectiveTGV 
    });

    broadcastEffectiveTGV();

    console.log(`📊 ECONOMY SYNC | Raw: ${currentTVL.toFixed(8)} | Debt: ${debt.toFixed(8)} | Final TGV: ${effectiveTGV.toFixed(8)}`);
}

syncTVLWithBlockchain();
setInterval(syncTVLWithBlockchain, 60000);

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
    "wheat_item": 15, "egg": 16,     "hay": 17, 

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

// ==========================================
// 🏗️ UNIFIED WORKSTATION CONFIGURATIONS (SERVER)
// ==========================================
const WORKSTATION_CONFIGS = {
    smelter: {
        maxWork: 200,
        speedUpCost: 0.0678,
        inputItem: 'iron_ore',
        inputCount: 1,
        outputItem: 'iron_ingot'
    },
    anvil: {
        maxWork: 300,
        speedUpCost: 0.10167,
        inputItem: 'iron_ingot',
        inputCount: 1,
        outputItem: 'weapon_dagger'
    },
    haytable: {
        maxWork: 120,
        speedUpCost: 0.0407,
        inputItem: 'plant_matter',
        inputCount: 8,
        outputItem: 'hay'
    },
    kitchen: {
        recipes: {
            COOK_FISH: { maxWork: 50, speedUpCost: 0.0169, inputItem: 'fish', inputCount: 1, outputItem: 'cooked_fish' },
            EXTRACT_TURNIP_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'turnip_item', inputCount: 1, outputItem: 'turnip_seed' },
            EXTRACT_TOMATO_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'tomato_item', inputCount: 1, outputItem: 'tomato_seed' },
            EXTRACT_EGGPLANT_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'eggplant_item', inputCount: 1, outputItem: 'eggplant_seed' },
            EXTRACT_STRAWBERRY_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'strawberry_item', inputCount: 1, outputItem: 'strawberry_seed' },
            EXTRACT_PUMPKIN_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'pumpkin_item', inputCount: 1, outputItem: 'pumpkin_seed' },
            EXTRACT_WATERMELON_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'watermelon_item', inputCount: 1, outputItem: 'watermelon_seed' },
            EXTRACT_CORN_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'corn_item', inputCount: 1, outputItem: 'corn_seed' },
            EXTRACT_PINEAPPLE_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'pineapple_item', inputCount: 1, outputItem: 'pineapple_seed' },
            EXTRACT_POTATO_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'potato_item', inputCount: 1, outputItem: 'potato_seed' },
            EXTRACT_WHEAT_ITEM: { maxWork: 20, speedUpCost: 0.0068, inputItem: 'wheat_item', inputCount: 1, outputItem: 'wheat_seed' }
        }
    }
};

function giveItemToServerInventory(player, newItem) {
    if (!newItem) return false;

    const maxSlots = 10;

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

    if (player.inventory.length < maxSlots) {
        player.inventory.push(newItem);
        return true;
    }

    return false; 
}

function isServerPlantMature(plant, currentGrowth) {
    const def = SERVER_PLANT_DEFS[plant.type];
    if (!def) return false;

    const stagesLength = def.stages;
    const harvestWindow = def.window || 1;

    const currentStageIdx = Math.min(stagesLength - 1, Math.floor(currentGrowth / (100 / stagesLength)));
    return currentStageIdx >= (stagesLength - harvestWindow);
}

function getRandomServerFish() {
    const roll = Math.random() * 100;
    if (roll < 0.5) return ITEM_TYPES.MUSKELLUNGE;    
    if (roll < 1.5) return ITEM_TYPES.GIANT_TREVALLY; 
    if (roll < 3.5) return ITEM_TYPES.ANGLERFISH;     
    if (roll < 7.0) return ITEM_TYPES.OCTOPUS;        
    if (roll < 12.0) return ITEM_TYPES.SQUID;         
    if (roll < 20.0) return ITEM_TYPES.EEL;           
    if (roll < 35.0) return ITEM_TYPES.MACKEREL;      
    if (roll < 60.0) return ITEM_TYPES.TROUT;         
    if (roll < 80.0) return ITEM_TYPES.BASS;          
    return ITEM_TYPES.PANFISH;                        
}

const serverPlants = new Map();
const registeredServerRanches = new Set(); 
const fishingStates = new Map(); 
const chunkPlantsGenerated = new Set(); 
const serverAnimals = [];              
const activeJobs = new Map(); // Unified jobs DB

// 🏰 SERVER-SIDE VILLAGE REGISTRY STATE
const serverVillages = new Map(); // key: "wellX_wellY", value: { x, y, owner, captureProgress, capturer, contested }

function getVillagePlayerCounts(wellX, wellY, owner) {
    let allies = 0;
    let enemies = 0;

    for (let id in players) {
        const p = players[id];
        if (p.hp <= 0 || p.isOffline) continue;

        const dist = Math.hypot(p.x - (wellX * 16), p.y - (wellY * 16));
        if (dist <= 2400) { // 150 tiles boundary radius inside the ring road
            const pName = p.wallet || `Guest_${p.id.substring(0, 4)}`;
            if (pName === owner) {
                allies++;
            } else {
                enemies++;
            }
        }
    }

    return { allies, enemies };
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src'))); 
app.use('/js', express.static(path.join(__dirname, 'src')));  

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const players = {};
const worldSeed = Math.floor(Math.random() * 999999);

let userDb = {}; 
if (fs.existsSync('persistence.json')) {
    try { 
        userDb = JSON.parse(fs.readFileSync('persistence.json', 'utf8')); 
        console.log(`✅ Loaded ${Object.keys(userDb).length} player profiles.`);
    } catch(err){ console.error("Database load error:", err); }
}
let chestDb = {}; 
let storeDb = {}; 
let cellarDb = {}; 
let hayDb = {}; 
let oreDb = {}; 
let doorDb = {};

if (fs.existsSync('doors.json')) {
    try { doorDb = JSON.parse(fs.readFileSync('doors.json', 'utf8')); } catch(err){}
}
function saveDoors() {
    fs.writeFileSync('doors.json', JSON.stringify(doorDb, null, 2));
}

let activityLog = [];
if (fs.existsSync('activity.json')) {
    try { 
        activityLog = JSON.parse(fs.readFileSync('activity.json', 'utf8')); 
    } catch(err){}
}

function logActivity(type, wallet, description) {
    activityLog.unshift({ type, wallet, description, timestamp: Date.now() });
    if (activityLog.length > 50) activityLog.pop();
    fs.writeFileSync('activity.json', JSON.stringify(activityLog, null, 2));
}

let globalDebt = 0;
if (fs.existsSync('debt.json')) {
    try {
        const dData = JSON.parse(fs.readFileSync('debt.json', 'utf8'));
        globalDebt = parseFloat(dData.amount) || 0.0;
    } catch(err) { globalDebt = 0.0; }
}

function saveDebt() {
    fs.writeFileSync('debt.json', JSON.stringify({ amount: globalDebt }, null, 2));
}

if (fs.existsSync('ores.json')) {
    try { oreDb = JSON.parse(fs.readFileSync('ores.json', 'utf8')); } catch(err){}
}

let authDb = {}; 
if (fs.existsSync('auth.json')) {
    try { authDb = JSON.parse(fs.readFileSync('auth.json', 'utf8')); } catch(err){}
}
function saveAuth() {
    fs.writeFileSync('auth.json', JSON.stringify(authDb, null, 2));
}

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
            speed: 35,
            hp: 30,
            maxHp: 30,
            energy: 100,
            goal: 'wander',
            state: 'idle',
            dir: 'East',
            moveTimer: Math.random() * 3,
            targetX: undefined,
            targetY: undefined,
            eggTimer: 15 + Math.random() * 20,  
            poopTimer: 10 + Math.random() * 20  
        });
    }
}
initServerAnimals(); 

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
                gx, gy,
                type: plantType,
                growth: initialAge,
                growthRate: gRate,
                timestamp: Date.now()
            });
        }
    }
}

const projectiles = [];

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

    if (attacker.passives && attacker.passives.hasFever) {
        if (victim.resonanceTimer > 0) {
            victim.resonanceTimer = 0; 

            const percentMissing = 0.08 + ((attacker.magic || 0) * 0.0001); 
            const missingHp = (victim.maxHp || 100) - victim.hp;
            const executeDamage = Math.floor(missingHp * percentMissing);
            
            finalDamage += executeDamage;
            console.log(`🔥 Resonance Consumed! +${executeDamage} Execute Damage`);
        } else {
            victim.resonanceTimer = 4.0; 
            io.emit('playerCC', { victimId: victim.id, ccType: 'resonanceApply' });
            console.log(`✨ Resonance Applied to ${victim.id}`);
        }
    }

    if (victim.shield > 0) {
        const dmgToShield = Math.min(victim.shield, finalDamage);
        victim.shield -= dmgToShield;
        finalDamage -= dmgToShield;
    }

    victim.hp -= finalDamage;
    io.emit('playerHit', { 
        victimId: victim.id, newHp: victim.hp, newShield: victim.shield, attackerId: attacker.id 
    });

    if (victim.hp <= 0) {
        const xpGain = (victim.xp || 0) * 0.30;
        attacker.xp = (attacker.xp || 0) + xpGain;
        if (victim.wallet) {
            userDb[victim.wallet].hp = 0; userDb[victim.wallet].xp = victim.xp;
        }
        io.emit('playerKilled', { victimId: victim.id, killerId: attacker.id, xpGained: xpGain, newAttackerXp: attacker.xp });
    }
}

function getJobConfig(jobId, recipeName) {
    const tableType = jobId.split('_')[0]; 
    const baseConfig = WORKSTATION_CONFIGS[tableType];
    if (!baseConfig) return null;

    if (tableType === 'kitchen') {
        return baseConfig.recipes[recipeName] || null;
    }
    return baseConfig;
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

    socket.emit('secret', { seed: worldSeed, myId: socket.id });

    socket.on('registerUser', (data) => {
        const { username, password } = data;
        const safeUser = username.trim().toLowerCase();
        
        if (authDb[safeUser]) {
            socket.emit('authResponse', { success: false, message: "Username already taken." });
            return;
        }
        
        authDb[safeUser] = password; 
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

    socket.on('chatMessage', (data) => {
        const senderName = socket.wallet || `Guest_${socket.id.substring(0, 4)}`;
        io.emit('chatMessage', { sender: senderName, message: data.message });
    });

    socket.on('syncInventory', (data) => {
        const player = players[socket.id];
        if (!player) return;

        player.inventory = data.inventory || [];
        player.equipment = data.equipment || { mainHand: null };

        syncPlayerAndSave(socket.id);
    });

    // ==========================================
    // 🎛️ MULTIPLAYER VILLAGE CORE CONTROL LISTENERS
    // ==========================================
    socket.on('requestWellInteraction', (data) => {
        const { wellX, wellY } = data;
        const key = `${wellX}_${wellY}`;
        const player = players[socket.id];
        if (!player) return;

        if (!serverVillages.has(key)) {
            serverVillages.set(key, {
                x: wellX,
                y: wellY,
                owner: null,
                captureProgress: 0,
                capturer: null,
                contested: false
            });
        }

        const village = serverVillages.get(key);

        if (village.owner === null) {
            village.owner = player.wallet || `Guest_${player.id.substring(0, 4)}`;
            village.captureProgress = 0;
            village.capturer = null;
            io.emit('villageOwnerUpdated', { wellX, wellY, owner: village.owner, progress: 0 });
            io.emit('chatMessage', { sender: "SYSTEM", message: `🏘️ Village at [${wellX}, ${wellY}] claimed peacefully by ${village.owner}!` });
        } else {
            const counts = getVillagePlayerCounts(wellX, wellY, village.owner);
            
            if (counts.enemies > counts.allies) {
                village.capturer = player.wallet || `Guest_${player.id.substring(0, 4)}`;
                io.emit('villageCaptureProgress', { wellX, wellY, progress: village.captureProgress, capturer: village.capturer });
            } else {
                socket.emit('wellInteractionMessage', { message: "The village is secured by defenders! Defeat them to capture." });
            }
        }
    });

    // ==========================================
    // 🛠️ UNIFIED WORKSTATION SYSTEM (SERVER)
    // ==========================================
    socket.on('request_job', (jobId) => {
        const config = getJobConfig(jobId);
        if (!activeJobs.has(jobId)) {
            activeJobs.set(jobId, {
                workLeft: config ? config.maxWork : 100,
                maxWork: config ? config.maxWork : 100,
                active: false,
                ready: false,
                recipe: null
            });
        }
        socket.emit('job_data', { jobId, data: activeJobs.get(jobId) });
    });

    socket.on('start_job', (data) => {
        const { jobId, recipe } = data;
        const player = players[socket.id];
        const job = activeJobs.get(jobId);
        if (!player || !job || job.active || job.ready) return;

        const config = getJobConfig(jobId, recipe);
        if (!config) return;

        const itemIdx = player.inventory.findIndex(item => item.seedType === config.inputItem);
        if (itemIdx === -1 || player.inventory[itemIdx].count < config.inputCount) return;

        player.inventory[itemIdx].count -= config.inputCount;
        if (player.inventory[itemIdx].count <= 0) {
            player.inventory.splice(itemIdx, 1);
        }

        job.maxWork = config.maxWork;
        job.workLeft = config.maxWork;
        job.active = true;
        job.ready = false;
        job.recipe = recipe;

        io.emit('job_updated', { jobId, data: job });
        socket.emit('updateInventory', player.inventory);
    });

    socket.on('work_job_strike', (data) => {
        const job = activeJobs.get(data.jobId);
        if (job && job.active && job.workLeft > 0) {
            job.workLeft--;
            if (job.workLeft <= 0) {
                job.ready = true;
            }
            if (job.workLeft % 5 === 0 || job.workLeft === 0) {
                io.emit('job_updated', { jobId: data.jobId, data: job });
            }
        }
    });

    socket.on('speed_up_job', (data) => {
        const player = players[socket.id];
        const job = activeJobs.get(data.jobId);
        if (!player || !job || !job.active) return;

        const config = getJobConfig(data.jobId, job.recipe);
        if (!config) return;

        if (player.inGameUni >= config.speedUpCost) {
            player.inGameUni -= config.speedUpCost;
            globalDebt = Math.max(0, globalDebt - config.speedUpCost);
            saveDebt();
            logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${config.speedUpCost} UNI to speed up ${data.jobId}`);

            job.workLeft = 0;
            job.ready = true;

            io.emit('job_updated', { jobId: data.jobId, data: job });
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            broadcastEffectiveTGV();
            syncPlayerAndSave(socket.id);
        } else {
            socket.emit('oreMessage', `Insufficient funds! You need ${config.speedUpCost} UNI.`);
        }
    });

    socket.on('collect_job', (data) => {
        const player = players[socket.id];
        const job = activeJobs.get(data.jobId);
        if (!player || !job || !job.ready) return;

        const config = getJobConfig(data.jobId, job.recipe);
        if (!config) return;

        job.active = false;
        job.ready = false;
        job.workLeft = config.maxWork;

        io.emit('job_updated', { jobId: data.jobId, data: job });
        socket.emit('receive_job_loot', { recipe: job.recipe, tableType: data.jobId.split('_')[0] });
        job.recipe = null;
    });

    socket.on('requestCastLine', (data) => {
        const { tx, ty } = data;
        const player = players[socket.id];
        if (!player) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        const safeCount = Math.max(1, globalFishCount);
        const multiplier = Math.sqrt(10000 / safeCount);
        const scarcityMod = Math.min(30.0, multiplier);
        const waitTime = (2 + Math.random() * 3) * scarcityMod * 1000; 

        fishingStates.set(socket.id, {
            startTime: Date.now(),
            waitTime: waitTime,
            active: true
        });

        socket.emit('fishingCastConfirmed', { waitTime });
    });

    socket.on('requestReelIn', () => {
        const state = fishingStates.get(socket.id);
        const player = players[socket.id];
        if (!state || !state.active || !player) return;

        const elapsed = Date.now() - state.startTime;
        if (elapsed < state.waitTime) {
            console.log(`🚨 Hack blocked: ${player.wallet} tried to bypass the fishing timer.`);
            return;
        }

        const caughtFishTemplate = getRandomServerFish();
        const fishItem = createItem(caughtFishTemplate); // 👈 Leverages main createItem factory

        if (giveItemToServerInventory(player, fishItem)) {
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
        if (!chestDb[chestId]) {
            const pick = createItem(ITEM_TYPES.PICKAXE);
            const tomato = createItem(ITEM_TYPES.TOMATO_ITEM);
            tomato.count = 8; // Give them a full starter stack!
            chestDb[chestId] = [pick, tomato];
        }
        socket.emit('chestData', { chestId, items: chestDb[chestId] });
    });

    socket.on('updateChest', (data) => {
        if (data.items && data.items.length > 8) {
            data.items = data.items.slice(0, 8);
        }
        chestDb[data.chestId] = data.items;
        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));
        socket.broadcast.emit('chestUpdated', data);
    });

    socket.on('requestStore', (storeId) => {
        if (!storeDb[storeId]) {
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
        io.emit('storeUpdated', { storeId, data: storeDb[storeId] }); 
    });

    socket.on('buyListing', (data) => {
        const { storeId, listingId, buyerWallet, paymentItem, isHobbit } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);
        
        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            
            if (!isHobbit) {
                if (!store.storage[buyerWallet]) store.storage[buyerWallet] = [];
                store.storage[buyerWallet].push(listing.offeredItem);
            }
            
            if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
            store.storage[listing.seller].push(paymentItem);

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
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer].push(listing.offeredItem);

                if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
                store.storage[listing.seller].push(listing.counterOffer.item);

                store.listings.splice(listIdx, 1);
            } else {
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
            if (!store.storage[wallet]) store.storage[wallet] = [];
            store.storage[wallet].push(listing.offeredItem);
            
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
            socket.emit('storageClaimed', { items: store.storage[wallet] });
            store.storage[wallet] = []; 
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

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
                speed: 35,
                hp: 30,
                maxHp: 30,
                energy: 100,
                goal: 'wander',
                state: 'idle',
                dir: 'East',
                moveTimer: Math.random() * 3,
                targetX: undefined,
                targetY: undefined,
                eggTimer: 15 + Math.random() * 20,  
                poopTimer: 10 + Math.random() * 20, 
                
                ranchBounds: { 
                    minX: (gx + 1) * 16, 
                    maxX: (gx + w - 2) * 16, 
                    minY: (gy - h + 2) * 16, 
                    maxY: (gy - 1) * 16 
                }
            });
        }
    });

    socket.on('requestPlantSeed', (data) => {
        const { tx, ty, index } = data;
        const player = players[socket.id];
        if (!player) return;

        let item = player.equipment?.mainHand;
        let isEquipped = true;

        if (!item || !(item.seedType.includes("_seed") || item.seedType === "potato_item")) {
            item = player.inventory[index];
            isEquipped = false;
        }

        if (!item || !(item.seedType.includes("_seed") || item.seedType === "potato_item")) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        const plantKey = `${tx}_${ty}`;
        if (serverPlants.has(plantKey)) return; 

        const plantType = item.seedType.replace("_seed", "").replace("_item", "");
        
        serverPlants.set(plantKey, {
            gx: tx, gy: ty,
            type: plantType,
            growth: 0,
            timestamp: Date.now()
        });

        if (isEquipped) {
            player.equipment.mainHand.count--;
            if (player.equipment.mainHand.count <= 0) {
                player.equipment.mainHand = null;
            }
            socket.emit('updateEquipment', player.equipment);
        } else {
            item.count--;
            if (item.count <= 0) {
                player.inventory.splice(index, 1);
            }
            socket.emit('updateInventory', player.inventory);
        }

        syncPlayerAndSave(socket.id);

        io.emit('plantCreated', { gx: tx, gy: ty, type: plantType, growth: 0 });
    });

    socket.on('registerWildPlant', (data) => {
        const { gx, gy, type, growth } = data;
        const plantKey = `${gx}_${gy}`;
        
        serverPlants.set(plantKey, {
            gx: gx, gy: gy,
            type: type,
            growth: growth || 0,
            timestamp: Date.now()
        });
    });

    socket.on('requestHarvest', (data) => {
        const { tx, ty } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const plantKey = `${tx}_${ty}`;
        const plant = serverPlants.get(plantKey);
        if (!plant) return; 

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        if (player.inventory.length >= 10) {
            socket.emit('inventoryFull');
            return;
        }

        const def = SERVER_PLANT_DEFS[plant.type];
        const elapsedSeconds = plant.timestamp ? (Date.now() - plant.timestamp) / 1000 : 0;
        
        let startGrowth = 0;
        if (plant.growth !== undefined && plant.growth !== null) {
            startGrowth = parseFloat(plant.growth);
        }
        if (isNaN(startGrowth)) {
            startGrowth = 0;
        }
        
        let gRate = 0.4;
        if (plant.growthRate !== undefined && plant.growthRate !== null) {
            gRate = parseFloat(plant.growthRate);
        }
        if (isNaN(gRate)) {
            gRate = def?.growthRate || 0.4;
        }

        const currentGrowth = startGrowth + (gRate * 0.1 * elapsedSeconds);
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

            const itemTypeName = yieldMap[plant.type] || 'PLANT_MATTER';
            const cropTemplate = ITEM_TYPES[itemTypeName]; // 👈 Single source lookup
            
            if (cropTemplate) {
                giveItemToServerInventory(player, createItem(cropTemplate));
            }

            const farmCrops = ['turnip', 'tomato', 'eggplant', 'strawberry', 'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato', 'wheat'];
            if (!farmCrops.includes(plant.type)) {
                const seedConstName = `${plant.type.toUpperCase()}_SEED`;
                const seedTemplate = ITEM_TYPES[seedConstName];
                if (seedTemplate) {
                    const seedCount = Math.floor(Math.random() * 2) + 1; 
                    const seedItem = createItem(seedTemplate);
                    seedItem.count = seedCount;
                    giveItemToServerInventory(player, seedItem);
                }
            }

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
            console.log(`🍂 Early Harvest! ${player.wallet} pulled immature ${plant.type} at [${tx}, ${ty}]`);
            
            const template = ITEM_TYPES.PLANT_MATTER;
            if (template) {
                giveItemToServerInventory(player, createItem(template));
            }

            serverPlants.delete(plantKey);
            io.emit('plantRemoved', { gx: tx, gy: ty }); 
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
    });

    socket.on('requestChunkPlants', (data) => {
        const { cx, cy } = data;
        const chunkKey = `${cx}_${cy}`;

        if (!chunkPlantsGenerated.has(chunkKey)) {
            chunkPlantsGenerated.add(chunkKey);
            generateServerFloraForChunk(cx, cy);
        }

        const chunkPlants = [];
        for (let [key, plant] of serverPlants) {
            const pCX = Math.floor(plant.gx / 100);
            const pCY = Math.floor(plant.gy / 100);
            if (pCX === cx && pCY === cy) {
                const elapsed = (Date.now() - plant.timestamp) / 1000;
                
                let gRate = 0.4;
                if (plant.growthRate !== undefined && plant.growthRate !== null) {
                    gRate = parseFloat(plant.growthRate);
                }
                if (isNaN(gRate)) {
                    gRate = SERVER_PLANT_DEFS[plant.type]?.growthRate || 0.4;
                }

                let startGrowth = 0;
                if (plant.growth !== undefined && plant.growth !== null) {
                    startGrowth = parseFloat(plant.growth);
                }
                if (isNaN(startGrowth)) {
                    startGrowth = 0;
                }

                const currentGrowth = Math.min(100, startGrowth + (gRate * 0.1 * elapsed));
                
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

    socket.emit('initDoorStates', doorDb);

    socket.on('requestDoorState', (data) => {
        const { gx, gy } = data;
        const key = `${gx}_${gy}`;
        const door = doorDb[key] || { locked: true };
        socket.emit('doorState', { gx, gy, locked: door.locked });
    });

    socket.on('setDoorLock', (data) => {
        const { gx, gy, locked } = data;
        const key = `${gx}_${gy}`;
        doorDb[key] = { locked };
        saveDoors();
        io.emit('doorStateUpdated', { gx, gy, locked });
    });

    socket.on('movement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].dir = data.dir;
            players[socket.id].animFrame = data.animFrame;
            players[socket.id].isMoving = data.isMoving;
            players[socket.id].isWindingUp = data.isWindingUp;
            players[socket.id].isLunge = data.isLunge; 
            players[socket.id].currentTileID = data.currentTileID;
            players[socket.id].pet = data.pet;
        }
    });

    socket.on('updateStats', (data) => {
        const p = players[socket.id];
        if (!p) return;

        if (data.inventory) delete data.inventory;

        Object.assign(p, data);
        
        if (socket.wallet) {
            userDb[socket.wallet] = {
                ...userDb[socket.wallet], 
                ...data, 
                id: undefined,
                target: null
            };

            fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
        }
    });

    socket.on('requestWithdrawal', async (reqData) => {
        const player = players[socket.id];
        
        const amount = typeof reqData === 'object' ? reqData.amount : reqData;
        const targetAddress = (typeof reqData === 'object' && reqData.targetAddress) ? reqData.targetAddress : socket.wallet;
        
        console.log(`🏦 Withdrawal Request from ${socket.wallet} to Web3 Address ${targetAddress}`);

        if (!player || player.inGameUni < amount || !socket.wallet) {
            console.error("❌ Invalid Withdrawal Request.");
            return;
        }

        player.inGameUni -= amount;
        globalDebt = Math.max(0, globalDebt - amount);
        saveDebt();
        syncPlayerAndSave(socket.id);
        
        socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        broadcastEffectiveTGV(); 

        const nonce = Math.floor(Math.random() * 1000000000);
        try {
            const voucher = await createVoucher(targetAddress, amount, nonce);
            
            socket.emit('receiveWithdrawalVoucher', voucher);
            console.log(`📜 Withdrawal Voucher generated for ${targetAddress}`);
        } catch (err) {
            console.error("Voucher failed!", err);
            player.inGameUni += amount;
            globalDebt += amount;
            saveDebt();
            syncPlayerAndSave(socket.id);
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            broadcastEffectiveTGV(); 
        }
    });

    socket.on('requestWithdrawalRefund', (amountStr) => {
        const player = players[socket.id];
        const amount = parseFloat(amountStr); 
        
        if (player && amount > 0) {
            player.inGameUni += amount;
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            console.log(`♻️ Refunded ${amount.toFixed(8)} UNI to ${socket.wallet}`);
        }

        broadcastEffectiveTGV();
        syncPlayerAndSave(socket.id);
    });

    socket.on('requestActivityLog', () => {
        socket.emit('activityData', activityLog);
    });

    socket.on('requestPickup', (itemData) => {
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - itemData.tx) + Math.abs(py - itemData.ty) > 5) return;

        const seedTypeToKeyMap = {};
        for (let key in ITEM_TYPES) { // 👈 Single source loop
            seedTypeToKeyMap[ITEM_TYPES[key].seedType] = key;
        }
        
        const templateKey = seedTypeToKeyMap[itemData.seedType];
        const template = ITEM_TYPES[templateKey];

        if (!template) {
            console.log(`❌ Secure template not found for: ${itemData.seedType}`);
            return;
        }

        const newItem = createItem(template); 
        
        const key = `${itemData.tx}_${itemData.ty}`;
        if (serverBacteria.has(key)) {
            const traits = serverBacteria.get(key);
            const hTraits = traits & 0xFF; 
            if (hTraits > 0) {
                newItem.health = hTraits; 
            }
        }

        if (template.isKey) {
            newItem.houseId = itemData.houseId;
            newItem.name = `Key to House #${itemData.houseId}`;
        }

        const success = giveItemToServerInventory(player, newItem);
        
        if (success) {
            io.emit('syncTile', { gx: itemData.tx, gy: itemData.ty, traits: 0 });
            serverBacteria.delete(`${itemData.tx}_${itemData.ty}`);

            syncPlayerAndSave(socket.id);
            socket.emit('updateInventory', player.inventory);
        } else {
            socket.emit('inventoryFull');
        }
    });

    socket.on('requestEquip', (data) => {
        const { index, currentEnergy } = data; 
        const player = players[socket.id];
        if (!player || !player.inventory) return;

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

        player.ad = CONFIG.HERO_ATTACK;
        if (player.equipment.mainHand && player.equipment.mainHand.isWeapon) {
            player.ad += (player.equipment.mainHand.ad || 0);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('updateEquipment', player.equipment);
        socket.emit('restoreHero', player); 
    });

    socket.on('requestUnequip', (data) => {
        const { currentEnergy } = data || {}; 
        const player = players[socket.id];
        if (!player || !player.inventory || !player.equipment || !player.equipment.mainHand) return;

        if (player.inventory.length >= 10) {
            socket.emit('inventoryFull');
            return;
        }

        if (currentEnergy !== undefined) {
            player.energy = parseFloat(currentEnergy) || 100;
        }

        player.inventory.push(player.equipment.mainHand);
        player.equipment.mainHand = null;

        player.ad = CONFIG.HERO_ATTACK;

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('updateEquipment', player.equipment);
        socket.emit('restoreHero', player); 
    });

    socket.on('requestDrop', (data) => {
        const { index, amount, tx, ty } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const item = player.inventory[index];
        if (!item || item.count < amount) return;

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
            const hVal = item.health !== undefined ? item.health : (item.baseHealth || 100);
            const vVal = item.virulence !== undefined ? item.virulence : (item.baseVirulence || 0);
            packedTraits = ((Math.floor(hVal) & 0xFF) | ((Math.floor(vVal) & 0xFF) << 8) | ((2 & 0x0F) << 16) | ((typeId & 0xFF) << 20)) >>> 0;
        }

        io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });
        serverBacteria.set(`${tx}_${ty}`, packedTraits);

        item.count -= amount;
        if (item.count <= 0) {
            player.inventory.splice(index, 1);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
    });

    socket.on('requestChestTransfer', (data) => {
        const { chestId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

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

            if (chestItems.length >= 8) {
                socket.emit('oreMessage', "This chest is full! Maximum 8 slots.");
                return;
            }

            player.inventory.splice(index, 1);

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

            const success = giveItemToServerInventory(player, item);
            if (!success) {
                chestItems.push(item); 
                socket.emit('inventoryFull');
                return;
            }
        }

        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));
        syncPlayerAndSave(socket.id);

        socket.emit('updateInventory', player.inventory);
        io.emit('chestUpdated', { chestId, items: chestItems });
    });

    socket.on('requestCellarTransfer', (data) => {
        const { cellarId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (!cellarDb[cellarId]) cellarDb[cellarId] = [];
        const cellarItems = cellarDb[cellarId];

        if (direction === 'to_cellar') {
            const item = player.inventory[index];
            const VALID_FOOD_TYPES = [
                "fish", "cooked_fish", "raw_chicken", "egg",
                "turnip_item", "tomato_item", "eggplant_item", "strawberry_item", 
                "pumpkin_item", "watermelon_item", "corn_item", "pineapple_item", 
                "potato_item", "wheat_item",
                "fish_trout", "fish_panfish", "fish_mackerel", "fish_muskellunge", 
                "fish_trevally", "fish_squid", "fish_octopus", "fish_eel", "fish_angler"
            ];
            if (!item || !VALID_FOOD_TYPES.includes(item.seedType)) return;

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

    socket.on('requestHayTransfer', (data) => {
        const { hayStorageId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (!hayDb[hayStorageId]) hayDb[hayStorageId] = [];
        const hayItems = hayDb[hayStorageId];

        if (direction === 'to_storage') {
            const item = player.inventory[index];
            if (!item || (item.seedType !== 'hay' && item.seedType !== 'plant_matter')) return;

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

    socket.on('sacrificeItem', (data) => {
        const player = players[socket.id];
        if (!player) return;

        const now = Date.now();
        if (player.lastSacrifice && now - player.lastSacrifice < 1000) {
            console.log(`🚨 SPAM BLOCKED: ${socket.wallet} is sending packets too fast.`);
            return;
        }
        player.lastSacrifice = now;

        const isValidSeed = POINT_VALUES[data.itemType];
        if (!isValidSeed) return;

        const requestedCount = Math.min(64, Math.max(1, data.count || 1)); 

        const effectiveTGV = Math.max(0.00000001, currentTVL - globalDebt);
        const pointsPerSeed = effectiveTGV / 640000;
        const totalPoints = pointsPerSeed * requestedCount; 

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

    socket.on('pvpAttack', (data) => {
        const victim = players[data.targetId];
        const attacker = players[socket.id];

        if (victim && attacker && victim.hp > 0) {
            const victimArmor = Math.max(1, victim.armor || 1); 
            const armorReduction = Math.pow(0.5, Math.log10(victimArmor));
            const finalDamage = Math.max(1, Math.floor(attacker.ad * armorReduction));

            if (victim.isInvincible) {
                console.log(`👼 ${victim.id} is Invincible! Damage ignored.`);
                return; 
            }

            if (victim.hasDivineBubble) {
                console.log(`✨ DIVINE BUBBLE POPPED on ${victim.id}! Blocked ${finalDamage} damage.`);
                victim.hasDivineBubble = false;
                
                io.emit('playerHit', {
                    victimId: victim.id,
                    newHp: victim.hp,
                    newShield: victim.shield,
                    bubblePopped: true, 
                    attackerId: attacker.id
                });
                return; 
            }

            if (victim.shield > 0) {
                const damageToShield = Math.min(victim.shield, finalDamage);
                victim.shield -= damageToShield;
                finalDamage -= damageToShield; 
            }

            victim.hp -= finalDamage;
            
            io.emit('playerHit', {
                victimId: victim.id,
                newHp: victim.hp,
                newShield: victim.shield, 
                attackerId: attacker.id
            });

            if (victim.hp <= 0) {
                console.log(`DEBUG: Victim ${victim.id} had ${victim.xp} XP on server.`);

                victim.hp = 0;
                
                const xpGain = (victim.xp || 0) * 0.30;
                attacker.xp = (attacker.xp || 0) + xpGain;

                if (victim.wallet) {
                    userDb[victim.wallet].hp = 0;
                    userDb[victim.wallet].xp = victim.xp; 
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

    socket.on('abilityAoE', (data) => {
        const attacker = players[socket.id];
        if (!attacker) return;

        for (let vid in players) {
            if (vid === socket.id) continue; 
            
            const victim = players[vid];
            const dx = victim.x - data.x;
            const dy = victim.y - data.y;
            const distSq = (dx * dx) + (dy * dy);
            const radiusSq = data.radius * data.radius;

            if (distSq <= radiusSq && victim.hp > 0) {
                if (data.type === 'divineBubbleExplosion') {
                    const dist = Math.sqrt(distSq) || 1; 
                    const pushPower = 32; 
                    victim.x += (dx / dist) * pushPower;
                    victim.y += (dy / dist) * pushPower;
                    
                    io.emit('forcedMovement', { id: victim.id, x: victim.x, y: victim.y });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                if (data.type === 'radiantNovaExplosion') {
                    io.emit('playerCC', { victimId: victim.id, ccType: 'slow', duration: 2.0 });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                if (data.type === 'ringOfPenance') {
                    const IMPRISON_MASK = 1 | 4 | 8; 
                    io.emit('playerCC', { 
                        victimId: victim.id, 
                        ccMask: IMPRISON_MASK, 
                        duration: 1.5 
                    });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                if (data.type === 'consecrationTick') {
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }

                if (data.type === 'zenithGuardianSpawn') {
                    const BIND_MASK = 1 | 2; 
                    io.emit('playerCC', { 
                        victimId: victim.id, 
                        ccMask: BIND_MASK, 
                        duration: 1.5 
                    });
                    applyMagicSpellDamage(attacker, victim, data.damage);
                }
            }
        }
    });

    socket.on('healPlayer', (data) => {
        const target = players[data.targetId];
        if (target && target.hp > 0) {
            target.hp = Math.min(target.maxHp || 100, target.hp + data.amount);
            io.emit('playerHealed', { targetId: target.id, newHp: target.hp, amount: data.amount });
        }
    });

    socket.on('castBuffOnAlly', (data) => {
        io.to(data.targetId).emit('receiveAllyBuff', data);
    });

    socket.on('fireProjectile', (data) => {
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

    socket.on('fireHomingProjectile', (data) => {
        const attacker = players[socket.id];
        const target = players[data.targetId];
        if (!attacker || !target) return;

        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id,
            type: data.type,
            targetId: data.targetId, 
            x: attacker.x + 8,
            y: attacker.y + 8,
            speed: 350, 
            life: 2.0,  
            damage: data.damage,
            skillIndex: data.skillIndex
        });
    });

    socket.on('syncTile', (data) => {
        socket.broadcast.emit('syncTile', data);

        if (data.traits === 0) {
            serverBacteria.delete(`${data.gx}_${data.gy}`);
        } else {
            serverBacteria.set(`${data.gx}_${data.gy}`, data.traits);
        }
    });

    socket.on('dropItem', (data) => {
        socket.broadcast.emit('remoteDrop', data);
    });

    socket.on('requestOre', (oreId) => {
        if (!oreDb[oreId]) {
            oreDb[oreId] = {
                workLeft: 3600, 
                maxWork: 3600,
                lastSpeedUp: 0,
                claimed: false
            };
        }
        socket.emit('oreData', { oreId, data: oreDb[oreId] });
    });

    socket.on('mineOreStrike', (data) => {
        const { oreId } = data;
        
        if (!oreDb[oreId]) {
            io.emit('oreUpdated', { oreId, data: oreDb[oreId] });
            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
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

    socket.on('speedUpOre', (data) => {
        const { oreId } = data;
        const player = players[socket.id];
        const ore = oreDb[oreId];
        
        if (!ore || !player) return;

        const SPEEDUP_COST = 1.22; 
        const COOLDOWN_MS = 24 * 60 * 60 * 1000; 
        const now = Date.now();

        if (now - ore.lastSpeedUp < COOLDOWN_MS) {
            socket.emit('oreMessage', "The blast charges are still cooling down. Try again tomorrow!");
            return;
        }

        if (player.inGameUni >= SPEEDUP_COST) {
            player.inGameUni -= SPEEDUP_COST; 
            ore.workLeft = 0;                 
            ore.lastSpeedUp = now; 
            
            globalDebt = Math.max(0, globalDebt - SPEEDUP_COST); 
            saveDebt();
            logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${SPEEDUP_COST} UNI to blast an Iron Vein`);
            
            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
            io.emit('oreUpdated', { oreId, data: ore });
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni }); 
            
            console.log(`🧨 ${socket.wallet} paid ${SPEEDUP_COST} UNI to blast open ${oreId}!`);
        } else {
            socket.emit('oreMessage', `Insufficient funds! You need ${SPEEDUP_COST} UNI.`);
        }
            
        broadcastEffectiveTGV();
        syncPlayerAndSave(socket.id);
    });

    socket.on('refundWithdrawal', (amountStr) => {
        const player = players[socket.id];
        const amount = parseFloat(amountStr); 
        
        if (player && amount > 0) {
            player.inGameUni += amount;
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            console.log(`♻️ Refunded ${amount.toFixed(8)} UNI to ${socket.wallet}`);
        }

        broadcastEffectiveTGV();
        syncPlayerAndSave(socket.id);
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

    socket.on('identifyWallet', (data) => {
        const rawAddress = (typeof data === 'object') ? data.address : data;
        if (!rawAddress) return;
        const address = (rawAddress.startsWith('0x')) ? ethers.getAddress(rawAddress) : rawAddress;
        socket.wallet = address;

        if (userDb[address]) {
            console.log(`💾 Restore: ${address} (${userDb[address].inventory?.length || 0} items)`);
            
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

    socket.on('createCharacter', (data) => {
        const { wallet, charClass, skills } = data;
        const address = (wallet.startsWith('0x')) ? ethers.getAddress(wallet) : wallet;

        players[socket.id].wallet = address;
        players[socket.id].charClass = charClass;
        players[socket.id].skills = skills;
        
        if (!userDb[address] || !userDb[address].inventory) {
            players[socket.id].inventory = [];
        } else {
            players[socket.id].inventory = userDb[address].inventory;
        }
        
        syncPlayerAndSave(socket.id);
        socket.emit('restoreHero', players[socket.id]);
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (!p) return;

        if (socket.wallet) {
            syncPlayerAndSave(socket.id);
        }

        if (p.wallet && p.wallet.startsWith('Guest_')) {
            const abandonedUNI = p.inGameUni || 0;
            if (abandonedUNI > 0) {
                globalDebt = Math.max(0, globalDebt - abandonedUNI);
                saveDebt();
                broadcastEffectiveTGV(); 
                console.log(`🧹 Guest ${p.wallet} logged off. ${abandonedUNI.toFixed(8)} UNI recycled to TGV.`);
            }
        }

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

    userDb[p.wallet] = {
        ...p,
        id: undefined,  
        target: null    
    };

    fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
}

function broadcastEffectiveTGV() {
    const effectiveTGV = Math.max(0, currentTVL - globalDebt);
    io.emit('tgvUpdate', { tgv: effectiveTGV });
}

setInterval(() => {
    const delta = 0.05; 

    for (let vid in players) {
        const p = players[vid];
        if (p.resonanceTimer > 0) {
            p.resonanceTimer -= delta;
            if (p.resonanceTimer <= 0) {
                io.emit('playerCC', { victimId: vid, ccType: 'resonanceFade' });
            }
        }
    }

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
            const packedTraits = (1 & 0xFF) | ((16 & 0xFF) << 20); 
            io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });
        }

        if (a.poopTimer <= 0) {
            a.poopTimer = 20 + Math.random() * 30;
            const packedTraits = (3 & 0xFF) | ((12 & 0xFF) << 8) | ((4 & 0xFF) << 20); 
            io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });
        }

        if (a.energy < 50 && a.goal !== 'eating') {
            let foundFood = false;

            for (let ox = -5; ox <= 5; ox++) {
                for (let oy = -5; oy <= 5; oy++) {
                    const checkKey = `${tx + ox}_${ty + oy}`;
                    
                    if (serverBacteria.has(checkKey)) {
                        const traits = serverBacteria.get(checkKey);
                        const typeID = (traits >> 20) & 0xFF;
                        
                        if (typeID === 17) { 
                            a.targetX = (tx + ox) * 16 + 8;
                            a.targetY = (ty + oy) * 16 + 8;
                            a.goal = 'eating';
                            a.foodType = 'hay';
                            a.foodKey = checkKey;
                            foundFood = true;
                            break;
                        }
                    }
                }
                if (foundFood) break;
            }

            if (!foundFood) {
                let nearestPlant = null;
                let nearestDist = Infinity;

                for (let [key, plant] of serverPlants) {
                    const pCX = Math.floor(plant.gx / 100);
                    const pCY = Math.floor(plant.gy / 100);
                    if (pCX !== cx || pCY !== cy) continue;

                    const dx = Math.abs(plant.gx - tx);
                    const dy = Math.abs(plant.gy - ty);
                    if (dx > 8 || dy > 8) continue;

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
                    foundFood = true;
                }
            }
        }

        a.moveTimer -= delta;
        if (a.moveTimer <= 0 && a.goal !== 'eating') {
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
            a.goal = 'wander';
        }

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
                            
                            let health = traits & 0xFF;
                            health = Math.max(0, health - 10); 

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
                            console.log(` 🌾 Chicken ate Hay at [${hx}, ${hy}]. Health remaining: ${health}`);
                        }
                    } 
                    else if (a.foodType === 'crop') {
                        if (serverPlants.has(a.foodKey)) {
                            const plant = serverPlants.get(a.foodKey);
                            serverPlants.delete(a.foodKey);
                            io.emit('plantRemoved', { gx: plant.gx, gy: plant.gy });
                            a.energy = 100; 
                            console.log(`🌽 Chicken ate crop at [${a.foodKey}]`);
                        }
                    }
                    a.goal = 'wander';
                }
            }
        }
    });

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

    // 🏰 UPDATE ACTIVE VILLAGE CAPTURE STATE MACHINES
    for (let [key, village] of serverVillages) {
        if (village.owner === null) continue;

        const counts = getVillagePlayerCounts(village.x, village.y, village.owner);

        if (village.capturer) {
            if (counts.enemies > counts.allies) {
                village.captureProgress = Math.min(100, village.captureProgress + delta * 5);
                if (village.captureProgress >= 100) {
                    village.owner = village.capturer;
                    village.captureProgress = 0;
                    village.capturer = null;
                    io.emit('villageOwnerUpdated', { wellX: village.x, wellY: village.y, owner: village.owner, progress: 0 });
                    io.emit('chatMessage', { sender: "SYSTEM", message: `🏘️ Village at [${village.x}, ${village.y}] has been captured by ${village.owner}!` });
                } else {
                    io.emit('villageCaptureProgress', { wellX: village.x, wellY: village.y, progress: village.captureProgress, capturer: village.capturer });
                }
            } else if (counts.allies > counts.enemies) {
                village.captureProgress = Math.max(0, village.captureProgress - delta * 5);
                if (village.captureProgress === 0) {
                    village.capturer = null; // Secured!
                    io.emit('villageOwnerUpdated', { wellX: village.x, wellY: village.y, owner: village.owner, progress: 0 });
                    io.emit('chatMessage', { sender: "SYSTEM", message: `🏘️ Village at [${village.x}, ${village.y}] has been secured by the defenders!` });
                } else {
                    io.emit('villageCaptureProgress', { wellX: village.x, wellY: village.y, progress: village.captureProgress, capturer: village.owner });
                }
            } else {
                io.emit('villageCaptureProgress', { wellX: village.x, wellY: village.y, progress: village.captureProgress, contested: true });
            }
        }
    }

    io.emit('position', { 
        playerbase: players,
        projectiles: projectiles,
        animals: serverAnimals 
    });
}, 50);

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
    console.log(`
    🎮 MOBA Ecosystem Server Active!
    🔗 URL: http://localhost:${PORT}
    🛠️  Press Ctrl+C to stop
    `);
});