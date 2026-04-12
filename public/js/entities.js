// js/entities.js
import { CONFIG } from './config.js';
import { setWorldSeed, seededRandom } from "./mapGenerator.js"

export const hero = {
    // --- POSITION & MOVEMENT ---
    x: 500,
    y: 500,
    
    dir: 'Down',
    animTimer: 0,
    frame: 0,
    isMoving: false,

    // --- BASE STATS ---
    hp: CONFIG.HERO_HP,
    maxHp: CONFIG.HERO_HP,
    ad: CONFIG.HERO_ATTACK,            // Attack Damage (Basic Attack)
    armor: CONFIG.HERO_ARMOR,
    magic: CONFIG.HERO_MAGIC,
    mr: CONFIG.HERO_MAGIC_RESISTANCE,
    speed: CONFIG.HERO_SPEED,


    xp: 1000,
    level: 1,
    spentPoints: 0,

    // --- ⚔️ PVP STATE MACHINE ---
    target: null,      // The RemotePlayer object we are currently chasing/attacking
    isAttacking: false,// Becomes true when we click an enemy
    isWindingUp: false,// True during the 0.3s "pause" before a hit
    attackTimer: 0,    // Tracks progress of the swing and the cooldown
    attackSpeed: 1.0,  // Base: 1 attack per second
    attackRange: 24,   // Distance (in pixels) needed to connect a punch

    // --- SYSTEMS ---
    inventory: [],
    maxSlots: 5,
    selectedSlot: 0,
    onChainPoints: 0,

    // --- REMOVED / UNUSED (Keeping keys for safety if referenced elsewhere) ---
    isFishing: false,
    hasBite: false,
};

export const gameState = {
    lastLoggedCell: null
};

export function getLevelInfo(xp) {
    if (xp < 1000) return { level: 0, nextXp: 1000, points: 0 };
    
    let level = 1;
    let totalXpNeeded = 1000;
    let nextLevelChunk = 100;
    let pointsAvailable = 10; // Big payoff for hitting Level 1

    while (xp >= (totalXpNeeded + nextLevelChunk)) {
        totalXpNeeded += nextLevelChunk;
        nextLevelChunk *= 1.5;
        level++;
        pointsAvailable += 1; // +1 point for every level after 1
    }

    return { 
        level, 
        nextXp: Math.floor(totalXpNeeded + nextLevelChunk), 
        points: pointsAvailable 
    };
}

export function resetEntities(worldMap) {
    let foundLand = false;
    let spawnX, spawnY;
    let finalCellX = 0;
    let finalCellY = 0;

    const mapWidth = CONFIG.MAP_SIZE; 
    const mapHeight = CONFIG.MAP_SIZE;

    // 1. RE-SYNC THE SEED
    // This ensures every player's "random" sequence starts at the same point
    // We use the worldSeed provided by the server
    setWorldSeed(window.worldSeed || 12345); 

    // 2. DETERMINISTIC SEARCH
    while (!foundLand) {
        // Now using seededRandom instead of Math.random
        let cellX = Math.floor(seededRandom() * mapWidth);
        let cellY = Math.floor(seededRandom() * mapHeight);
        const index = (cellY * mapWidth) + cellX;

        // Ensure we spawn on Land
        if (worldMap[index] >= CONFIG.LAND_THRESHOLD) { 
            spawnX = (cellX * 1600) + 800; 
            spawnY = (cellY * 1600) + 800;
            finalCellX = cellX;
            finalCellY = cellY;
            foundLand = true;
        }
    }

    hero.x = spawnX;
    hero.y = spawnY;
    hero.hp = hero.maxHp;
    hero.target = null;
    
    console.log(`🏠 UNIFIED Spawn Found at Cell: [${finalCellX}, ${finalCellY}]`);
}

