// js/items.js

// To this:
if (typeof window !== 'undefined') {
    logStep("items.js");
}

/**
 * 1. THE LIBRARY: Static definitions for every item type.
 * Use this to set the "starting" values for things.
 */
export const ITEM_TYPES = {
    // ... your existing items ...
    COOKED_BASS: {
        name: "Cooked River Bass",
        decayRate: 0.6,       // 3x slower than raw Bass (2.0)
        seedType: "cooked_fish", // It's still organic if dropped
        baseHealth: 60,       // Cooking "resets" and boosts the HP
        baseVirulence: 0,      // Purified by fire
        baseFertility: 80,
        spriteID: 44,          // Your new Tile ID
        maxStack: 8, // 👈 Stacks to 8

    },

    // In src/items.js -> update BASS and add the new fish!
    BASS: { name: "River Bass", decayRate: 2.0, seedType: "fish", baseHealth: 40, baseVirulence: 10, baseFertility: 100, spriteID: 43, tileset: "fishTileset", maxStack: 8 },
    TROUT: { name: "Trout", decayRate: 2.0, seedType: "fish_trout", baseHealth: 40, baseVirulence: 10, baseFertility: 120, spriteID: 16, tileset: "fishTileset", maxStack: 8 },
    PANFISH: { name: "Panfish", decayRate: 2.0, seedType: "fish_panfish", baseHealth: 30, baseVirulence: 10, baseFertility: 80, spriteID: 2, tileset: "fishTileset", maxStack: 8 },
    MACKEREL: { name: "Mackerel", decayRate: 1.5, seedType: "fish_mackerel", baseHealth: 50, baseVirulence: 10, baseFertility: 150, spriteID: 70, tileset: "fishTileset", maxStack: 8 },
    MUSKELLUNGE: { name: "Muskellunge", decayRate: 1.0, seedType: "fish_muskellunge", baseHealth: 100, baseVirulence: 10, baseFertility: 300, spriteID: 91, tileset: "fishTileset", maxStack: 8 },
    GIANT_TREVALLY: { name: "Giant Trevally", decayRate: 1.0, seedType: "fish_trevally", baseHealth: 80, baseVirulence: 10, baseFertility: 250, spriteID: 35, tileset: "fishTileset", maxStack: 8 },
    SQUID: { name: "Squid", decayRate: 1.5, seedType: "fish_squid", baseHealth: 50, baseVirulence: 10, baseFertility: 180, spriteID: 84, tileset: "fishTileset", maxStack: 8 },
    OCTOPUS: { name: "Octopus", decayRate: 1.5, seedType: "fish_octopus", baseHealth: 60, baseVirulence: 10, baseFertility: 200, spriteID: 107, tileset: "fishTileset", maxStack: 8 },
    EEL: { name: "Eel", decayRate: 1.5, seedType: "fish_eel", baseHealth: 50, baseVirulence: 10, baseFertility: 150, spriteID: 59, tileset: "fishTileset", maxStack: 8 },
    ANGLERFISH: { name: "Anglerfish", decayRate: 1.0, seedType: "fish_angler", baseHealth: 80, baseVirulence: 10, baseFertility: 250, spriteID: 29, tileset: "fishTileset", maxStack: 8 },


    // In src/items.js
    PLANT_MATTER: { // 👈 Changed key
        name: "Plant Matter", // 👈 Changed name
        decayRate: 0.5, 
        seedType: "plant_matter", // 👈 Changed seed type
        baseHealth: 12, baseVirulence: 2, baseFertility: 20, spriteID: 152,                // 👈 Updated to 152
        tileset: "gardenTileset",     // 👈 Updated to gardenTileset
        maxStack: 8 
    },

    // ... inside ITEM_TYPES ...
    GRASS_SEED: {
        name: "Grass Seed",
        decayRate: 0.1,        
        seedType: "grass_seed", 
        baseHealth: 10,
        baseVirulence: 0,
        baseFertility: 5,
        spriteID: 0,                   // 👈 Updated to 0
        tileset: "gardenTileset",
        maxStack: 64
               // 👈 Updated to gardenTileset
    },
    TURNIP_ITEM: {
        name: "Turnip",
        decayRate: 0.8,
        seedType: "turnip_item", 
        baseHealth: 30, baseVirulence: 0, baseFertility: 15,
        spriteID: 0, tileset: "cropTileset", // 👈 Tile 0 on crops
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 8 // 👈 ADD THIS

    },
    TURNIP_SEED: {
        name: "Turnip Seed",
        decayRate: 0.1,        
        seedType: "turnip_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 5, tileset: "cropTileset", // 👈 Tile 5 on crops
        maxStack: 64
    },

    // ... inside ITEM_TYPES ...
    TOMATO_ITEM: {
        name: "Tomato",
        decayRate: 0.8,
        seedType: "tomato_item", 
        baseHealth: 30, baseVirulence: 0, baseFertility: 25, // Tomatoes are rich compost!
        spriteID: 24, tileset: "cropTileset", // 👈 Tile 24
        maxStack: 8, // 👈 Stacks to 8

        // 👇 NEW TOOLTIP METADATA
        typeLabel: "Food", energy: 35, description: "A hearty fruit with seeds inside.",

        drawSize: 4 // 👈 ADD THIS

    },
    TOMATO_SEED: {
        name: "Tomato Seed",
        decayRate: 0.1,        
        seedType: "tomato_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 29, tileset: "cropTileset", // 👈 Tile 29
        maxStack: 64
    },

    // ... inside ITEM_TYPES ...
    EGGPLANT_ITEM: {
        name: "Eggplant", decayRate: 0.8, seedType: "eggplant_item", 
        baseHealth: 30, baseVirulence: 0, baseFertility: 40, spriteID: 36, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 8 // 👈 ADD THIS

    },
    EGGPLANT_SEED: {
        name: "Eggplant Seed", decayRate: 0.1, seedType: "eggplant_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 41, tileset: "cropTileset",
        maxStack: 64
    },
    STRAWBERRY_ITEM: {
        name: "Strawberry", decayRate: 0.8, seedType: "strawberry_item", 
        baseHealth: 20, baseVirulence: 0, baseFertility: 20, spriteID: 72, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 4 // 👈 ADD THIS

    },
    STRAWBERRY_SEED: {
        name: "Strawberry Seed", decayRate: 0.1, seedType: "strawberry_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 77, tileset: "cropTileset",
        maxStack: 64
    },
    PUMPKIN_ITEM: {
        name: "Pumpkin", decayRate: 0.8, seedType: "pumpkin_item", 
        baseHealth: 40, baseVirulence: 0, baseFertility: 20, spriteID: 96, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 8 // 👈 ADD THIS

    },
    PUMPKIN_SEED: {
        name: "Pumpkin Seed", decayRate: 0.1, seedType: "pumpkin_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 101, tileset: "cropTileset",
        maxStack: 64
    },
    WATERMELON_ITEM: {
        name: "Watermelon", decayRate: 0.8, seedType: "watermelon_item", 
        baseHealth: 40, baseVirulence: 0, baseFertility: 20, spriteID: 30, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 8 // 👈 ADD THIS

    },
    WATERMELON_SEED: {
        name: "Watermelon Seed", decayRate: 0.1, seedType: "watermelon_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 35, tileset: "cropTileset",
        maxStack: 64
    },

    // ... inside ITEM_TYPES ...
    CORN_ITEM: {
        name: "Corn", decayRate: 0.8, seedType: "corn_item", 
        baseHealth: 30, baseVirulence: 0, baseFertility: 15, spriteID: 108, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 8 // 👈 ADD THIS

    },
    CORN_SEED: {
        name: "Corn Seed", decayRate: 0.1, seedType: "corn_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 113, tileset: "cropTileset",
        maxStack: 64
    },
    PINEAPPLE_ITEM: {
        name: "Pineapple", decayRate: 0.8, seedType: "pineapple_item", 
        baseHealth: 40, baseVirulence: 0, baseFertility: 30, spriteID: 48, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 8 // 👈 ADD THIS

    },
    PINEAPPLE_SEED: {
        name: "Pineapple Crown", decayRate: 0.1, seedType: "pineapple_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 1, tileset: "gardenTileset", // 👈 Garden Tileset
        maxStack: 64
    },
    POTATO_ITEM: {
        name: "Potato", decayRate: 0.8, seedType: "potato_item", 
        baseHealth: 30, baseVirulence: 0, baseFertility: 25, spriteID: 84, tileset: "cropTileset",
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 4 // 👈 ADD THIS

    },
    POTATO_SEED: {
        name: "Potato Eye", decayRate: 0.1, seedType: "potato_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 2, tileset: "gardenTileset", // 👈 Garden Tileset
        maxStack: 64
    },
    WHEAT_ITEM: {
        name: "Wheat", decayRate: 0.8, seedType: "wheat_item", 
        baseHealth: 20, baseVirulence: 0, baseFertility: 10, spriteID: 168, tileset: "gardenTileset", // 👈 Garden Tileset
        maxStack: 8 // 👈 Stacks to 8
    },
    WHEAT_SEED: {
        name: "Wheat Seed", decayRate: 0.1, seedType: "wheat_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 65, tileset: "cropTileset",
        maxStack: 64
    },

    ROSE_SEED: {
        name: "Rose Seed",
        decayRate: 0.1,        
        seedType: "rose_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 8,
        spriteID: 11, tileset: "cropTileset",
        maxStack: 64
    },
    VIOLET_SEED: {
        name: "Violet Seed",
        decayRate: 0.1,        
        seedType: "violet_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 8,
        spriteID: 23, tileset: "cropTileset",
        maxStack: 64
    },
    SUNFLOWER_SEED: {
        name: "Sunflower Seed",
        decayRate: 0.1,        
        seedType: "sunflower_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 12,
        spriteID: 119, tileset: "cropTileset",
        maxStack: 64
    },

    // 🆕 NEW HAY ITEM
    HAY: {
        name: "Dried Hay",
        seedType: "hay",        // For filtering in storage
        spriteID: 28,           // Looks like a bundle of hay
        isFodder: true,         // Useful for animal logic later
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0
    },
    CHICKEN_POOP: {
        name: "Chicken Poop",
        decayRate: 1,       // Very slow decay
        seedType: "chicken_poop", // Maps to TypeID 3
        baseHealth: 3,
        baseVirulence: 12,
        baseFertility: 14,
        spriteID: 0,
        tileset: "transparentTileset", // 👈 ADD THIS LINE
        maxStack: 8, // 👈 Stacks to 8
        drawSize: 4 // 👈 ADD THIS

    },

    // 🥚 Task 3: The New Egg Item!
    EGG: {
        name: "Farm Egg",
        decayRate: 0.8,
        seedType: "egg",
        baseHealth: 30,
        baseVirulence: 0,
        baseFertility: 15,
        spriteID: 60,
        tileset: "foodTileset",
        maxStack: 8, // 👈 Task 3
        drawSize: 4 // 👈 ADD THIS

    },

    RAW_CHICKEN: { 
        name: "Raw Chicken", decayRate: 1.5, seedType: "raw_chicken", 
        baseHealth: 50, baseVirulence: 10, baseFertility: 100, spriteID: 15, tileset: "foodTileset", maxStack: 8, drawSize: 8 
    },

    KEY: {
        name: "House Key",
        seedType: "key",
        spriteID: 38,
        tileset: "keyTileset", // 👈 We'll tell the renderer to use the key sheet
        isKey: true,
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0,
        drawSize: 4 // 👈 ADD THIS

    },
    GOLD_ORE: {
        name: "Gold Ore",
        seedType: "ore",
        spriteID: 29, // From worldTilesColor
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0
    },
    GOLD_COIN: {
        name: "Gold Coin",
        seedType: "coin",
        spriteID: 31, // A nice coin-looking tile
        isCurrency: true,
        baseHealth: 100,
        baseVirulence: 0,
        baseFertility: 0
    },
    DAGGER: {
        name: "Rusty Dagger",
        seedType: "weapon_dagger",
        spriteID: 0,
        tileset: "weaponTileset", // Tells the renderer to use the weapon sprite sheet
        isWeapon: true,
        ad: 5, // Grants +5 Attack Damage when equipped
        baseHealth: 100, // Can act as Durability later!
        baseVirulence: 0,
        baseFertility: 0,
        drawSize: 8 // 👈 ADD THIS

    },
};

/**
 * 2. THE FACTORY: Creates a unique object to put in the inventory.
 * UPDATED: Now copies all template properties (decayRate, seedType, etc.)
 */
export function createItem(template) {
    if (!template) return null;

    return {
        ...template,           // 👈 This copies decayRate and seedType automatically!
        health: template.baseHealth,
        virulence: template.baseVirulence,
        fertility: template.baseFertility,
        count: 1,                           // 👈 NEW: Start with 1 item
        maxStack: template.maxStack || 1,   // 👈 NEW: Default to unstackable (1) if not set
        timestamp: Date.now() 
    };
}
