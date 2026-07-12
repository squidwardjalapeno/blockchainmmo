// src/hobbitCore.js
import { getVillageAt } from './cellDecorator.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitCore.js loaded");
}

// Central array tracking all active hobbits in the local simulation
export const hobbits = [];

// Export to window for backwards compatibility with legacy global calls
if (typeof window !== 'undefined') {
    window.hobbits = hobbits;
}

// Name tables for procedural generation
export const HOBBIT_FIRST_NAMES = [
    "Bilbo", "Frodo", "Samwise", "Merry", "Pippin", "Bango", "Bungo", 
    "Drogo", "Hamfast", "Longo", "Olo", "Paladin", "Rufus", "Sancho", 
    "Tobold", "Wilibald"
];

export const HOBBIT_LAST_NAMES = [
    "Baggins", "Gamgee", "Brandybuck", "Took", "Gardner", "Greenhand", 
    "Grubb", "Chubb", "Proudfoot", "Bolger", "Boffin", "Sandyman", 
    "Cotton", "Twofoot", "Underhill", "Hornblower"
];

// Nutritional values assigned to items consumed by hobbits
export const HOBBIT_FOOD_VALUES = { 
    "cooked_fish": 60,
    "fish_muskellunge": 100,
    "fish_trevally": 80, 
    "fish_angler": 80, 
    "fish_octopus": 60,
    "fish_squid": 50, 
    "fish_eel": 45, 
    "fish_mackerel": 35,
    "fish_trout": 25, 
    "fish": 20, 
    "fish_panfish": 15,
    "pineapple_item": 50,
    "eggplant_item": 40,
    "tomato_item": 35,
    "pumpkin_item": 30,
    "watermelon_item": 30,
    "potato_item": 25,
    "corn_item": 25,
    "turnip_item": 20,
    "egg": 20,
    "strawberry_item": 15,
    "wheat_item": 10,
    "raw_chicken": 15
};

// Maps botanical crops to their harvested item representation
export const YIELD_MAP = {
    'turnip': 'TURNIP_ITEM', 
    'tomato': 'TOMATO_ITEM',
    'eggplant': 'EGGPLANT_ITEM', 
    'strawberry': 'STRAWBERRY_ITEM',
    'pumpkin': 'PUMPKIN_ITEM', 
    'watermelon': 'WATERMELON_ITEM',
    'corn': 'CORN_ITEM', 
    'pineapple': 'PINEAPPLE_ITEM',
    'potato': 'POTATO_ITEM', 
    'wheat': 'WHEAT_ITEM',
    'grass': 'PLANT_MATTER', 
    'rose': 'PLANT_MATTER',
    'violet': 'VIOLET_ITEM', 
    'sunflower': 'SUNFLOWER_ITEM'
};

/**
 * Instantiates a new hobbit structure and appends it to the active simulation array
 */
export function spawnHobbit(gx, gy, houseId = null, homeX = null, homeY = null, defaultJob = 'Forager') {
    const seed = (gx * 31) + gy;
    const hash = Math.abs(Math.sin(seed) * 10000);
    const firstName = HOBBIT_FIRST_NAMES[Math.floor(hash) % HOBBIT_FIRST_NAMES.length];
    const lastName = HOBBIT_LAST_NAMES[Math.floor(hash * 10) % HOBBIT_LAST_NAMES.length];
    const proceduralName = `${firstName} ${lastName}`;

    const keyItem = houseId ? {
        name: `Key to House #${houseId}`,
        seedType: "key",
        spriteID: 38,
        tileset: "keyTileset",
        isKey: true,
        houseId: houseId,
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0,
        count: 1,
        maxStack: 1
    } : null;

    hobbits.push({
        id: 'hobbit_' + Math.random().toString(36).substr(2, 9),
        name: proceduralName, 
        job: defaultJob,       
        isHobbit: true,
        x: gx * 16, 
        y: gy * 16,
        floor: 1,
        speed: 35,
        
        hp: 40, 
        maxHp: 40,
        ad: 2, 
        
        energy: 100,
        maxEnergy: 100,

        inventory: keyItem ? [keyItem] : [], 
        houseId: houseId,
        homeX: homeX,
        homeY: homeY,
        
        doorX: houseId ? homeX - 1 : null,  
        doorY: houseId ? homeY + 1 : null,  
        
        chestX: houseId ? homeX - 2 : null, 
        chestY: houseId ? homeY : null,     

        hitboxLeft: 4,
        hitboxRight: 12, 
        hitboxTop: 10,
        hitboxBottom: 15,

        state: 'idle',     
        goal: 'wander',    
        dir: 'South',
        frame: 0,
        animTimer: 0,
        moveTimer: Math.random() * 3,
        pathTimer: 0,      
        attackTimer: 0,    
        path: [],
        targetPlant: null, 
        visitedHistory: [], 
        lastUpdated: Date.now(),
        slowTickTimer: Math.random() * 1.5
    });
}

/**
 * Returns the structural well metadata of the village a hobbit belongs to
 */
export function getHobbitVillage(hobbit) {
    const hx = hobbit.homeX || Math.floor(hobbit.x / 16);
    const hy = hobbit.homeY || Math.floor(hobbit.y / 16);
    
    return getVillageAt(hx, hy);
}