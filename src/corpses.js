// src/corpses.js
export const corpses = new Map();

/**
 * Spawns a physical lootable corpse in the world
 */
export function spawnCorpse(x, y, name, inventory, isPlayer = false) {
    const id = 'corpse_' + Math.random().toString(36).substr(2, 9);
    const tileX = Math.floor(x / 16);
    const tileY = Math.floor(y / 16);

    const newCorpse = {
        id,
        name: name || (isPlayer ? "Fallen Hero" : "Dead Hobbit"),
        x: tileX * 16,
        y: tileY * 16,
        tileX,
        tileY,
        inventory: inventory ? [...inventory] : [],
        isPlayer,
        timestamp: Date.now(),
        decayTime: Date.now() + (10 * 60 * 1000) // Corpses decay after 10 mins
    };

    corpses.set(id, newCorpse);
    console.log(`💀 Corpse spawned at [${tileX}, ${tileY}] (${newCorpse.inventory.length} items)`);
    return newCorpse;
}

export function getCorpseAt(tx, ty) {
    for (const [id, corpse] of corpses) {
        if (corpse.tileX === tx && corpse.tileY === ty && corpse.inventory.length > 0) {
            return corpse;
        }
    }
    return null;
}