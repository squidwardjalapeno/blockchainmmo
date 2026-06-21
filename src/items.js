if (typeof window !== 'undefined') {
    logStep("items.js loaded");
}

export const ITEM_TYPES = {
    // ==========================================
    // 🐟 MARINE BIOLOGY (FISH TEMPLATES)
    // ==========================================
    BASS: { 
        name: "River Bass", icon: "🐟", typeLabel: "Food", 
        description: "A common scale fish found in fresh streams.", energy: 20,
        decayRate: 2.0, seedType: "fish", baseHealth: 40, baseVirulence: 10, baseFertility: 100, 
        spriteID: 43, tileset: "fishTileset", maxStack: 8 
    },
    TROUT: { 
        name: "Trout", icon: "🐟", typeLabel: "Food", 
        description: "Standard fresh-water trout.", energy: 25,
        decayRate: 2.0, seedType: "fish_trout", baseHealth: 40, baseVirulence: 10, baseFertility: 120, 
        spriteID: 16, tileset: "fishTileset", maxStack: 8 
    },
    PANFISH: { 
        name: "Panfish", icon: "🐟", typeLabel: "Food", 
        description: "A small pan-sized common fish.", energy: 15,
        decayRate: 2.0, seedType: "fish_panfish", baseHealth: 30, baseVirulence: 10, baseFertility: 80, 
        spriteID: 2, tileset: "fishTileset", maxStack: 8 
    },
    MACKEREL: { 
        name: "Mackerel", icon: "🐟", typeLabel: "Food", 
        description: "An organic salt-water mackerel.", energy: 35,
        decayRate: 1.5, seedType: "fish_mackerel", baseHealth: 50, baseVirulence: 10, baseFertility: 150, 
        spriteID: 70, tileset: "fishTileset", maxStack: 8 
    },
    MUSKELLUNGE: { 
        name: "Muskellunge", icon: "🐟", typeLabel: "Food", 
        description: "A legendary muskellunge. Highly nutritious.", energy: 100,
        decayRate: 1.0, seedType: "fish_muskellunge", baseHealth: 100, baseVirulence: 10, baseFertility: 300, 
        spriteID: 91, tileset: "fishTileset", maxStack: 8 
    },
    GIANT_TREVALLY: { 
        name: "Giant Trevally", icon: "🐟", typeLabel: "Food", 
        description: "A massive, powerful ocean hunter.", energy: 80,
        decayRate: 1.0, seedType: "fish_trevally", baseHealth: 80, baseVirulence: 10, baseFertility: 250, 
        spriteID: 35, tileset: "fishTileset", maxStack: 8 
    },
    SQUID: { 
        name: "Squid", icon: "🐟", typeLabel: "Food", 
        description: "A deep-water squid with soft meat.", energy: 50,
        decayRate: 1.5, seedType: "fish_squid", baseHealth: 50, baseVirulence: 10, baseFertility: 180, 
        spriteID: 84, tileset: "fishTileset", maxStack: 8 
    },
    OCTOPUS: { 
        name: "Octopus", icon: "🐟", typeLabel: "Food", 
        description: "A multi-tentacled mollusk.", energy: 60,
        decayRate: 1.5, seedType: "fish_octopus", baseHealth: 60, baseVirulence: 10, baseFertility: 200, 
        spriteID: 107, tileset: "fishTileset", maxStack: 8 
    },
    EEL: { 
        name: "Eel", icon: "🐟", typeLabel: "Food", 
        description: "A long, slippery fresh-water predator.", energy: 45,
        decayRate: 1.5, seedType: "fish_eel", baseHealth: 50, baseVirulence: 10, baseFertility: 150, 
        spriteID: 59, tileset: "fishTileset", maxStack: 8 
    },
    ANGLERFISH: { 
        name: "Anglerfish", icon: "🐟", typeLabel: "Food", 
        description: "A rare light-bearing deep ocean creature.", energy: 80,
        decayRate: 1.0, seedType: "fish_angler", baseHealth: 80, baseVirulence: 10, baseFertility: 250, 
        spriteID: 29, tileset: "fishTileset", maxStack: 8 
    },
    COOKED_BASS: {
        name: "Cooked River Bass", icon: "🍱", typeLabel: "Food",
        description: "Crispy stream fish prepared over fire.", energy: 60,
        decayRate: 0.6, seedType: "cooked_fish", baseHealth: 60, baseVirulence: 0, baseFertility: 80,
        spriteID: 44, tileset: "cropTileset", maxStack: 8
    },

    // ==========================================
    // 🌽 HORTICULTURE (AGRICULTURE & SEEDS)
    // ==========================================
    PLANT_MATTER: { 
        name: "Plant Matter", icon: "🌿", typeLabel: "Compost",
        description: "Ruined biological green remains, useful for compost.", 
        decayRate: 0.5, seedType: "plant_matter", baseHealth: 12, baseVirulence: 2, baseFertility: 20, 
        spriteID: 152, tileset: "gardenTileset", maxStack: 8 
    },
    GRASS_SEED: {
        name: "Grass Seed", icon: "🌱", typeLabel: "Seed",
        description: "A handful of wild grass seeds.", 
        decayRate: 0.1, seedType: "grass_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 0, tileset: "gardenTileset", maxStack: 64
    },
    ROSE_SEED: {
        name: "Rose Seed", icon: "🌹", typeLabel: "Seed",
        description: "Prickly rose bush seed.", 
        decayRate: 0.1, seedType: "rose_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 8,
        spriteID: 11, tileset: "cropTileset", maxStack: 64
    },
    VIOLET_SEED: {
        name: "Violet Seed", icon: "🪻", typeLabel: "Seed",
        description: "A standard blue violet flower seed.", 
        decayRate: 0.1, seedType: "violet_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 8,
        spriteID: 23, tileset: "cropTileset", maxStack: 64
    },
    SUNFLOWER_SEED: {
        name: "Sunflower Seed", icon: "🌻", typeLabel: "Seed",
        description: "Nutritious wild sunflower seed.", 
        decayRate: 0.1, seedType: "sunflower_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 12,
        spriteID: 119, tileset: "cropTileset", maxStack: 64
    },
    TURNIP_ITEM: {
        name: "Turnip", icon: "🧅", typeLabel: "Food",
        description: "A crisp, organic root vegetable.", energy: 20,
        decayRate: 0.8, seedType: "turnip_item", baseHealth: 30, baseVirulence: 0, baseFertility: 15,
        spriteID: 0, tileset: "cropTileset", maxStack: 8, drawSize: 8
    },
    TURNIP_SEED: {
        name: "Turnip Seed", icon: "🌰", typeLabel: "Seed",
        description: "Small turnip seed capsule.", 
        decayRate: 0.1, seedType: "turnip_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 5, tileset: "cropTileset", maxStack: 64
    },
    TOMATO_ITEM: {
        name: "Tomato", icon: "🍅", typeLabel: "Food",
        description: "A juicy, mineral-rich red crop.", energy: 35,
        decayRate: 0.8, seedType: "tomato_item", baseHealth: 30, baseVirulence: 0, baseFertility: 25, 
        spriteID: 24, tileset: "cropTileset", maxStack: 8, drawSize: 4
    },
    TOMATO_SEED: {
        name: "Tomato Seed", icon: "🌱", typeLabel: "Seed",
        description: "Seed core of a tomato crop.", 
        decayRate: 0.1, seedType: "tomato_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 29, tileset: "cropTileset", maxStack: 64
    },
    EGGPLANT_ITEM: {
        name: "Eggplant", icon: "🍆", typeLabel: "Food",
        description: "Standard nightshade eggplant crop.", energy: 40,
        decayRate: 0.8, seedType: "eggplant_item", baseHealth: 30, baseVirulence: 0, baseFertility: 40, 
        spriteID: 36, tileset: "cropTileset", maxStack: 8, drawSize: 8
    },
    EGGPLANT_SEED: {
        name: "Eggplant Seed", icon: "🌱", typeLabel: "Seed",
        description: "Standard eggplant seed cluster.", 
        decayRate: 0.1, seedType: "eggplant_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 41, tileset: "cropTileset", maxStack: 64
    },
    STRAWBERRY_ITEM: {
        name: "Strawberry", icon: "🍓", typeLabel: "Food",
        description: "A sweet wild berry snacks.", energy: 15,
        decayRate: 0.8, seedType: "strawberry_item", baseHealth: 20, baseVirulence: 0, baseFertility: 20, 
        spriteID: 72, tileset: "cropTileset", maxStack: 8, drawSize: 4
    },
    STRAWBERRY_SEED: {
        name: "Strawberry Seed", icon: "🌱", typeLabel: "Seed",
        description: "Nutritious strawberry seed cap.", 
        decayRate: 0.1, seedType: "strawberry_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 77, tileset: "cropTileset", maxStack: 64
    },
    PUMPKIN_ITEM: {
        name: "Pumpkin", icon: "🎃", typeLabel: "Food",
        description: "A heavy, hard-shelled autumn squash.", energy: 30,
        decayRate: 0.8, seedType: "pumpkin_item", baseHealth: 40, baseVirulence: 0, baseFertility: 20, 
        spriteID: 96, tileset: "cropTileset", maxStack: 8, drawSize: 8
    },
    PUMPKIN_SEED: {
        name: "Pumpkin Seed", icon: "🌱", typeLabel: "Seed",
        description: "Large, robust pumpkin crop seed.", 
        decayRate: 0.1, seedType: "pumpkin_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 101, tileset: "cropTileset", maxStack: 64
    },
    WATERMELON_ITEM: {
        name: "Watermelon", icon: "🍉", typeLabel: "Food",
        description: "A refreshing, sweet melon crop.", energy: 30,
        decayRate: 0.8, seedType: "watermelon_item", baseHealth: 40, baseVirulence: 0, baseFertility: 20, 
        spriteID: 30, tileset: "cropTileset", maxStack: 8, drawSize: 8
    },
    WATERMELON_SEED: {
        name: "Watermelon Seed", icon: "🌱", typeLabel: "Seed",
        description: "Standard watermelon melon seed.", 
        decayRate: 0.1, seedType: "watermelon_seed", baseHealth: 10, baseVirulence: 0, baseFertility: 5,
        spriteID: 35, tileset: "cropTileset", maxStack: 64
    },
    CORN_ITEM: {
        name: "Corn", icon: "🌽", typeLabel: "Food",
        description: "A sweet, fibrous ear of farm corn.", energy: 25,
        decayRate: 0.8, seedType: "corn_item", baseHealth: 30, baseVirulence: 0, baseFertility: 15, 
        spriteID: 108, tileset: "cropTileset", maxStack: 8, drawSize: 8
    },
    CORN_SEED: {
        name: "Corn Seed", icon: "🌱", typeLabel: "Seed", description: "Kernel seed to plant corn.", decayRate: 0.1, seedType: "corn_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 113, tileset: "cropTileset", maxStack: 64
    },
    PINEAPPLE_ITEM: {
        name: "Pineapple", decayRate: 0.8, seedType: "pineapple_item", 
        baseHealth: 40, baseVirulence: 0, baseFertility: 30, spriteID: 48, tileset: "cropTileset",
        maxStack: 8, drawSize: 8
    },
    PINEAPPLE_SEED: {
        name: "Pineapple Crown", decayRate: 0.1, seedType: "pineapple_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 1, tileset: "gardenTileset",
        maxStack: 64
    },
    POTATO_ITEM: {
        name: "Potato", decayRate: 0.8, seedType: "potato_item", 
        baseHealth: 30, baseVirulence: 0, baseFertility: 25, spriteID: 84, tileset: "cropTileset",
        maxStack: 8, drawSize: 4
    },
    POTATO_SEED: {
        name: "Potato Eye", decayRate: 0.1, seedType: "potato_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 2, tileset: "gardenTileset",
        maxStack: 64
    },
    WHEAT_ITEM: {
        name: "Wheat", decayRate: 0.8, seedType: "wheat_item", 
        baseHealth: 20, baseVirulence: 0, baseFertility: 10, spriteID: 168, tileset: "gardenTileset",
        maxStack: 8
    },
    WHEAT_SEED: {
        name: "Wheat Seed", decayRate: 0.1, seedType: "wheat_seed", 
        baseHealth: 10, baseVirulence: 0, baseFertility: 5, spriteID: 65, tileset: "cropTileset",
        maxStack: 64
    },

    // ==========================================
    // 🐓 ANIMAL PRODUCTS (FARMS & PASTORAL)
    // ==========================================
    EGG: {
        name: "Farm Egg", icon: "🥚", typeLabel: "Food",
        description: "A fresh farm-harvested chicken egg.", energy: 20,
        decayRate: 0.8, seedType: "egg", baseHealth: 30, baseVirulence: 0, baseFertility: 15,
        spriteID: 60, tileset: "foodTileset", maxStack: 8, drawSize: 4
    },
    RAW_CHICKEN: { 
        name: "Raw Chicken", icon: "🍗", typeLabel: "Food",
        description: "Unprepared raw poultry meat. Needs cooking.", energy: 15,
        decayRate: 1.5, seedType: "raw_chicken", baseHealth: 50, baseVirulence: 10, baseFertility: 100, 
        spriteID: 15, tileset: "foodTileset", maxStack: 8, drawSize: 8 
    },
    CHICKEN_POOP: {
        name: "Chicken Poop", icon: "💩", typeLabel: "Compost",
        description: "Organic chicken manure, perfect for quick fertilizer.", 
        decayRate: 1.0, seedType: "chicken_poop", baseHealth: 3, baseVirulence: 12, baseFertility: 14,
        spriteID: 0, tileset: "transparentTileset", maxStack: 8, drawSize: 4
    },
    HAY: {
        name: "Dried Hay", icon: "🌾", typeLabel: "Fodder",
        description: "Dehydrated grass bundle used to feed chickens.", 
        seedType: "hay", spriteID: 168, tileset: "gardenTileset", isFodder: true,
        baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 16
    },

    // ==========================================
    // 🗡️ EQUIPMENT & UTILITIES
    // ==========================================
    KEY: {
        name: "House Key", icon: "🔑", typeLabel: "Utility",
        description: "Unlocks and controls access doors to linked structures.", 
        seedType: "key", spriteID: 38, tileset: "keyTileset", isKey: true,
        baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 4
    },
    DAGGER: {
        name: "Rusty Dagger", icon: "🗡️", typeLabel: "Weapon",
        description: "A rusty blade that adds +5 ATK damage when equipped.", 
        seedType: "weapon_dagger", spriteID: 0, tileset: "weaponTileset", isWeapon: true,
        ad: 5, baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 8, hilt: { x: 5, y: 10 }
    },
    PICKAXE: {
        name: "Miner's Pickaxe", icon: "⛏️", typeLabel: "Weapon",
        description: "Grants ability to mine and fracture local iron ore veins.", 
        seedType: "tool_pickaxe", spriteID: 69, tileset: "transparentTileset", isWeapon: true,
        ad: 3, baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 8, hilt: { x: 4, y: 11 }
    },

    // ==========================================
    // 🪨 ORES & RESOURCES
    // ==========================================
    IRON_ORE: {
        name: "Iron Ore", icon: "🪨", typeLabel: "Resource",
        description: "Raw iron compound chunk gathered from mountain mining camps.", 
        seedType: "iron_ore", spriteID: 32, tileset: "craftingTileset",
        baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 8
    },
    IRON_INGOT: {
        name: "Iron Ingot", icon: "🧱", typeLabel: "Resource",
        description: "Purified metal slab smelted from iron ores.", 
        seedType: "iron_ingot", spriteID: 36, tileset: "craftingTileset",
        baseHealth: 100, baseVirulence: 0, baseFertility: 0, drawSize: 8
    },
    GOLD_ORE: {
        name: "Gold Ore", icon: "🪨", typeLabel: "Resource",
        description: "High density raw gold cluster.", 
        seedType: "ore", spriteID: 29, baseHealth: 100, baseVirulence: 0, baseFertility: 0
    },
    GOLD_COIN: {
        name: "Gold Coin", icon: "💰", typeLabel: "Currency",
        description: "A shining coin minted from gold ores.", 
        seedType: "coin", spriteID: 31, isCurrency: true, baseHealth: 100, baseVirulence: 0, baseFertility: 0
    }
};

export function createItem(template) {
    if (!template) return null;
    return {
        ...template,
        health: template.baseHealth,
        virulence: template.baseVirulence || 0,
        fertility: template.baseFertility || 0,
        count: 1,
        maxStack: template.maxStack || 1,
        timestamp: Date.now() 
    };
}