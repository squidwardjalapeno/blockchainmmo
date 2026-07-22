// js/entities.js
import { CONFIG } from './config.js';
import { setWorldSeed, seededRandom } from "./mapGenerator.js"

if (typeof window !== 'undefined') {
    logStep("entities.js");
}

// ==========================================
// 🚨 CROWD CONTROL RESTRICTION MASKS
// ==========================================
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

// ==========================================
// 🛡️ HERO DATA PROFILE
// ==========================================
export const hero = {
    x: 500,
    y: 500,
    floor: 1, 
    dir: 'South',
    animState: 'idle',
    animTimer: 0,
    frame: 0,
    isMoving: false,

    energy: CONFIG.HERO_ENERGY,      
    maxEnergy: CONFIG.HERO_ENERGY,   

    hp: CONFIG.HERO_HP,
    maxHp: CONFIG.HERO_HP,
    shield: 0,   

    baseAd: CONFIG.HERO_ATTACK,  
    ad: CONFIG.HERO_ATTACK,            
    armor: CONFIG.HERO_ARMOR,
    magic: CONFIG.HERO_MAGIC,
    mr: CONFIG.HERO_MAGIC_RESISTANCE,
    speed: CONFIG.HERO_SPEED,

    xp: 0,
    level: 0,
    spentPoints: 0,

    equipment: {
        mainHand: null 
    },

    charClass: null,  
    skills: [],       
    cooldowns: [0, 0, 0, 0], 

    dashTimer: 0,
    dashVector: { x: 0, y: 0 },

    warpTimer: 0,
    warpTarget: { x: 0, y: 0 },

    buffs: {
        vaultEmpowered: false,
        divineBubble: false,    
        isAscended: false,     
        fluxShotEmpowered: false, 
        isInvincible: false    
    },

    passives: {
        hasFever: false
    },

    activeCCs: [], 
    ccFlags: {
        canMove: true,
        canAttack: true,
        canCastMovement: true,
        canCastNonMovement: true,
        canCleanse: true
    },
    slowTimer: 0, 

    p2_stance: 'blast', 
    attackCount: 0,     

    ascensionTimer: 0,        
    invincibleTimer: 0,        
    
    projectiles: [],          
    aoeZones: [],             

    bulwarkTimer: 0,
    bulwarkArmorBonus: 0,
    bulwarkMrBonus: 0,
    bulwarkSpeedBonus: 0,

    target: null,      
    isAttacking: false,
    isWindingUp: false,
    attackTimer: 0,    
    attackSpeed: 1.0,  
    attackRange: 24,   

    inventory: [],
    maxSlots: 10,
    selectedSlot: 0,
    
    inGameUni: 0, 

    isFishing: false,
    hasBite: false,
};

// ==========================================
// 🛡️ GLOBAL GAMESTATE & CIRCULAR-SAFE RTS STATE
// ==========================================
export const gameState = {
    lastLoggedCell: null,
    tvl: 0, 
    spectatedHobbitId: null,

    // RTS States saved inside global gameState to eliminate circular imports
    rtsEnabled: false,
    rtsCameraX: 80800,
    rtsCameraY: 80800
};

export function getFocusCoordinates() {
    // If the RTS mode is toggled, force the viewport to center on the free rts camera
    if (gameState.rtsEnabled) {
        return { x: gameState.rtsCameraX, y: gameState.rtsCameraY, floor: 1 };
    }
    if (gameState.spectatedHobbitId && typeof window !== 'undefined' && window.hobbits) {
        const hob = window.hobbits.find(h => h.id === gameState.spectatedHobbitId);
        if (hob) {
            return { x: hob.x, y: hob.y, floor: hob.floor || 1 };
        } else {
            gameState.spectatedHobbitId = null; 
        }
    }
    return { x: hero.x, y: hero.y, floor: hero.floor || 1 };
}

// ==========================================
// 🛡️ LINEAR PROGRESSION & SPAWNING FORMULAS
// ==========================================
export function getLevelInfo(xp) {
    if (xp < 1000) return { level: 0, nextXp: 1000, points: 0 };
    
    let level = 1;
    let totalXpNeeded = 1000;
    let nextLevelChunk = 100;
    let pointsAvailable = 10; 

    while (xp >= (totalXpNeeded + nextLevelChunk)) {
        totalXpNeeded += nextLevelChunk;
        nextLevelChunk += 100; 
        level++;
        pointsAvailable += 1; 
    }

    return { 
        level, 
        nextXp: Math.floor(totalXpNeeded + nextLevelChunk), 
        points: pointsAvailable 
    };
}

export function resetEntities(worldMap) {
    const mapWidth = CONFIG.MAP_SIZE; 
    const mapHeight = CONFIG.MAP_SIZE;

    setWorldSeed(window.worldSeed || 12345); 

    const settlements = [];
    for (let i = 0; i < worldMap.length; i++) {
        if (worldMap[i] === 101 || worldMap[i] === 102 || worldMap[i] === 103) {
            settlements.push(i);
        }
    }

    let spawnX, spawnY;
    let finalCellX = 0;
    let finalCellY = 0;

    if (settlements.length > 0) {
        const pick = settlements[Math.floor(seededRandom() * settlements.length)];
        finalCellX = pick % mapWidth;
        finalCellY = Math.floor(pick / mapWidth);
        const cellType = worldMap[pick];

        let offX = 50;
        let offY = 50;

        if (cellType === 101) {
            const seed = window.worldSeed || 1;
            const hash = Math.abs(Math.sin((finalCellX + seed) * 12.9898 + (finalCellY + seed) * 78.233) * 43758.5453);
            offX = Math.floor(hash * 60) % 60 + 20;
            offY = Math.floor((hash * 10) * 60) % 60 + 20;
        }

        spawnX = ((finalCellX * 100) + offX) * 16; 
        spawnY = ((finalCellY * 100) + offY + 4) * 16; 
    }
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
    hero.energy = hero.maxEnergy; 
    
    console.log(`🏠 Hero Spawned at Settlement Cell: [${finalCellX}, ${finalCellY}]`);
}