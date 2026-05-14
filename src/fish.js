// src/fish.js
import { ITEM_TYPES, createItem } from './items.js';

if (typeof window !== 'undefined') {
    logStep("fish.js loaded");
}

export let globalFishCount = 100; // Starting low to show off scarcity!
const MAX_FISH = 10000;

export function updateGlobalPopulation(modifier) {
    if (globalFishCount < MAX_FISH) {
        // Regenerates ~1 fish every 2 seconds
        globalFishCount += 0.5 * modifier; 
    }
}

export function getWaitModifier() {
    // Prevent division by zero
    const safeCount = Math.max(1, globalFishCount); 
    
    // Square Root Inverse Scaling:
    // 10,000 fish = 1x wait time (~3s)
    // 100 fish    = 10x wait time (~30s)
    const multiplier = Math.sqrt(MAX_FISH / safeCount);
    
    // Cap the absolute maximum wait time to 30x
    return Math.min(30.0, multiplier); 
}

export function getRandomFish() {
    // Remove 1 fish from the global pool
    globalFishCount = Math.max(0, globalFishCount - 1);
    
    // Exciting Loot Table RNG (0 to 100)
    const roll = Math.random() * 100;

    if (roll < 0.5) return createItem(ITEM_TYPES.MUSKELLUNGE);    // 0.5% Legendary
    if (roll < 1.5) return createItem(ITEM_TYPES.GIANT_TREVALLY); // 1.0%
    if (roll < 3.5) return createItem(ITEM_TYPES.ANGLERFISH);     // 2.0%
    if (roll < 7.0) return createItem(ITEM_TYPES.OCTOPUS);        // 3.5%
    if (roll < 12.0) return createItem(ITEM_TYPES.SQUID);         // 5.0%
    if (roll < 20.0) return createItem(ITEM_TYPES.EEL);           // 8.0%
    if (roll < 35.0) return createItem(ITEM_TYPES.MACKEREL);      // 15.0%
    if (roll < 60.0) return createItem(ITEM_TYPES.TROUT);         // 25.0%
    if (roll < 80.0) return createItem(ITEM_TYPES.BASS);          // 20.0%
    
    return createItem(ITEM_TYPES.PANFISH);                        // 20.0% Common
}