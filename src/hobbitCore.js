// src/hobbitCore.js
import { getVillageAt } from './cellDecorator.js';
import { createSecret, SECRET_TYPES } from './secrets.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitCore.js loaded");
}

export const hobbits = [];
if (typeof window !== 'undefined') {
    window.hobbits = hobbits;
}

export const HOBBIT_FIRST_NAMES = [
    "Bilbo", "Frodo", "Samwise", "Merry", "Pippin", 
    "Bango", "Bungo", "Drogo", "Hamfast", "Longo", 
    "Olo", "Paladin", "Rufus", "Sancho", "Tobold", "Wilibald"
];

export const HOBBIT_LAST_NAMES = [
    "Baggins", "Gamgee", "Brandybuck", "Took", "Gardner", 
    "Greenhand", "Chubb", "Proudfoot", "Bolger", "Boffin", 
    "Sandyman", "Cotton", "Twofoot", "Underhill", "Hornblower"
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

export const YIELD_MAP = {
    'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM', 'eggplant': 'EGGPLANT_ITEM', 
    'strawberry': 'STRAWBERRY_ITEM', 'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
    'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM', 'potato': 'POTATO_ITEM', 
    'wheat': 'WHEAT_ITEM', 'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
    'violet': 'VIOLET_ITEM', 'sunflower': 'SUNFLOWER_ITEM'
};

/**
 * Stacks items cleanly into a hobbit's inventory up to maxStack before allocating a new slot.
 */
export function giveItemToHobbit(hobbit, newItem) {
    if (!newItem) return false;
    if (!hobbit.inventory) hobbit.inventory = [];

    const maxSlots = 6;
    const maxStack = newItem.maxStack || 8;

    // 1. Attempt stack merge
    if (maxStack > 1) {
        const existing = hobbit.inventory.find(i => i.seedType === newItem.seedType && i.count < maxStack);
        if (existing) {
            const space = maxStack - existing.count;
            if (newItem.count <= space) {
                existing.count += newItem.count;
                return true;
            } else {
                existing.count = maxStack;
                newItem.count -= space;
            }
        }
    }

    // 2. Allocate new slot if under capacity
    const nonKeyCount = hobbit.inventory.filter(i => !i.isKey).length;
    if (nonKeyCount < maxSlots) {
        hobbit.inventory.push(newItem);
        return true;
    }

    return false;
}

export function spawnHobbit(gx, gy, houseId = null, homeX = null, homeY = null, defaultJob = 'Forager', id = null, name = null) {
    const seed = (gx * 31) + gy;
    const hash = Math.abs(Math.sin(seed) * 10000);
    const firstName = HOBBIT_FIRST_NAMES[Math.floor(hash) % HOBBIT_FIRST_NAMES.length];
    const lastName = HOBBIT_LAST_NAMES[Math.floor(hash * 10) % HOBBIT_LAST_NAMES.length];
    const proceduralName = name || `${firstName} ${lastName}`;

    // Resolve base location anchors
    const resolvedHomeX = (homeX !== null && homeX !== undefined) ? homeX : gx;
    const resolvedHomeY = (homeY !== null && homeY !== undefined) ? homeY : gy;

    let finalSpawnX = gx || resolvedHomeX || 50;
    let finalSpawnY = gy || resolvedHomeY || 50;

    let doorX = null, doorY = null, chestX = null, chestY = null;
    let homeMemory = null;

    // Build standard house structural landmarks if home coordinates are known
    if (resolvedHomeX !== null && resolvedHomeY !== null) {
        doorX = resolvedHomeX + 1;
        doorY = resolvedHomeY;
        chestX = resolvedHomeX;
        chestY = resolvedHomeY - 1;

        if (gx === resolvedHomeX && gy === resolvedHomeY) {
            finalSpawnX = resolvedHomeX + 1;
            finalSpawnY = resolvedHomeY - 1;
        }

        // 🎯 Compile the non-shareable Home Memory
        homeMemory = {
            houseId: houseId || 0,
            homeX: resolvedHomeX,
            homeY: resolvedHomeY,
            doorX: resolvedHomeX + 1,
            doorY: resolvedHomeY,
            porchX: resolvedHomeX + 1,       // 1 tile in front of the door outside
            porchY: resolvedHomeY + 1,
            standX: resolvedHomeX + 1,       // Walkable interior floor in front of chest
            standY: resolvedHomeY - 1,
            chestX: resolvedHomeX,           // Physical storage chest
            chestY: resolvedHomeY - 1,
            bedrollX: resolvedHomeX + 3,     // Interior bedroll
            bedrollY: resolvedHomeY - 1
        };
    }

    const currentVillage = getVillageAt(resolvedHomeX || gx, resolvedHomeY || gy);
    
    const villageHobbits = hobbits.filter(h => {
        const hVillage = getHobbitVillage(h);
        if (currentVillage && hVillage) {
            return hVillage.x === currentVillage.x && hVillage.y === currentVillage.y;
        }
        return Math.hypot((h.homeX || (h.x / 16)) - (resolvedHomeX || gx), (h.homeY || (h.y / 16)) - (resolvedHomeY || gy)) < 45;
    });

    let villageRole = 'CITIZEN';
    const hasQuartermaster = villageHobbits.some(h => h.villageRole === 'QUARTERMASTER');
    const guardCount = villageHobbits.filter(h => h.villageRole === 'GUARD').length;
    const hasFarmManager = villageHobbits.some(h => h.villageRole === 'FARM_MANAGER');

    if (!hasQuartermaster) {
        villageRole = 'QUARTERMASTER';
    } else if (guardCount < 4) {
        villageRole = 'GUARD';
    } else if (!hasFarmManager && defaultJob === 'Farmer') {
        villageRole = 'FARM_MANAGER';
    } else {
        villageRole = 'CITIZEN';
    }

    const courage = (villageRole === 'GUARD' || villageRole === 'QUARTERMASTER')
        ? 'FIGHT' 
        : (Math.random() < 0.5 ? 'FIGHT' : 'FLEE');

    let level = 0;
    if (villageRole === 'QUARTERMASTER') level = 10;
    else if (villageRole === 'GUARD' || defaultJob === 'Military') level = 5;
    else if (villageRole === 'FARM_MANAGER') level = 1;

    let baseHp = 40, baseAd = 3, baseArmor = 1, baseMagic = 0, baseMr = 1, baseSpeed = 35;

    if (level > 0) {
        const pointsToSpend = 10 + (level - 1);
        const stats = ['hp', 'ad', 'armor', 'magic', 'mr', 'speed'];

        for (let i = 0; i < pointsToSpend; i++) {
            const pickedStat = stats[Math.floor(Math.random() * stats.length)];
            if (pickedStat === 'hp') baseHp += 10;
            else if (pickedStat === 'ad') baseAd += 1;
            else if (pickedStat === 'armor') baseArmor += 1;
            else if (pickedStat === 'magic') baseMagic += 2;
            else if (pickedStat === 'mr') baseMr += 1;
            else if (pickedStat === 'speed') baseSpeed += 6;
        }
    }

    const keyItem = houseId ? {
        name: `Key to House #${houseId}`,
        seedType: "key",
        spriteID: 38,
        tileset: "keyTileset",
        isKey: true,
        houseId: houseId,
        count: 1,
        maxStack: 1
    } : null;

    // 🎯 Initialize the private non-shareable Home Memory secret
    const initialSecrets = [];
    if (homeMemory) {
        initialSecrets.push(createSecret(
            SECRET_TYPES.HOME_MEMORY,
            houseId ? `house_${houseId}` : 'home',
            { x: homeMemory.doorX, y: homeMemory.doorY },
            homeMemory,
            true // isPrivate = true (Strictly never leaked in gossip)
        ));
    }

    // src/hobbitCore.js (inside spawnHobbit)

    const newHobbit = {
        id: id || ('hobbit_' + Math.random().toString(36).substr(2, 9)),
        name: proceduralName,
        job: defaultJob,
        villageRole: villageRole,
        level: level,
        courage: courage,

        // 🎲 RANDOMIZED SOCIALIZATION (0% to 100%)
        // Hobbits starting < 40% will immediately drop tools and walk the Ring Road!
        socialization: Math.floor(Math.random() * 101),
        maxSocialization: 100,
        walkDirection: Math.random() > 0.5 ? 1 : -1, // 1 = Clockwise, -1 = Counter-Clockwise
        ringWaypointIndex: Math.floor(Math.random() * 16),

        homeMemory: homeMemory,
        secrets: initialSecrets,
        thoughtBubble: null,
        officerIntelCooldowns: new Map(),
        lastSocialTime: 0,
        recentTiles: [],

        isHobbit: true,
        x: finalSpawnX * 16, 
        y: finalSpawnY * 16,
        floor: 1,
        speed: baseSpeed,
        
        hp: baseHp, 
        maxHp: baseHp,
        ad: baseAd,
        armor: baseArmor,
        magic: baseMagic,
        mr: baseMr,
        energy: 100,
        maxEnergy: 100,

        inventory: keyItem ? [keyItem] : [], 
        houseId: houseId,
        homeX: resolvedHomeX,
        homeY: resolvedHomeY,
        doorX: doorX,  
        doorY: doorY,  
        chestX: chestX, 
        chestY: chestY,     

        state: 'idle',     
        goal: 'wander',    
        dir: 'South',
        frame: 0,
        animTimer: 0,
        brainTimer: 0,
        path: []
    };

    hobbits.push(newHobbit);
    return newHobbit;
}

export function getHobbitVillage(hobbit) {
    const hx = hobbit.homeX || Math.floor(hobbit.x / 16);
    const hy = hobbit.homeY || Math.floor(hobbit.y / 16);
    return getVillageAt(hx, hy);
}