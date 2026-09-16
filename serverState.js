// serverState.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './src/config.js';
import { ITEM_TYPES, createItem } from './src/items.js';
import { PLANT_DEFS } from './src/plantDefs.js';
import { savePlantChunk } from './plantStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. CONSTANTS & CONFIGURATIONS
// ==========================================
export const EXTRACTION_DELAY_MS = 2 * 60 * 60 * 1000; // 2-Hour Processing Window
export const HOBBIT_EXPORT_DELAY = 2 * 60 * 60 * 1000; // 2-Hour Processing Window

export const POINT_VALUES = {
    "grass_seed": 1, "rose_seed": 1, "violet_seed": 1, "sunflower_seed": 1,
    "turnip_seed": 1, "tomato_seed": 1, "eggplant_seed": 1, "strawberry_seed": 1,
    "pumpkin_seed": 1, "watermelon_seed": 1, "corn_seed": 1, "pineapple_seed": 1,
    "potato_seed": 1, "wheat_seed": 1
};

export const BACTERIA_TYPES = {
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

    "raw_chicken": 50, 
    "weapon_dagger": 60,
    "key": 61
};

export const WORKSTATION_CONFIGS = {
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

export const HOBBIT_FIRST_NAMES = [
    "Bilbo", "Frodo", "Samwise", "Merry", "Pippin", "Bango", "Bungo", "Drogo", 
    "Hamfast", "Longo", "Olo", "Paladin", "Rufus", "Sancho", "Tobold", "Wilibald"
];

export const HOBBIT_LAST_NAMES = [
    "Baggins", "Gamgee", "Brandybuck", "Took", "Gardner", "Greenhand", "Grubb", 
    "Chubb", "Proudfoot", "Bolger", "Boffin", "Sandyman", "Cotton", "Twofoot", "Underhill", "Hornblower"
];

export const HOBBIT_FOOD_VALUES = { 
    "cooked_fish": 60, "fish_muskellunge": 100, "fish_trevally": 80, 
    "fish_angler": 80, "fish_octopus": 60, "fish_squid": 50, 
    "fish_eel": 45, "fish_mackerel": 35, "fish_trout": 25, 
    "fish": 20, "fish_panfish": 15, "pineapple_item": 50,
    "eggplant_item": 40, "tomato_item": 35, "pumpkin_item": 30,
    "watermelon_item": 30, "potato_item": 25, "corn_item": 25,
    "turnip_item": 20, "egg": 20, "strawberry_item": 15, 
    "wheat_item": 10, "raw_chicken": 15
};

const YIELD_MAP = {
    'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM', 'eggplant': 'EGGPLANT_ITEM', 
    'strawberry': 'STRAWBERRY_ITEM', 'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
    'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM', 'potato': 'POTATO_ITEM', 
    'wheat': 'WHEAT_ITEM', 'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
    'violet': 'VIOLET_ITEM', 'sunflower': 'SUNFLOWER_ITEM'
};

// ==========================================
// 2. IN-MEMORY LIVE STATE
// ==========================================
export const worldSeed = Math.floor(Math.random() * 999999);
export const players = {};
export let serverHobbits = [];
export let serverAnimals = [];
export const serverPlants = new Map();
export const serverBacteria = new Map();
export const serverVillages = new Map();
export const registeredServerRanches = new Set();
export const fishingStates = new Map();
export const chunkPlantsGenerated = new Set();
export const activeJobs = new Map();
export const activeOverseers = new Map();
export const inputBuffers = new Map();
export const cellStates = new Map();
export const projectiles = [];
export const dirtyPlantChunks = new Set();
export let globalFishCount = 100;

// ==========================================
// 3. PERSISTENCE & JSON DATABASE I/O
// ==========================================
const PERSISTENCE_FILE = path.join(__dirname, 'persistence.json');
const VILLAGES_FILE = path.join(__dirname, 'villages.json');
const CHICKENS_FILE = path.join(__dirname, 'chickens.json');
const HOBBITS_FILE = path.join(__dirname, 'hobbits.json');
const DOORS_FILE = path.join(__dirname, 'doors.json');
const ACTIVITY_FILE = path.join(__dirname, 'activity.json');
const DEBT_FILE = path.join(__dirname, 'debt.json');
const ORES_FILE = path.join(__dirname, 'ores.json');
const AUTH_FILE = path.join(__dirname, 'auth.json');

export let userDb = {};
if (fs.existsSync(PERSISTENCE_FILE)) {
    try {
        userDb = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, 'utf8'));
        console.log(`✅ Loaded ${Object.keys(userDb).length} player profiles.`);
    } catch (err) {
        console.error("Database load error:", err);
    }
}

export let chestDb = {};
export let storeDb = {};
export let cellarDb = {};
export let hayDb = {};
export let oreDb = {};
export let doorDb = {};
export let authDb = {};
export let activityLog = [];
export let globalDebt = 0;

if (fs.existsSync(DOORS_FILE)) {
    try { doorDb = JSON.parse(fs.readFileSync(DOORS_FILE, 'utf8')); } catch (err) {}
}

