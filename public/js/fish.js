// js/fish.js
import { ITEM_TYPES, createItem } from './items.js';

export let globalFishCount = 100;
const MAX_FISH = 10000;

// Updates the global count (Breeding logic)
export function updateGlobalPopulation(modifier) {
    if (globalFishCount < MAX_FISH) {
        globalFishCount += 0.5 * modifier; // Regens ~1 fish every 2 seconds
    }
}

// Logic: Higher scarcity = Higher wait time
export function getWaitModifier() {
    const density = globalFishCount / MAX_FISH;
    return 1.0 / Math.max(0.1, density); // Caps at 10x wait time if empty
}

// Decides WHAT you catch based on the current population
export function getRandomFish() {
    globalFishCount = Math.max(0, globalFishCount - 1);
    
    const density = globalFishCount / MAX_FISH;
    const roll = Math.random();

    // Rarity Scarcity: Legendaries (roll < 0.05) disappear first as density drops
    if (roll < 0.05 * density) {
        return createItem(ITEM_TYPES.BASS); 
    }
    return createItem(ITEM_TYPES.BASS);
}
