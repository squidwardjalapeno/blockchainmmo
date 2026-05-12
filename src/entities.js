// js/entities.js
import { CONFIG } from './config.js';
import { setWorldSeed, seededRandom } from "./mapGenerator.js"

// To this:
if (typeof window !== 'undefined') {
    logStep("entities.js");
}

// --- Add to the TOP of src/entities.js ---

export const CC_RESTRICT = {
    MOVE:              1 << 0, // 1 (00001)
    ATTACK:            1 << 1, // 2 (00010)
    CAST_MOVEMENT:     1 << 2, // 4 (00100)
    CAST_NON_MOVEMENT: 1 << 3, // 8 (01000)
    CLEANSE:           1 << 4  // 16(10000)
};

export const CC = {
    // === CAN CLEANSE (No Cleanse Restriction) ===
    STUN:       CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT,
    DISABLE:    CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT,
    IMPRISON:   CC_RESTRICT.MOVE | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT,
    SHACKLE:    CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_NON_MOVEMENT,
    ENTANGLE:   CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT,
    SILENCE:    CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT,
    DISARM:     CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_NON_MOVEMENT,
    EXHAUST:    CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT,
    ROOT:       CC_RESTRICT.MOVE | CC_RESTRICT.CAST_MOVEMENT,
    BIND:       CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK,
    SAP:        CC_RESTRICT.MOVE | CC_RESTRICT.CAST_NON_MOVEMENT,
    BURDEN:     CC_RESTRICT.CAST_NON_MOVEMENT,
    GROUND:     CC_RESTRICT.CAST_MOVEMENT,
    SHROUD:     CC_RESTRICT.ATTACK,
    TWIST:      CC_RESTRICT.MOVE,

    // === CANNOT CLEANSE (Includes Cleanse Restriction) ===
    SUPRESSION: CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    PACIFY:     CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    SUSPENSION: CC_RESTRICT.MOVE | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    RAPTURE:    CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    ENTOMB:     CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CLEANSE,
    NULLIFY:    CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    DEBILITATE: CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    CRIPPLE:    CC_RESTRICT.ATTACK | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CLEANSE,
    ENSNARE:    CC_RESTRICT.MOVE | CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CLEANSE,
    PARALYZE:   CC_RESTRICT.MOVE | CC_RESTRICT.ATTACK | CC_RESTRICT.CLEANSE,
    COIL:       CC_RESTRICT.MOVE | CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    SUBJUGATE:  CC_RESTRICT.CAST_NON_MOVEMENT | CC_RESTRICT.CLEANSE,
    TETHER:     CC_RESTRICT.CAST_MOVEMENT | CC_RESTRICT.CLEANSE,
    BLIND:      CC_RESTRICT.ATTACK | CC_RESTRICT.CLEANSE,
    WRAP:       CC_RESTRICT.MOVE | CC_RESTRICT.CLEANSE
};

// ... Then ensure your hero object has the trackers: ...
// export const hero = {
//     activeCCs:[], 
//     ccFlags: { canMove: true, canAttack: true, canCastMovement: true, canCastNonMovement: true, canCleanse: true },
//     slowTimer: 0,
//     // ...



export const hero = {
    // --- POSITION & MOVEMENT ---
    x: 500,
    y: 500,

    floor: 1, // 1 for Ground, 2 for Upstairs
    
    dir: 'South',
    animState: 'idle',
    animTimer: 0,
    frame: 0,
    isMoving: false,

    energy: CONFIG.HERO_ENERGY,      // 🆕 Current Energy
    maxEnergy: CONFIG.HERO_ENERGY,   // 🆕 Max Energy

    // --- BASE STATS ---
    hp: CONFIG.HERO_HP,
    maxHp: CONFIG.HERO_HP,
    shield: 0,   // 👈 NEW: Shield variable

    baseAd: CONFIG.HERO_ATTACK,  // 👈 NEW: Your naked attack damage
    ad: CONFIG.HERO_ATTACK,            // Attack Damage (Basic Attack)
    armor: CONFIG.HERO_ARMOR,
    magic: CONFIG.HERO_MAGIC,
    mr: CONFIG.HERO_MAGIC_RESISTANCE,
    speed: CONFIG.HERO_SPEED,


    xp: 1000,
    level: 1,
    spentPoints: 0,

    // 👈 NEW: Equipment Slots
    equipment: {
        weapon: null,
        armor: null
    },

    charClass: null,  // 🆕 ADD THIS
    skills: [],       // 🆕 ADD THIS
    cooldowns: [0, 0, 0, 0], // 🆕 Tracks the seconds remaining for each skill slot

    // 🆕 Dash Physics State
    dashTimer: 0,
    dashVector: { x: 0, y: 0 },

    // 👈 NEW: Warp State
    warpTimer: 0,
    warpTarget: { x: 0, y: 0 },

    // 🆕 Buff State
    buffs: {
        vaultEmpowered: false,
        divineBubble: false,    // 👈 NEW: Tracks if the bubble is active
        isAscended: false,     // 👈 NEW: Tracks Transformation
        fluxShotEmpowered: false, // 👈 NEW: Tracks Flux Shot
        isInvincible: false    // 👈 NEW: Tracks Heaven's Halo immunity




    },

    // 👈 NEW: Tells the server what passives we have equipped
    passives: {
        hasFever: false
    },

    // --- CROWD CONTROL (Cleaned up!) ---
    activeCCs: [], // Array of { mask: number, timer: number }
    ccFlags: {
        canMove: true,
        canAttack: true,
        canCastMovement: true,
        canCastNonMovement: true,
        canCleanse: true
    },
    slowTimer: 0, // Slows are a separate soft-CC

    // 👈 NEW: P2 Stance Variables
    p2_stance: 'blast', // Starts in Holy Blast mode
    attackCount: 0,     // Tracks 1st, 2nd, and 3rd hits

    ascensionTimer: 0,        // 👈 NEW: Tracks Transformation duration
    invincibleTimer: 0,        // 👈 NEW: Tracks duration of the Halo

    
    projectiles: [],          // 👈 NEW: Active flying skillshots
    aoeZones: [],             // 👈 NEW: Active healing fields on the ground

    bulwarkTimer: 0,
    bulwarkArmorBonus: 0,
    bulwarkMrBonus: 0,
    bulwarkSpeedBonus: 0,




    // --- ⚔️ PVP STATE MACHINE ---
    target: null,      // The RemotePlayer object we are currently chasing/attacking
    isAttacking: false,// Becomes true when we click an enemy
    isWindingUp: false,// True during the 0.3s "pause" before a hit
    attackTimer: 0,    // Tracks progress of the swing and the cooldown
    attackSpeed: 1.0,  // Base: 1 attack per second
    attackRange: 24,   // Distance (in pixels) needed to connect a punch

    // --- SYSTEMS ---
    inventory: [],
    maxSlots: 10,
    selectedSlot: 0,
    
    inGameUni: 0, // 🆕 REPLACES onChainPoints

    // --- REMOVED / UNUSED (Keeping keys for safety if referenced elsewhere) ---
    isFishing: false,
    hasBite: false,
};