if (fs.existsSync(AUTH_FILE)) {
    try { authDb = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch (err) {}
}

if (fs.existsSync(ORES_FILE)) {
    try { oreDb = JSON.parse(fs.readFileSync(ORES_FILE, 'utf8')); } catch (err) {}
}

if (fs.existsSync(ACTIVITY_FILE)) {
    try { activityLog = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8')); } catch (err) {}
}

if (fs.existsSync(DEBT_FILE)) {
    try {
        const dData = JSON.parse(fs.readFileSync(DEBT_FILE, 'utf8'));
        globalDebt = parseFloat(dData.amount) || 0.0;
    } catch (err) {
        globalDebt = 0.0;
    }
}

// Cleanup transient cache files on boot
if (fs.existsSync(path.join(__dirname, 'chests.json'))) fs.unlinkSync(path.join(__dirname, 'chests.json'));
if (fs.existsSync(path.join(__dirname, 'stores.json'))) {
    try { fs.unlinkSync(path.join(__dirname, 'stores.json')); console.log("🗑️ Stores file deleted."); } catch (err) {}
}
if (fs.existsSync(path.join(__dirname, 'cellars.json'))) { try { fs.unlinkSync(path.join(__dirname, 'cellars.json')); } catch (err) {} }
if (fs.existsSync(path.join(__dirname, 'hay.json'))) { try { fs.unlinkSync(path.join(__dirname, 'hay.json')); console.log("🗑️ Hay Storage file deleted."); } catch (err) {} }

// Load villages
if (fs.existsSync(VILLAGES_FILE)) {
    try {
        const rawData = JSON.parse(fs.readFileSync(VILLAGES_FILE, 'utf8'));
        serverVillages.clear();
        Object.entries(rawData).forEach(([key, value]) => {
            serverVillages.set(key, value);
        });
        console.log(`✅ Loaded ${serverVillages.size} registered villages from database.`);
    } catch (err) {
        console.error("❌ Failed to load villages database:", err);
    }
}

// Load chickens
if (fs.existsSync(CHICKENS_FILE)) {
    try {
        serverAnimals = JSON.parse(fs.readFileSync(CHICKENS_FILE, 'utf8'));
        console.log(`✅ Loaded ${serverAnimals.length} chickens from ${CHICKENS_FILE}`);
    } catch (err) {
        console.error("❌ Failed to load chickens database:", err);
        serverAnimals = [];
    }
}

// Load hobbits
if (fs.existsSync(HOBBITS_FILE)) {
    try {
        serverHobbits = JSON.parse(fs.readFileSync(HOBBITS_FILE, 'utf8'));
        console.log(`✅ Loaded ${serverHobbits.length} hobbits from ${HOBBITS_FILE}`);
    } catch (err) {
        console.error("❌ Failed to load hobbits database:", err);
        serverHobbits = [];
    }
}

// Persistence Save Helpers
export function saveVillages() {
    const obj = Object.fromEntries(serverVillages);
    fs.writeFileSync(VILLAGES_FILE, JSON.stringify(obj, null, 2));
}

export function saveChickens() {
    try {
        const now = Date.now();
        serverAnimals.forEach(c => {
            if (!c.lastSaved) c.lastSaved = now;
        });
        fs.writeFileSync(CHICKENS_FILE, JSON.stringify(serverAnimals, null, 2));
    } catch (err) {
        console.error("❌ Failed to save chickens database:", err);
    }
}

export function saveHobbits() {
    try {
        const now = Date.now();
        serverHobbits.forEach(h => {
            if (!h.lastSaved) h.lastSaved = now;
        });
        fs.writeFileSync(HOBBITS_FILE, JSON.stringify(serverHobbits, null, 2));
    } catch (err) {
        console.error("❌ Failed to save hobbits database:", err);
    }
}

// Periodic auto-save every 10s
setInterval(() => {
    const now = Date.now();
    serverAnimals.forEach(c => { c.lastSaved = now; });
    serverHobbits.forEach(h => { h.lastSaved = now; });
    try {
        fs.writeFileSync(CHICKENS_FILE, JSON.stringify(serverAnimals, null, 2));
        fs.writeFileSync(HOBBITS_FILE, JSON.stringify(serverHobbits, null, 2));
    } catch (err) {}
}, 10000);

export function saveDoors() {
    fs.writeFileSync(DOORS_FILE, JSON.stringify(doorDb, null, 2));
}

export function saveStores() {
    fs.writeFileSync(path.join(__dirname, 'stores.json'), JSON.stringify(storeDb, null, 2));
}

export function saveAuth() {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authDb, null, 2));
}

export function saveDebt() {
    fs.writeFileSync(DEBT_FILE, JSON.stringify({ amount: globalDebt }, null, 2));
}

export function setGlobalDebt(val) {
    globalDebt = Math.max(0, val);
    saveDebt();
}

export function decrementGlobalFish() {
    globalFishCount = Math.max(0, globalFishCount - 1);
}

export function logActivity(type, wallet, description) {
    activityLog.unshift({ type, wallet, description, timestamp: Date.now() });
    if (activityLog.length > 50) activityLog.pop();
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog, null, 2));
}

