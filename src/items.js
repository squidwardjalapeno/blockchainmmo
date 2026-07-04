// src/items.js

if (typeof window !== 'undefined') {
    logStep("items.js loaded");
}

export const ITEM_TYPES = {
    // === FISH ===
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
    COOKED_BASS: { name: "Cooked River Bass", decayRate: 0.6, seedType: "cooked_fish", baseHealth: 60, baseVirulence: 0, baseFertility: 80, spriteID: 44, maxStack: 8 },

    // === CROPS & FOLIAGE ===
    PLANT_MATTER: { name: "Plant Matter", decayRate: 0.5, seedType: "plant_matter", baseHealth: 12, baseVirulence: 2, baseFertility: 20, spriteID: 152, tileset: "gardenTileset", maxStack: 8 },
    HAY: { name: "Dried Hay", seedType: "hay", spriteID: 168, tileset: "gardenTileset", baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 64, drawSize: 16 },
    CHICKEN_POOP: { name: "Chicken Poop", decayRate: 1.0, seedType: "chicken_poop", baseHealth: 3, baseVirulence: 12, baseFertility: 14, spriteID: 0, tileset: "transparentTileset", maxStack: 8, drawSize: 4 },
    EGG: { name: "Farm Egg", decayRate: 0.8, seedType: "egg", baseHealth: 30, baseVirulence: 0, baseFertility: 15, spriteID: 60, tileset: "foodTileset", maxStack: 8, drawSize: 4 },
    RAW_CHICKEN: { name: "Raw Chicken", decayRate: 1.5, seedType: "raw_chicken", baseHealth: 50, baseVirulence: 10, baseFertility: 100, spriteID: 15, tileset: "foodTileset", maxStack: 8, drawSize: 8 },

    TURNIP_ITEM: { name: "Turnip", decayRate: 0.8, seedType: "turnip_item", baseHealth: 30, baseVirulence: 0, baseFertility: 15, spriteID: 0, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    TOMATO_ITEM: { name: "Tomato", decayRate: 0.8, seedType: "tomato_item", baseHealth: 30, baseVirulence: 0, baseFertility: 25, spriteID: 24, tileset: "cropTileset", maxStack: 8, drawSize: 4, typeLabel: "Food", energy: 35, description: "A hearty fruit with seeds inside." },
    EGGPLANT_ITEM: { name: "Eggplant", decayRate: 0.8, seedType: "eggplant_item", baseHealth: 30, baseVirulence: 0, baseFertility: 40, spriteID: 36, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    STRAWBERRY_ITEM: { name: "Strawberry", decayRate: 0.8, seedType: "strawberry_item", baseHealth: 20, baseVirulence: 0, baseFertility: 20, spriteID: 72, tileset: "cropTileset", maxStack: 8, drawSize: 4 },
    PUMPKIN_ITEM: { name: "Pumpkin", decayRate: 0.8, seedType: "pumpkin_item", baseHealth: 40, baseVirulence: 0, baseFertility: 20, spriteID: 96, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    WATERMELON_ITEM: { name: "Watermelon", decayRate: 0.8, seedType: "watermelon_item", baseHealth: 40, baseVirulence: 0, baseFertility: 20, spriteID: 30, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    CORN_ITEM: { name: "Corn", decayRate: 0.8, seedType: "corn_item", baseHealth: 30, baseVirulence: 0, baseFertility: 15, spriteID: 108, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    PINEAPPLE_ITEM: { name: "Pineapple", decayRate: 0.8, seedType: "pineapple_item", baseHealth: 40, baseVirulence: 0, baseFertility: 30, spriteID: 48, tileset: "cropTileset", maxStack: 8, drawSize: 8 },
    POTATO_ITEM: { name: "Potato", decayRate: 0.8, seedType: "potato_item", baseHealth: 30, baseVirulence: 0, baseFertility: 25, spriteID: 84, tileset: "cropTileset", maxStack: 8, drawSize: 4 },
    WHEAT_ITEM: { name: "Wheat", decayRate: 0.8, seedType: "wheat_item", baseHealth: 20, baseVirulence: 0, baseFertility: 10, spriteID: 168, tileset: "gardenTileset", maxStack: 8 },

    // === SEEDS ===
    GRASS_SEED: { name: "Grass Seed", decayRate: 0.1, seedType: "grass_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 0, tileset: "gardenTileset", maxStack: 64 },
    TURNIP_SEED: { name: "Turnip Seed", decayRate: 0.1, seedType: "turnip_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 5, tileset: "cropTileset", maxStack: 64 },
    TOMATO_SEED: { name: "Tomato Seed", decayRate: 0.1, seedType: "tomato_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 29, tileset: "cropTileset", maxStack: 64 },
    EGGPLANT_SEED: { name: "Eggplant Seed", decayRate: 0.1, seedType: "eggplant_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 41, tileset: "cropTileset", maxStack: 64 },
    STRAWBERRY_SEED: { name: "Strawberry Seed", decayRate: 0.1, seedType: "strawberry_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 77, tileset: "cropTileset", maxStack: 64 },
    PUMPKIN_SEED: { name: "Pumpkin Seed", decayRate: 0.1, seedType: "pumpkin_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 101, tileset: "cropTileset", maxStack: 64 },
    WATERMELON_SEED: { name: "Watermelon Seed", decayRate: 0.1, seedType: "watermelon_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 35, tileset: "cropTileset", maxStack: 64 },
    CORN_SEED: { name: "Corn Seed", decayRate: 0.1, seedType: "corn_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 113, tileset: "cropTileset", maxStack: 64 },
    PINEAPPLE_SEED: { name: "Pineapple Crown", decayRate: 0.1, seedType: "pineapple_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 1, tileset: "gardenTileset", maxStack: 64 },
    POTATO_SEED: { name: "Potato Eye", decayRate: 0.1, seedType: "potato_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 2, tileset: "gardenTileset", maxStack: 64 },
    WHEAT_SEED: { name: "Wheat Seed", decayRate: 0.1, seedType: "wheat_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 65, tileset: "cropTileset", maxStack: 64 },
    ROSE_SEED: { name: "Rose Seed", decayRate: 0.1, seedType: "rose_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 8, spriteID: 11, tileset: "cropTileset", maxStack: 64 },
    VIOLET_SEED: { name: "Violet Seed", decayRate: 0.1, seedType: "violet_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 8, spriteID: 23, tileset: "cropTileset", maxStack: 64 },
    SUNFLOWER_SEED: { name: "Sunflower Seed", decayRate: 0.1, seedType: "sunflower_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 12, spriteID: 119, tileset: "cropTileset", maxStack: 64 },

    // === TOOLS & GEAR ===
    KEY: { name: "House Key", seedType: "key", spriteID: 38, tileset: "keyTileset", isKey: true, baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 12, maxStack: 1 },
    DAGGER: { name: "Rusty Dagger", seedType: "weapon_dagger", spriteID: 0, tileset: "weaponTileset", isWeapon: true, ad: 5, baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 8, hilt: { x: 5, y: 10 }, maxStack: 1 },
    PICKAXE: { name: "Miner's Pickaxe", seedType: "tool_pickaxe", spriteID: 69, tileset: "transparentTileset", isWeapon: true, ad: 3, baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 8, hilt: { x: 4, y: 11 }, maxStack: 1 },

    // === RAW RESOURCES ===
    IRON_ORE: { name: "Iron Ore", seedType: "iron_ore", spriteID: 32, tileset: "craftingTileset", baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 64, drawSize: 8 },
    IRON_INGOT: { name: "Iron Ingot", seedType: "iron_ingot", spriteID: 36, tileset: "craftingTileset", baseHealth: 100, baseVirulence: 0, baseFertility: 0, maxStack: 64, drawSize: 8 },
};

/**
 * Standardized item instantiation factory
 */
export function createItem(template) {
    if (!template) return null;

    return {
        ...template,           
        health: template.baseHealth !== undefined ? template.baseHealth : 100,
        virulence: template.baseVirulence !== undefined ? template.baseVirulence : 0,
        fertility: template.baseFertility !== undefined ? template.baseFertility : 0,
        count: 1,                           
        maxStack: template.maxStack || 1,   
        timestamp: Date.now() 
    };
}