export const gameState = {
    lastLoggedCell: null,
    tvl: 0 // 🆕 Store Total Value Locked here
};

// --- Replace getLevelInfo in src/entities.js ---

export function getLevelInfo(xp) {
    if (xp < 1000) return { level: 0, nextXp: 1000, points: 0 };
    
    let level = 1;
    let totalXpNeeded = 1000;
    let nextLevelChunk = 100;
    let pointsAvailable = 10; // Big payoff for hitting Level 1

    while (xp >= (totalXpNeeded + nextLevelChunk)) {
        totalXpNeeded += nextLevelChunk;
        // 🛡️ LINEAR SCALING: Adds 100 more XP required per level instead of multiplying
        nextLevelChunk += 100; 
        level++;
        pointsAvailable += 1; // +1 point for every level after 1
    }

    return { 
        level, 
        nextXp: Math.floor(totalXpNeeded + nextLevelChunk), 
        points: pointsAvailable 
    };
}

// src/entities.js

export function resetEntities(worldMap) {
    const mapWidth = CONFIG.MAP_SIZE; 
    const mapHeight = CONFIG.MAP_SIZE;

    // 1. RE-SYNC THE SEED
    setWorldSeed(window.worldSeed || 12345); 

    // 2. FIND ALL NATURAL SETTLEMENTS
    const settlements = [];
    for (let i = 0; i < worldMap.length; i++) {
        // 101 = Village, 102 = Town, 103 = Castle
        if (worldMap[i] === 101 || worldMap[i] === 102 || worldMap[i] === 103) {
            settlements.push(i);
        }
    }

    let spawnX, spawnY;
    let finalCellX = 0;
    let finalCellY = 0;

    // 3. SPAWN AT A SETTLEMENT (If any exist)
    if (settlements.length > 0) {
        // Pick a random settlement
        const pick = settlements[Math.floor(seededRandom() * settlements.length)];
        finalCellX = pick % mapWidth;
        finalCellY = Math.floor(pick / mapWidth);
        
        // Calculate the exact pixel coordinates (Centered in the chunk)
        // We add an offset of 4 tiles (+64px) to the Y axis so the player 
        // doesn't spawn stuck inside the village's central well!
        spawnX = (finalCellX * 1600) + 800; 
        spawnY = (finalCellY * 1600) + 800 + 64; 
    } 
    // 4. FALLBACK: WILDERNESS SPAWN
    else {
        let foundLand = false;
        while (!foundLand) {
            let cellX = Math.floor(seededRandom() * mapWidth);
            let cellY = Math.floor(seededRandom() * mapHeight);
            const index = (cellY * mapWidth) + cellX;

            if (worldMap[index] >= CONFIG.LAND_THRESHOLD) { 
                spawnX = (cellX * 1600) + 800; 
                spawnY = (cellY * 1600) + 800;
                finalCellX = cellX;
                finalCellY = cellY;
                foundLand = true;
            }
        }
    }

    hero.x = spawnX;
    hero.y = spawnY;
    hero.hp = hero.maxHp;
    hero.target = null;
    hero.energy = hero.maxEnergy; // Refill energy on spawn
    
    console.log(`🏠 Hero Spawned at Settlement Cell: [${finalCellX}, ${finalCellY}]`);
}

