// js/items.js

/**
 * 1. THE LIBRARY: Static definitions for every item type.
 * Use this to set the "starting" values for things.
 */
export const ITEM_TYPES = {
    BASS: {
        name: "River Bass",
        decayRate: 2.0,       // Fast decay
        seedType: "fish",     // Maps to TypeID 1
        baseHealth: 40,
        baseVirulence: 10,
        baseFertility: 100,
        spriteID: 0
    },
    // ... your existing items ...
    COOKED_BASS: {
        name: "Cooked River Bass",
        decayRate: 0.6,       // 3x slower than raw Bass (2.0)
        seedType: "cooked_fish", // It's still organic if dropped
        baseHealth: 60,       // Cooking "resets" and boosts the HP
        baseVirulence: 0,      // Purified by fire
        baseFertility: 80,
        spriteID: 44          // Your new Tile ID
    },
    UPROOTED_GRASS: {
        name: "Uprooted Grass",
        decayRate: 0.5,       // Very slow decay
        seedType: "grass_item", // Maps to TypeID 3
        baseHealth: 12,
        baseVirulence: 2,
        baseFertility: 20,
        spriteID: 36
    },
    CHICKEN_POOP: {
        name: "Chicken Poop",
        decayRate: 1,       // Very slow decay
        seedType: "chicken_poop", // Maps to TypeID 3
        baseHealth: 3,
        baseVirulence: 12,
        baseFertility: 14,
        spriteID: 8
    }
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
        timestamp: Date.now() 
    };
}
