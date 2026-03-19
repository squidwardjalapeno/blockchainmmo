// js/entities.js
import { CONFIG } from './config.js';

// js/entities.js
export const hero = {
    x: 500,
    y: 500,
    speed: 100, // or your CONFIG.HERO_SPEED
    dir: 'Down',
    animTimer: 0,
    frame: 0,
    isMoving: false,
    isFishing: false,
    hasBite: false,

     // ... existing x, y, speed ...
    hp: 580,
    maxHp: 580,
    mana: 300,
    maxMana: 300,
    manaRegen: 5, // 👈 ADD THIS LINE (Mana per second)
    ad: 60,         // Attack Damage
    ap: 0,          // Ability Power
    armor: 30,
    mr: 30,
    level: 1,
    exp: 0,
    attackTimer: 0,
    attackSpeed: 1.0,

    // --- 💎 ADD THIS LINE ---
    onChainPoints: 0, // This tracks your "Banked" points from Polygon
    // ----------------

    
    abilities: {
        Q: { cd: 0, maxCd: 4, cost: 50 },
        W: { cd: 0, maxCd: 10, cost: 70 },
        // etc...
    },
    // --- ADD THESE THREE LINES ---
    inventory: [],   // This is the array the error is complaining about!
    maxSlots: 5,     // The size of the bag
    selectedSlot: 0  // Useful for later
};

export const gameState = {
    lastLoggedCell: null
};



export function resetEntities(worldMap) {
    let foundLand = false;
    let spawnX, spawnY;
    
    // 1. Move these variables OUTSIDE the loop
    let finalCellX = 0;
    let finalCellY = 0;

    const mapWidth = 100; 
    const mapHeight = 100;

    while (!foundLand) {
        let cellX = Math.floor(Math.random() * mapWidth);
        let cellY = Math.floor(Math.random() * mapHeight);

        const index = (cellY * mapWidth) + cellX;

        if (worldMap[index] >= 67) { // CONFIG.LAND_THRESHOLD
            spawnX = (cellX * 1600) + 800; 
            spawnY = (cellY * 1600) + 800;
            
            // 2. Save the winners
            finalCellX = cellX;
            finalCellY = cellY;
            foundLand = true;
        }
    }

    hero.x = spawnX;
    hero.y = spawnY;
    
    // 3. Now the log can find them!
    console.log(`🏠 Safe Spawn Found at Cell: [${finalCellX}, ${finalCellY}]`);
}


