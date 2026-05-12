// js/fish.js
import { ITEM_TYPES, createItem } from './items.js';

export let globalFishCount = 100;
const MAX_FISH = 10000;

// To this:
if (typeof window !== 'undefined') {
    logStep("fish.js");
}

// Updates the global count (Breeding logic)
export function updateGlobalPopulation(modifier) {
    if (globalFishCount < MAX_FISH) {
        globalFishCount += 0.5 * modifier; // Regens ~1 fish every 2 seconds
    }
}

export function getWaitModifier() {
    // Prevent division by zero
    const safeCount = Math.max(1, globalFishCount); 
    
    // THE FIX: Square Root Inverse Scaling
    // 10,000 fish = 1x wait time (~3 seconds)
    // 1,000 fish  = 3.1x wait time (~10 seconds)
    // 100 fish    = 10x wait time (~35 seconds)
    // 10 fish     = 31x wait time (~100 seconds)
    const multiplier = Math.sqrt(MAX_FISH / safeCount);
    
    // Cap the absolute maximum wait time to 30x so the game doesn't break
    return Math.min(30.0, multiplier); 
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