export function syncPlayerAndSave(socketId) {
    const p = players[socketId];
    if (!p || !p.wallet) return;

    userDb[p.wallet] = {
        ...p,
        id: undefined,
        target: null
    };

    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(userDb, null, 2));
}

// ==========================================
// 4. ENTITY, ITEM & SPATIAL HELPERS
// ==========================================
export function getRandomHobbitName() {
    const first = HOBBIT_FIRST_NAMES[Math.floor(Math.random() * HOBBIT_FIRST_NAMES.length)];
    const last = HOBBIT_LAST_NAMES[Math.floor(Math.random() * HOBBIT_LAST_NAMES.length)];
    return `${first} ${last}`;
}

export function getRandomServerFish() {
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

export function giveItemToServerInventory(player, newItem) {
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

export function isServerPlantMature(plant, currentGrowth) {
    const def = PLANT_DEFS[plant.type];
    if (!def) return false;

    const stagesLength = Array.isArray(def.stages) ? def.stages.length : def.stages;
    const harvestWindow = def.harvestWindow || def.window || 1;

    const currentStageIdx = Math.min(stagesLength - 1, Math.floor(currentGrowth / (100 / stagesLength)));
    return currentStageIdx >= (stagesLength - harvestWindow);
}

export function getJobConfig(jobId, recipeName) {
    const tableType = jobId.split('_')[0];
    const baseConfig = WORKSTATION_CONFIGS[tableType];
    if (!baseConfig) return null;

    if (tableType === 'kitchen') {
        return baseConfig.recipes[recipeName] || null;
    }
    return baseConfig;
}

export function validateServerCollision(nextX, nextY) {
    if (nextX < 0 || nextX > 160000 || nextY < 0 || nextY > 160000) return false;
    return true;
}

export function isTileBlockedOnServer(tx, ty, wellX, wellY, structures = []) {
    // 1. Block well center (4x4 clear well plaza)
    if (Math.abs(tx - wellX) <= 2 && Math.abs(ty - wellY) <= 2) {
        return true;
    }

    // 2. Block all building footprints, porches, and roofs
    if (structures) {
        for (const struct of structures) {
            let w = 4, h = 3;
            if (struct.type === 'TEMPLE') { w = 4; h = 8; }
            else if (struct.type === 'STORE') { w = 4; h = 4; }
            else if (struct.type === 'BARN') { w = 6; h = 6; }
            
            if (tx >= struct.tx && tx < struct.tx + w && 
                ty <= struct.ty && ty > struct.ty - h) {
                return true;
            }
            if (tx >= struct.tx && tx < struct.tx + w && ty === struct.ty + 1) {
                return true;
            }
        }
    }

    return false;
}

export function getVillagePlayerCounts(wellX, wellY, owner) {
    let allies = 0;
    let enemies = 0;

    for (let id in players) {
        const p = players[id];
        if (p.hp <= 0 || p.isOffline) continue;

        const dist = Math.hypot(p.x - (wellX * 16), p.y - (wellY * 16));
        if (dist <= 2400) {
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

export function calculateProportionalHobbits(wellX, wellY) {
    const wellTX = Math.floor(wellX / 16);
    const wellTY = Math.floor(wellY / 16);
    let totalHobbitCount = 0;

    for (let key in chestDb) {
        const coords = key.split('_');
        const tx = parseInt(coords[1]);
        const ty = parseInt(coords[2]);
        const dist = Math.hypot(tx - wellTX, ty - wellTY);
        if (dist <= 40) {
            totalHobbitCount += 2;
        }
    }

    return Math.max(3, totalHobbitCount);
}

export function getVillageStructures(wellX, wellY) {
    const wellTX = Math.floor(wellX / 16);
    const wellTY = Math.floor(wellY / 16);
    const structures = [];

    for (let key in chestDb) {
        const coords = key.split('_');
        if (coords[0] !== 'chest') continue;
        const tx = parseInt(coords[1]);
        const ty = parseInt(coords[2]);
        if (Math.hypot(tx - wellTX, ty - wellTY) <= 40) {
            structures.push({ tx, ty, type: 'HOUSE', job: 'Forager' });
        }
    }

    for (let key in storeDb) {
        const coords = key.split('_');
        if (coords[0] !== 'store') continue;
        const tx = parseInt(coords[1]);
        const ty = parseInt(coords[2]);
        if (Math.hypot(tx - wellTX, ty - wellTY) <= 40) {
            structures.push({ tx, ty, type: 'STORE', job: 'Trader' });
        }
    }

    for (let key in hayDb) {
        const coords = key.split('_');
        if (coords[0] !== 'hay') continue;
        const tx = parseInt(coords[1]);
        const ty = parseInt(coords[2]);
        if (Math.hypot(tx - wellTX, ty - wellTY) <= 40) {
            structures.push({ tx, ty, type: 'BARN', job: 'Farmer' });
        }
    }

    return structures;
}

// ==========================================
// 5. ENTITY SPAWNERS & TELEMETRY
// ==========================================
export function spawnVillageChickens(wellX, wellY, count = 3) {
    const existing = serverAnimals.filter(a => {
        const atx = (a.tx !== undefined) ? a.tx : Math.floor(a.x / 16);
        const aty = (a.ty !== undefined) ? a.ty : Math.floor(a.y / 16);
        return Math.hypot(atx - wellX, aty - wellY) < 40;
    });

    if (existing.length >= count) return;

    const village = serverVillages.get(`${wellX}_${wellY}`);
    const structures = village ? village.structures : [];

    const toSpawn = count - existing.length;
    for (let i = 0; i < toSpawn; i++) {
        let spawnTX = wellX + 4;
        let spawnTY = wellY + 4;
        let foundSafeGround = false;
        let attempts = 0;

        while (!foundSafeGround && attempts < 30) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const dist = 4 + Math.random() * 8;
            const testX = Math.floor(wellX + Math.cos(angle) * dist);
            const testY = Math.floor(wellY + Math.sin(angle) * dist);

            if (!isTileBlockedOnServer(testX, testY, wellX, wellY, structures)) {
                spawnTX = testX;
                spawnTY = testY;
                foundSafeGround = true;
            }
        }

        serverAnimals.push({
            id: 'animal_' + Math.random().toString(36).substr(2, 9),
            tx: spawnTX,
            ty: spawnTY,
            targetTX: spawnTX,
            targetTY: spawnTY,
            x: spawnTX * 16,
            y: spawnTY * 16,
            speed: 20,
            hp: 30,
            maxHp: 30,
            energy: 100,
            maxEnergy: 100,
            goal: 'wander',
            state: 'idle',
            dir: 'East',
            stepTimer: Math.random() * 4.0,
            eggTimer: 45 + Math.random() * 30,
            poopTimer: 20 + Math.random() * 20,
            lastSaved: Date.now(),
            
            // 📊 Live Telemetry Trackers
            mealsEaten: 0,
            eggsLaid: 0,
            poopsDropped: 0,
            stepsTaken: 0,
            visitedTiles: [`${spawnTX}_${spawnTY}`],
            minX: spawnTX, maxX: spawnTX, minY: spawnTY, maxY: spawnTY
        });
    }

    saveChickens();
    console.log(`🐓 Spawned ${toSpawn} chickens for village at [${wellX}, ${wellY}]. (Total: ${serverAnimals.length})`);
}

export function spawnDatabaseHobbit(io, wellX, wellY, villageId, defaultJobType, assignedStructure = null) {
    const hobbitId = 'hobbit_' + Math.random().toString(36).substr(2, 9);
    const proceduralName = getRandomHobbitName();

    const wellTX = wellX;
    const wellTY = wellY;

    let assignedHouseId = null;
    let assignedHomeX = wellTX + 2;
    let assignedHomeY = wellTY + 2;
    let job = defaultJobType;

    let startTX = assignedHomeX;
    let startTY = assignedHomeY;

    if (assignedStructure) {
        assignedHomeX = assignedStructure.tx;
        assignedHomeY = assignedStructure.ty;
        assignedHouseId = (assignedStructure.tx * 1000) + assignedStructure.ty;
        job = assignedStructure.job;

        if (assignedStructure.type === 'HOUSE') {
            startTX = assignedStructure.tx + 3;
            startTY = assignedStructure.ty - 1;
        } else if (assignedStructure.type === 'TEMPLE') {
            startTX = assignedStructure.tx + 2;
            startTY = assignedStructure.ty - 5;
        } else if (assignedStructure.type === 'STORE') {
            startTX = assignedStructure.tx + 2;
            startTY = assignedStructure.ty - 3;
        } else if (assignedStructure.type === 'BARN') {
            startTX = assignedStructure.tx + 2;
            startTY = assignedStructure.ty - 1;
        }
    }

    const keyItem = assignedHouseId ? {
        name: `Key to House #${assignedHouseId}`,
        seedType: "key",
        spriteID: 38,
        tileset: "keyTileset",
        isKey: true,
        houseId: assignedHouseId,
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0,
        count: 1,
        maxStack: 1
    } : null;

    const newHobbit = {
        id: hobbitId,
        name: proceduralName,
        job: job,
        isHobbit: true,
        x: startTX * 16,
        y: startTY * 16,
        floor: 1,
        speed: 35,
        hp: 40,
        maxHp: 40,
        ad: 2,
        energy: 100,
        maxEnergy: 100,

        // 🎲 RANDOMIZED SOCIALIZATION (0% to 100%)
        // Hobbits starting < 40% will immediately drop tools and walk the Ring Road!
        socialization: Math.floor(Math.random() * 101),
        maxSocialization: 100,
        walkDirection: Math.random() > 0.5 ? 1 : -1, // 1 = Clockwise, -1 = Counter-Clockwise
        ringWaypointIndex: Math.floor(Math.random() * 16),

        
        inventory: keyItem ? [keyItem] : [],
        villageId: villageId,
        houseId: assignedHouseId,
        homeX: assignedHomeX,
        homeY: assignedHomeY,
        state: 'idle',
        goal: 'wander',
        dir: 'South',
        frame: 0,
        animTimer: 0,
        moveTimer: Math.random() * 3,
        pathTimer: 0,
        attackTimer: 0,
        path: [],
        lastSaved: Date.now()
    };

    serverHobbits.push(newHobbit);
    if (io) io.emit('hobbitSpawned', newHobbit);
    saveHobbits();
    console.log(`🧝 Distributed Worker Initialized: ${proceduralName} (${job}) inside House #${assignedHouseId} in Village: ${villageId}`);
    return newHobbit;
}

export function getChickenTelemetrySummary() {
    return serverAnimals.map((chicken, idx) => {
        const curTX = chicken.tx !== undefined ? chicken.tx : Math.floor(chicken.x / 16);
        const curTY = chicken.ty !== undefined ? chicken.ty : Math.floor(chicken.y / 16);
        const minX = chicken.minX !== undefined ? chicken.minX : curTX;
        const maxX = chicken.maxX !== undefined ? chicken.maxX : curTX;
        const minY = chicken.minY !== undefined ? chicken.minY : curTY;
        const maxY = chicken.maxY !== undefined ? chicken.maxY : curTY;
        const boundW = (maxX - minX) + 1;
        const boundH = (maxY - minY) + 1;
        const uniqueCount = Array.isArray(chicken.visitedTiles) ? new Set(chicken.visitedTiles).size : 1;

        return {
            index: idx + 1,
            id: chicken.id,
            status: chicken.hp > 0 ? "ALIVE" : "STARVED",
            energy: Math.floor(chicken.energy || 100),
            position: `[${curTX}, ${curTY}]`,
            mealsEaten: chicken.mealsEaten || 0,
            eggsLaid: chicken.eggsLaid || 0,
            poopsDropped: chicken.poopsDropped || 0,
            stepsTaken: chicken.stepsTaken || 0,
            uniqueTiles: uniqueCount,
            bounds: `[${minX}..${maxX}, ${minY}..${maxY}] (${boundW}x${boundH} = ${boundW * boundH} tile² swath)`
        };
    });
}

export function printChickenTelemetry(summaries, contextTitle = "LIVE CHICKEN STATUS") {
    if (!summaries || summaries.length === 0) return;
    console.log(`\n🌾 =================== ${contextTitle} ===================`);
    summaries.forEach(s => {
        console.log(`┌─ 🐓 Chicken #${s.index} (${s.id}) [${s.status}]`);
        console.log(`│  ├─ Current State: Energy: ${s.energy}% | Position: ${s.position}`);
        console.log(`│  ├─ Meals Grazed:  ${s.mealsEaten}x grass/hay eaten`);
        console.log(`│  ├─ Production:    ${s.eggsLaid}x eggs laid | ${s.poopsDropped}x manure dropped`);
        console.log(`│  ├─ Drunkard Walk: ${s.stepsTaken} steps (${s.uniqueTiles} unique tiles visited)`);
        console.log(`│  └─ Roam Bounds:   ${s.bounds}`);
        console.log(`└─────────────────────────────────────────────────────────────────`);
    });
    console.log(`===================================================================\n`);
}

// ==========================================
// 6. GUARANTEED OFFLINE SIMULATION ENGINES
// ==========================================
let hasRunSimulationThisBoot = false;

export function runOfflineChickenSimulation() {
    if (hasRunSimulationThisBoot) return;
    hasRunSimulationThisBoot = true;

    const now = Date.now();
    const summaries = [];

    for (const chicken of serverAnimals) {
        if (chicken.tx === undefined) chicken.tx = Math.floor(chicken.x / 16);
        if (chicken.ty === undefined) chicken.ty = Math.floor(chicken.y / 16);

        if (!chicken.lastSaved) {
            chicken.lastSaved = now;
            continue;
        }

        const deltaSeconds = Math.max(0, (now - chicken.lastSaved) / 1000);
        chicken.lastSaved = now;

        if (deltaSeconds >= 5.0) {
            const stepsToSimulate = Math.min(10000, Math.floor(deltaSeconds / 4.0));

            let curTX = chicken.tx;
            let curTY = chicken.ty;
            let energy = chicken.energy !== undefined ? chicken.energy : 100;

            let mealsEaten = 0;
            let poopsDropped = 0;
            let eggsLaid = 0;
            let starved = false;
            const visitedTiles = new Set([`${curTX}_${curTY}`]);
            let minX = curTX, maxX = curTX, minY = curTY, maxY = curTY;

            const dirs = [
                { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
                { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
            ];

            for (let step = 0; step < stepsToSimulate; step++) {
                const validNeighbors = dirs.filter(d => !isTileBlockedOnServer(curTX + d.dx, curTY + d.dy));
                if (validNeighbors.length > 0) {
                    const chosen = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                    curTX += chosen.dx;
                    curTY += chosen.dy;
                }

                visitedTiles.add(`${curTX}_${curTY}`);
                if (curTX < minX) minX = curTX;
                if (curTX > maxX) maxX = curTX;
                if (curTY < minY) minY = curTY;
                if (curTY > maxY) maxY = curTY;

                energy -= 0.12;

                // Grazing
                if (energy < 60) {
                    const plantKey = `${curTX}_${curTY}`;
                    if (serverBacteria.has(plantKey)) {
                        const traits = serverBacteria.get(plantKey);
                        if (((traits >> 20) & 0xFF) === 17) {
                            let health = traits & 0xFF;
                            health = Math.max(0, health - 10);
                            if (health <= 0) serverBacteria.delete(plantKey);
                            else serverBacteria.set(plantKey, (health & 0xFF) | (17 << 20));
                            energy = 100;
                            mealsEaten++;
                        }
                    } else if (serverPlants.has(plantKey)) {
                        const plant = serverPlants.get(plantKey);
                        if (plant && plant.growth >= 20) {
                            serverPlants.delete(plantKey);
                            energy = Math.min(100, energy + (plant.growth >= 100 ? 50 : 30));
                            mealsEaten++;
                        }
                    }
                }

                // Starvation
                if (energy <= 0) {
                    chicken.hp = 0;
                    chicken.energy = 0;
                    const packedTraits = ((50 & 0xFF) | ((50 & 0xFF) << 20)) >>> 0;
                    serverBacteria.set(`${curTX}_${curTY}`, packedTraits);
                    starved = true;
                    break;
                }

                // Poop trail
                if (step % 20 === 0 && !isTileBlockedOnServer(curTX, curTY)) {
                    const poopTraits = (3 & 0xFF) | ((12 & 0xFF) << 8) | ((4 & 0xFF) << 20);
                    serverBacteria.set(`${curTX}_${curTY}`, poopTraits);
                    poopsDropped++;
                }

                // Egg drop
                if (step % 50 === 0 && energy >= 40 && !isTileBlockedOnServer(curTX, curTY)) {
                    energy -= 20;
                    const eggTraits = (1 & 0xFF) | ((16 & 0xFF) << 20);
                    serverBacteria.set(`${curTX}_${curTY}`, eggTraits);
                    eggsLaid++;
                }
            }

            chicken.tx = curTX;
            chicken.ty = curTY;
            chicken.targetTX = curTX;
            chicken.targetTY = curTY;
            chicken.x = curTX * 16;
            chicken.y = curTY * 16;
            chicken.energy = Math.max(0, energy);
            chicken.state = 'idle';

            const boundW = (maxX - minX) + 1;
            const boundH = (maxY - minY) + 1;

            summaries.push({
                id: chicken.id,
                starved,
                offlineMins: (deltaSeconds / 60).toFixed(1),
                steps: stepsToSimulate,
                mealsEaten,
                eggsLaid,
                poopsDropped,
                uniqueTiles: visitedTiles.size,
                bounds: `[${minX}..${maxX}, ${minY}..${maxY}] (${boundW}x${boundH} = ${boundW * boundH} tile² swath)`,
                finalEnergy: Math.floor(chicken.energy),
                finalPos: `[${curTX}, ${curTY}]`
            });
        }
    }

    serverAnimals = serverAnimals.filter(a => a.hp > 0);
    saveChickens();

    if (summaries.length > 0) {
        console.log(`\n🌾 =================== CHICKEN CATCH-UP TELEMETRY ===================`);
        console.log(`Simulated ${summaries.length} chicken(s) across offline absence:\n`);
        summaries.forEach((s, idx) => {
            const statusIcon = s.starved ? "💀 STARVED" : "🐓 ALIVE";
            console.log(`┌─ Chicken #${idx + 1} (${s.id}) [${statusIcon}]`);
            console.log(`│  ├─ Offline Time:  ${s.offlineMins} mins (${s.steps} steps @ 4.0s cadence)`);
            console.log(`│  ├─ Meals Eaten:   ${s.mealsEaten}x (Grazed grass/hay)`);
            console.log(`│  ├─ Eggs Laid:     ${s.eggsLaid}x | Poops Dropped: ${s.poopsDropped}x`);
            console.log(`│  ├─ Roamed Area:   ${s.uniqueTiles} unique tiles visited`);
            console.log(`│  ├─ Bounds Swath:  ${s.bounds}`);
            console.log(`│  └─ End State:     Energy: ${s.finalEnergy}% | Position: ${s.finalPos}`);
            console.log(`└─────────────────────────────────────────────────────────────────`);
        });
        console.log(`===================================================================\n`);
    }
}

/**
 * 🧝 FULL DETERMINISTIC HOBBIT WORK-DAY SIMULATION
 */
// serverState.js (inside runOfflineHobbitSimulation)

/**
 * 🧝 OFFLINE HOBBIT WORK-DAY SIMULATION WITH RING ROAD SOCIAL BREAKS
 */
export function runOfflineHobbitSimulation() {
    const now = Date.now();
    const DAY_LENGTH_SEC = 240; // 4 minutes full cycle
    const DAY_WORK_SEC = 180;   // 3 minutes daytime
    const summaries = [];

    // Cycle breakdown: 65s Work -> 25s Social Walk (Total 90s sub-routine)
    const WORK_SUB_CYCLE_SEC = 65;
    const SOCIAL_WALK_SEC = 25;
    const TOTAL_SUB_CYCLE_SEC = 90;

    for (const hobbit of serverHobbits) {
        if (!hobbit.lastSaved) {
            hobbit.lastSaved = now;
            continue;
        }

        const deltaSeconds = Math.max(0, (now - hobbit.lastSaved) / 1000);
        hobbit.lastSaved = now;

        if (deltaSeconds < 15.0) continue;

        const homeX = hobbit.homeX || Math.floor(hobbit.x / 16);
        const homeY = hobbit.homeY || Math.floor(hobbit.y / 16);
        const chestId = `chest_${homeX}_${homeY - 1}`;
        if (!chestDb[chestId]) chestDb[chestId] = [];
        const chest = chestDb[chestId];

        const fullDays = Math.floor(deltaSeconds / DAY_LENGTH_SEC);
        const remainderSec = deltaSeconds % DAY_LENGTH_SEC;

        // 🍗 1. Food Consumption
        let energyDeficit = (fullDays * 100) + (remainderSec > 60 ? 40 : 0);
        let foodEatenCount = 0;
        let foodTypesEaten = [];

        for (let i = chest.length - 1; i >= 0; i--) {
            if (energyDeficit <= 0) break;
            const item = chest[i];
            const nutrition = HOBBIT_FOOD_VALUES[item.seedType];

            if (nutrition) {
                while (item.count > 0 && energyDeficit > 0) {
                    item.count--;
                    energyDeficit -= nutrition;
                    foodEatenCount++;
                    foodTypesEaten.push(item.name);
                }
                if (item.count <= 0) chest.splice(i, 1);
            }
        }

        const isStarving = energyDeficit > 50;

        // 🌾 2. Work & Social Cycle Accounting
        const workSecs = (fullDays * DAY_WORK_SEC) + Math.min(remainderSec, DAY_WORK_SEC);
        const completedSubCycles = Math.floor(workSecs / TOTAL_SUB_CYCLE_SEC);
        const subCycleRemainder = workSecs % TOTAL_SUB_CYCLE_SEC;

        // Social breaks completed: +3 chats per walk (+45% social)
        const totalSocialWalks = completedSubCycles + (subCycleRemainder > WORK_SUB_CYCLE_SEC ? 1 : 0);

        let harvestedPlants = [];
        let itemsDeposited = 0;
        let lastHarvestPos = { x: homeX, y: homeY };

        if (hobbit.job === 'Forager' && !isStarving) {
            // Harvest only during the 65s work portions of each sub-cycle
            const actualProductiveSecs = (completedSubCycles * WORK_SUB_CYCLE_SEC) + Math.min(subCycleRemainder, WORK_SUB_CYCLE_SEC);
            const potentialHarvestCount = Math.floor(actualProductiveSecs / 10);

            const nearbyPlants = [];
            for (let [key, plant] of serverPlants) {
                const dist = Math.hypot(plant.gx - homeX, plant.gy - homeY);
                if (dist <= 30 && plant.growth >= 50) {
                    nearbyPlants.push({ ...plant, dist, key });
                }
            }

            nearbyPlants.sort((a, b) => a.dist - b.dist);
            const toHarvest = nearbyPlants.slice(0, potentialHarvestCount);

            toHarvest.forEach(p => {
                serverPlants.delete(p.key);
                harvestedPlants.push(p.type);
                lastHarvestPos = { x: p.gx, y: p.gy };

                const yieldType = YIELD_MAP[p.type] || 'PLANT_MATTER';
                const cropTemplate = ITEM_TYPES[yieldType];

                if (cropTemplate && chest.length < 16) {
                    chest.push(createItem(cropTemplate));
                    itemsDeposited++;
                }
                markPlantChunkDirty(Math.floor(p.gx / 100), Math.floor(p.gy / 100));
            });

            if (toHarvest.length > 0) flushDirtyPlantChunks();
        }

        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));

        // 📍 3. Deterministic Location (Field vs Ring Road vs Bed)
        let resolvedState = 'idle';
        let resolvedPos = { x: homeX, y: homeY };
        let activityLabel = "";

        // Village center reference
        const village = serverVillages.get(hobbit.villageId) || { x: homeX, y: homeY };

        if (isStarving) {
            resolvedPos = { x: homeX + 3, y: homeY - 1 };
            resolvedState = 'starving';
            activityLabel = "In Bed (Starving / Needs Food)";
            hobbit.socialization = 20;
        } 
        else if (remainderSec <= 60) {
            // Nighttime -> In Bedroll
            resolvedPos = { x: homeX + 3, y: homeY - 1 };
            resolvedState = 'sleeping';
            activityLabel = "In Bedroll (Deep Sleep)";
            hobbit.socialization = Math.max(50, 100 - (completedSubCycles * 5));
        } 
        else {
            // Daytime: Determine if in Work Loop or on Ring Road Social Walk!
            const isCurrentlyOnSocialWalk = (subCycleRemainder > WORK_SUB_CYCLE_SEC);

            if (isCurrentlyOnSocialWalk) {
                // On Ring Road Walk! Calculate exact circle coordinate
                const walkProgressRatio = (subCycleRemainder - WORK_SUB_CYCLE_SEC) / SOCIAL_WALK_SEC;
                const angle = (walkProgressRatio * Math.PI * 2 * (hobbit.walkDirection || 1));
                const ringX = Math.floor(village.x + Math.cos(angle) * 20);
                const ringY = Math.floor(village.y + Math.sin(angle) * 20);

                resolvedPos = { x: ringX, y: ringY };
                resolvedState = 'social_walk';
                activityLabel = `On Ring Road [${ringX}, ${ringY}] (Strolling & Chatting)`;
                hobbit.socialization = 85;
            } else {
                // In Foraging Field
                resolvedPos = lastHarvestPos;
                resolvedState = 'foraging';
                activityLabel = `In Field [${lastHarvestPos.x}, ${lastHarvestPos.y}] (Foraging)`;
                hobbit.socialization = Math.max(30, 80 - Math.floor((subCycleRemainder / WORK_SUB_CYCLE_SEC) * 50));
            }
        }

        hobbit.x = resolvedPos.x * 16;
        hobbit.y = resolvedPos.y * 16;

        summaries.push({
            name: hobbit.name,
            role: hobbit.job,
            offlineMins: (deltaSeconds / 60).toFixed(1),
            daysSimulated: fullDays,
            socialWalks: totalSocialWalks,
            socialization: Math.floor(hobbit.socialization || 80),
            foodEaten: foodEatenCount,
            harvestedCount: harvestedPlants.length,
            itemsDeposited,
            status: resolvedState.toUpperCase(),
            location: activityLabel
        });
    }

    // 📡 4. OFFLINE SECRET SPREAD: Gossip propagates between village workers!
    for (let i = 0; i < serverHobbits.length; i++) {
        for (let j = i + 1; j < serverHobbits.length; j++) {
            const hA = serverHobbits[i];
            const hB = serverHobbits[j];
            if (hA.villageId === hB.villageId && hA.secrets && hB.secrets) {
                // Share non-private secrets
                hA.secrets.forEach(s => {
                    if (!s.isPrivate && s.type !== 'HOME_MEMORY') {
                        if (!hB.secrets.some(bs => bs.id === s.id)) hB.secrets.push(s);
                    }
                });
                hB.secrets.forEach(s => {
                    if (!s.isPrivate && s.type !== 'HOME_MEMORY') {
                        if (!hA.secrets.some(as => as.id === s.id)) hA.secrets.push(s);
                    }
                });
            }
        }
    }

    saveHobbits();

    // 📊 5. PRINT SUMMARY
    if (summaries.length > 0) {
        console.log(`\n🧝 =================== HOBBIT SOCIAL & WORK CATCH-UP ===================`);
        summaries.forEach((s, idx) => {
            console.log(`┌─ Worker #${idx + 1}: ${s.name} (${s.role}) [${s.status}]`);
            console.log(`│  ├─ Offline Time:     ${s.offlineMins} mins (${s.daysSimulated} in-game days)`);
            console.log(`│  ├─ Social Breaks:    ${s.socialWalks}x Ring Road walks completed (Social: ${s.socialization}%)`);
            console.log(`│  ├─ Sustenance:       ${s.foodEaten}x meals consumed from chest`);
            console.log(`│  ├─ Field Production: ${s.harvestedCount}x plants harvested (+${s.itemsDeposited} deposited)`);
            console.log(`│  └─ Reconnect State:  ${s.location}`);
            console.log(`└─────────────────────────────────────────────────────────────────`);
        });
        console.log(`===================================================================\n`);
    }

    return summaries;
}

// ==========================================
// 7. CHUNK & PLANT DISK WRITERS
// ==========================================
export function markPlantChunkDirty(cx, cy) {
    dirtyPlantChunks.add(`${cx}_${cy}`);
}

export function flushDirtyPlantChunks() {
    if (dirtyPlantChunks.size === 0) return;
    for (const key of dirtyPlantChunks) {
        const [cxStr, cyStr] = key.split('_');
        const cx = parseInt(cxStr);
        const cy = parseInt(cyStr);
        savePlantChunk(cx, cy, serverPlants, Date.now());
    }
    dirtyPlantChunks.clear();
}

export function generateServerFloraForChunk(cx, cy) {
    const density = 0.40; 
    const chunkPlants = new Map();

    for (let i = 0; i < 10000; i++) {
        if (Math.random() < density) {
            const lx = i % 100;
            const ly = Math.floor(i / 100);
            const gx = cx * 100 + lx;
            const gy = cy * 100 + ly;

            let isBlocked = false;
            for (const [key, v] of serverVillages) {
                if (isTileBlockedOnServer(gx, gy, v.x, v.y, v.structures || [])) {
                    isBlocked = true;
                    break;
                }
            }
            if (isBlocked) continue;

            const roll = Math.random();
            let plantType = 'grass';
            if (roll > 0.95) plantType = 'sunflower';
            else if (roll > 0.85) plantType = 'rose';
            else if (roll > 0.70) plantType = 'violet';

            const gRate = PLANT_DEFS[plantType]?.growthRate || 0.4;
            const initialAge = Math.floor(20 + Math.random() * 80);

            const pObj = {
                gx, gy,
                type: plantType,
                growth: initialAge,
                growthRate: gRate,
                timestamp: Date.now()
            };

            chunkPlants.set(`${gx}_${gy}`, pObj);
            serverPlants.set(`${gx}_${gy}`, pObj);
        }
    }

    savePlantChunk(cx, cy, chunkPlants, Date.now());
    console.log(`🌱 Generated clean flora for chunk [${cx}, ${cy}] (${chunkPlants.size} plants).`);
}