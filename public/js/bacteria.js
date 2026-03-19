
// js/bacteria.js
import { CONFIG } from './config.js';
import { hero } from './entities.js';
import { plants } from './plants.js';
import { ITEM_TYPES } from './items.js';
import { socket } from './multiplayer.js'; // Import your socket connection 

const bacteriaCells = new Map();

const BACTERIA_TYPES = {
    "organic_drop": 1, // Fish / Meat
    "fish":         1,
    "organic_plant": 2, // Living Grass (The Anchor)
    "grass":        2,
    "grass_item":   3, // 🆕 Uprooted Grass (The Slow Burn)
    "chicken_poop": 4,
    "cooked_fish": 5

};



// --- 🆕 MULTIPLAYER HOOK: Receive remote updates ---
export function handleRemoteTileUpdate(data) {
    const { gx, gy, traits } = data;
    const { data: chunkData, idx } = getBacteriaData(gx, gy);
    
    // Force the local tile to match what the other player saw
    chunkData[idx] = traits;
}


/**
 * NEW: Exported helper so the console logger in game.js can read the data
 */
export function getBacteriaData(gx, gy) {
    const cx = Math.floor(gx / CONFIG.CELL_SIZE);
    const cy = Math.floor(gy / CONFIG.CELL_SIZE);
    const lx = ((gx % CONFIG.CELL_SIZE) + CONFIG.CELL_SIZE) % CONFIG.CELL_SIZE;
    const ly = ((gy % CONFIG.CELL_SIZE) + CONFIG.CELL_SIZE) % CONFIG.CELL_SIZE;

    const cellKey = `${cx}_${cy}`;
    if (!bacteriaCells.has(cellKey)) {
        bacteriaCells.set(cellKey, new Uint32Array(CONFIG.CELL_SIZE * CONFIG.CELL_SIZE));
    }
    
    const data = bacteriaCells.get(cellKey);
    const idx = (ly * CONFIG.CELL_SIZE) + lx;
    return { data, idx };
}

/**
 * Added worldMatrix parameter so it can be passed to the infection check
 */


export function updateBacteria(worldMatrix, fertilityMatrix) {
    const heroGTX = Math.floor(hero.x / CONFIG.TILE_SIZE);
    const heroGTY = Math.floor(hero.y / CONFIG.TILE_SIZE);
    const heroCX = Math.floor(heroGTX / CONFIG.CELL_SIZE);
    const heroCY = Math.floor(heroGTY / CONFIG.CELL_SIZE);

    // --- PROOF LOG 1: Is this function even being called? ---
    if (Math.random() > 0.95) { 
        console.log(`📡 updateBacteria TICK | Hero Chunk: [${heroCX}, ${heroCY}]`);
    }

    for (let offsetX = -2; offsetX <= 2; offsetX++) {
        for (let offsetY = -2; offsetY <= 2; offsetY++) {
            const targetCX = heroCX + offsetX;
            const targetCY = heroCY + offsetY;
            
            // --- PROOF LOG 2: Is the '100' limit blocking the call? ---
            if (targetCX >= 0 && targetCX < 100 && targetCY >= 0 && targetCY < 100) {
                processCellSpread(targetCX, targetCY, worldMatrix, fertilityMatrix);
            } else {
                // This fires if you move past tile 10,000 (Chunk 100)
                if (Math.random() > 0.99) {
                    console.warn(`🚫 BLOCK: Chunk [${targetCX}, ${targetCY}] is out of the 100-chunk limit!`);
                }
            }
        }
    }
}

    

/*
export function updateBacteria(worldMatrix) {
    // TEMPORARY: Tick every cell that has bacteria in it
    // This ignores the hero's position for the test
    for (const [cellKey, data] of bacteriaCells) {
        const coords = cellKey.split('_');
        const cx = parseInt(coords[0]);
        const cy = parseInt(coords[1]);
        processCellSpread(cx, cy, worldMatrix);
    }
}
    */
    


// js/bacteria.js

function processCellSpread(cx, cy, worldMatrix, fertilityMatrix) {
    const cellKey = `${cx}_${cy}`;
    const data = bacteriaCells.get(cellKey);

    // --- DYNAMIC PROOF LOG ---
    // This fires for the specific chunk the hero is currently standing in
    const heroTX = Math.floor((hero.x + 8) / 16);
    const heroTY = Math.floor((hero.y + 14) / 16);
    const heroCX = Math.floor(heroTX / 100);
    const heroCY = Math.floor(heroTY / 100);

    if (cx === heroCX && cy === heroCY) {
        if (!data) {
            console.error(`❌ PROOF: Current Chunk [${cx},${cy}] is MISSING from bacteriaCells!`);
        } else {
            // Check if there is actually any non-zero data in this chunk
            const hasData = data.some(t => t !== 0);
            if (!hasData) {
                console.warn(`⚠️ Chunk [${cx},${cy}] exists but is EMPTY (all tiles are 0).`);
            } else {
                // Log this only occasionally so it doesn't spam
                if (Math.random() > 0.99) {
                    console.log(`✅ Chunk [${cx},${cy}] active. Simulating ${data.length} tiles.`);
                }
            }
        }
    }
    // -------------------------

    if (!data) return;

    for (let i = 0; i < 10000; i++) {
        const idx = Math.floor(Math.random() * 10000);
        let traits = data[idx];
        if (traits === 0) continue;

        let h = traits & 0xFF;
        let v = (traits >> 8) & 0xFF;
        let r = (traits >> 16) & 0x0F;
        let typeID = (traits >> 20) & 0x0F;
        let hasPeaked = (traits >>> 31);

        if (h > 0 || v > 0) {
            // --- HOST SPECIFIC EVOLUTION ---
// js/bacteria.js -> Inside processCellSpread()

if (typeID === 5) { 
    if (h > 0) {
        // 🛡️ THE FIX: 30% chance to drop by a WHOLE number
        if (Math.random() < 0.3) {
           h = Math.max(0, h - 1); 
        }
        
    } else if (!hasPeaked) {
        // STAGE 2A: ROTTING (Ramping Up Virulence)
        // Renderer: If h <= 0 and v < 50, draw Tile 58
        v += 2;
        if (v >= 50) {
            v = 50;
            hasPeaked = 1; // Set bit 31 so we know to start the taper
        }
    } 
    else if (v > 10) {
        // STAGE 2B: ROTTING (Tapering Off Virulence)
        // Renderer: If h <= 0 and v > 10, draw Tile 58
        v = Math.max(10, v - 2); 
    } 
    else {
        // STAGE 3: BONES (Desiccated)
        // Renderer: If h <= 0 and v <= 10, draw Tile 59
        // Slowly bleed off the last of the virulence until the tile disappears
        v = Math.max(0, v - 1); 
    }
} 

if (typeID === 4) { 
    if (h > 0) {
        // 🛡️ THE FIX: 10% chance to drop by a WHOLE number
        if (Math.random() < 0.1) {
           h = Math.max(0, h - 1); 
        }
        
    } else {
        // 🛡️ THE FIX: 10% chance to drop by a WHOLE number
        if (Math.random() < 0.1) {
            v = Math.max(0, v - 1); 
        }
    }
} 
else if (typeID === 3) { 
    // --- UPROOTED GRASS: The "Compost" Lifecycle ---
    
    if (h > 0) {
        // STAGE 1: FRESH (Stays green, slowly drying out)
        // Note: Using 12 as your new max health base
        // 🛡️ THE FIX: 10% chance to drop by a WHOLE number
        if (Math.random() < 0.1) {
           h = Math.max(0, h - 1); 
        }
        
    } 
    else if (!hasPeaked) {
        // STAGE 2: MOLDING (Climbing to the peak of 8)
        // 🛡️ THE FIX: 10% chance to up by a WHOLE number
        if (Math.random() < 0.1) {
            v += 1; 
        }
        if (v >= 8) {
            v = 8;
            hasPeaked = 1; // Flip the bit 31 flag to start the fall
        }
    } 
    else {
        // STAGE 3: MULCHING (Fading away into the soil)
        // 🛡️ THE FIX: 10% chance to drop by a WHOLE number
        if (Math.random() < 0.1) {
            v = Math.max(0, v - 1); 
        }
    }
}


else if (typeID === 2) { 
    // PLANT: Immortal Hive
    //h = 12; 
    if (v > 0 && v < 50 && Math.random() < 0.1) v += 1; 
} 
else if (typeID === 1) { 
    // FISH: 3-Stage Lifecycle (Fresh -> Rotting -> Bones)

    if (h > 0) {
        // STAGE 1: FRESH (Losing Health)
        // Renderer: If h > 0, draw Tile 57
        h = Math.max(0, h - 1); 
    } 
    else if (!hasPeaked) {
        // STAGE 2A: ROTTING (Ramping Up Virulence)
        // Renderer: If h <= 0 and v < 50, draw Tile 58
        v += 2;
        if (v >= 50) {
            v = 50;
            hasPeaked = 1; // Set bit 31 so we know to start the taper
        }
    } 
    else if (v > 10) {
        // STAGE 2B: ROTTING (Tapering Off Virulence)
        // Renderer: If h <= 0 and v > 10, draw Tile 58
        v = Math.max(10, v - 2); 
    } 
    else {
        // STAGE 3: BONES (Desiccated)
        // Renderer: If h <= 0 and v <= 10, draw Tile 59
        // Slowly bleed off the last of the virulence until the tile disappears
        v = Math.max(0, v - 1); 
    }
} 
else {
    // SURFACE (Type 0): Instant Wipe
    // Triggers your "Final Breath" cascade logic
    v = 0; 
}



            if (h === 0 && v === 0) {
                 // If the tile WAS something and is now NOTHING, tell the server
    if (data[idx] !== 0) {
        data[idx] = 0; // Wipe locally
        
        // 🛰️ SYNC: Tell others this tile is now empty
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('syncTile', {
                gx: (cx * 100) + (idx % 100),
                gy: (cy * 100) + Math.floor(idx / 100),
                traits: 0
            });
        }
    }
} else {
    // 2. PACK the new traits
    const newTraits = ((Math.floor(h) & 0xFF) | 
                      ((Math.floor(v) & 0xFF) << 8) | 
                      ((r & 0x0F) << 16) | 
                      ((typeID & 0x0F) << 20) | 
                      (hasPeaked ? 0x80000000 : 0)) >>> 0;

    // 3. TRANSFORM CHECK (Major State Change)
    // We only sync if the "Type" changed or if "hasPeaked" just flipped.
    // This prevents 60fps network spam while still keeping players synced.
    const oldTraits = data[idx];
    const oldHasPeaked = (oldTraits >>> 31);
    
    data[idx] = newTraits; // Save locally

    if ((hasPeaked !== oldHasPeaked) && typeof socket !== 'undefined' && socket) {
        socket.emit('syncTile', {
            gx: (cx * 100) + (idx % 100),
            gy: (cy * 100) + Math.floor(idx / 100),
            traits: newTraits
        });
    }

    // --- 🆕 FERTILIZATION LOGIC ---
            // If the item is rotting (v > 0), leak fertility into the soil
            // Inside js/bacteria.js -> processCellSpread()

if (h === 0) {
    const lx = idx % 100;
    const ly = Math.floor(idx / 100);
    
    // 1. DYNAMIC LOOKUP
    let bFert = 0;

    if (typeID === 1) { 
        // FISH (BASS)
        bFert = ITEM_TYPES.BASS.baseFertility; // 60
    } 
    else if (typeID === 3) { 
        // UPROOTED GRASS
        bFert = ITEM_TYPES.UPROOTED_GRASS.baseFertility; // 100
    }
    else if (typeID === 4) { 
        // CHICKEN POOP
        bFert = ITEM_TYPES.CHICKEN_POOP.baseFertility; // 100
    }

    else if (typeID === 5) { 
        // COOKED FISH
        bFert = ITEM_TYPES.COOKED_BASS.baseFertility; // 100
    }

    // 2. CALCULATE LEAK
    // Scaling by 400 means: 100 fertility = 0.25 leak per tick
    // Scaling by 400 means: 60 fertility = 0.15 leak per tick
    const nutrientLeak = bFert / 400;

    // 3. APPLY TO SOIL
    const cell = fertilityMatrix[cx][cy];
    if (cell[lx] && cell[lx][ly] !== undefined) {
        let currentF = cell[lx][ly];
        if (currentF < 255) {
            cell[lx][ly] = Math.min(255, currentF + nutrientLeak);
        }
    }



    // 3. Apply to the soil
    let currentF = fertilityMatrix[cx][cy][lx][ly];
    if (currentF < 255) {
        // Add the leak, capped at the max of 255
        fertilityMatrix[cx][cy][lx][ly] = Math.min(255, currentF + nutrientLeak);
    }
            }

                if (v > 5 || (h === 0 && traits > 0 && typeID === 0)) {
                    if (Math.random() > 0.9) {
                        const curGX = (cx * 100) + (idx % 100);
                        const curGY = (cy * 100) + Math.floor(idx / 100);
                        const jumpX = Math.floor(curGX + (Math.random() * (r * 2 + 1)) - r);
                        const jumpY = Math.floor(curGY + (Math.random() * (r * 2 + 1)) - r);

                        // 🚩 ADD THIS LOG:
    if (v > 0) {
        console.log(`🚀 JUMP ATTEMPT: From [${curGX},${curGY}] to [${jumpX},${jumpY}] with Range: ${r}`);
    }

                        
                        attemptInfection(jumpX, jumpY, traits, worldMatrix);
                    }
                }
            }
        }
    }

    // js/bacteria.js -> End of processCellSpread

    // ... (after the 10,000 loop) ...

    // NEW: "Deep Clean" - Flush dead data while keeping the Plants/Active Fish
    if (Math.random() > 0.9) { // Run very rarely (1 in 10 ticks)
        let activeCount = 0;
        for (let j = 0; j < data.length; j++) {
            if (data[j] === 0) continue;

            // Check if it's a "Ghost" (0 health and 0 virulence)
            const tempH = data[j] & 0xFF;
            const tempV = (data[j] >> 8) & 0xFF;
            
            if (tempH === 0 && tempV === 0) {
                data[j] = 0; // Final wipe of the ghost
            } else {
                activeCount++;
            }
        }

        // Only delete the chunk if its empty (unlikely but possible)
        if (activeCount === 0) {
            bacteriaCells.delete(cellKey);
            console.log(`🧹 DEEP CLEAN: Chunk [${cx}, ${cy}] was purely ghosts and is now removed.`);
        }
    }


}










export function attemptInfection(gx, gy, attackerTraits, worldMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const plantKey = `${ix}_${iy}`; // 👈 Helper for the Map lookup

    if (cx < 0 || cx >= 100 || cy < 0 || cy >= 100) return;
    if (!worldMatrix[cx] || !worldMatrix[cx][cy]) return;
    
    const groundTileID = worldMatrix[cx][cy][lx][ly];
    if (groundTileID !== 63) return;  

    const cellKey = `${cx}_${cy}`;
    if (!bacteriaCells.has(cellKey)) {
        bacteriaCells.set(cellKey, new Uint32Array(10000));
    }
    const data = bacteriaCells.get(cellKey);
    const idx = (ly * 100) + lx;
    const defenderTraits = data[idx];

    // 4. UNPACK DNA
    const aVir = (attackerTraits >> 8) & 0xFF;
    const aRange = (attackerTraits >> 16) & 0x0F;
    const aHealth = attackerTraits & 0xFF;

    let dTypeID = (defenderTraits >> 20) & 0x0F;
    let dHealth = defenderTraits & 0xFF;
    let dVir    = (defenderTraits >> 8) & 0xFF;
    let dPeak   = (defenderTraits >>> 31);

    // 5. INITIAL IDENTITY CHECK (Sync dHealth with the existing Plant if found)
    if (defenderTraits === 0) {
        const existingPlant = plants.get(plantKey);
        if (existingPlant) {
            dTypeID = 2;   
            dHealth = existingPlant.health; // 👈 Start with the plant's actual current HP
        } else {
            dTypeID = 0;   
            dHealth = 0;   
        }
        dVir = 0;
        dPeak = 0;
    }

    // 6. CALCULATE STRENGTH & DAMAGE
    const infectionStrength = Math.floor(aVir * 0.20);
    
    if (aHealth === 0 && dTypeID !== 0) {
        dHealth = Math.max(0, dHealth - infectionStrength);

        // --- 🆕 SYNC TO UI ---
        // We update the health inside the plant object so ctx3 sees it!
        const targetPlant = plants.get(plantKey);
        if (targetPlant) {
            targetPlant.health = dHealth;
        }
    }

    // Spread virulence and update range
    let newVir = Math.min(255, dVir + infectionStrength);
    const newRange = Math.max(aRange, (defenderTraits >> 16) & 0x0F);

    // --- 🆕 THE TRANSFORMATION LOGIC ---
    if (dTypeID === 2 && dHealth === 0) {
        dTypeID = 3;
        plants.delete(plantKey); 
        console.log(`💀 Plant at [${ix},${iy}] withered into rotting mulch.`);
    }

    // 7. REPACK AND SAVE
    data[idx] = ((Math.floor(dHealth) & 0xFF) | 
                ((newVir & 0xFF) << 8) | 
                ((newRange & 0x0F) << 16) | 
                ((dTypeID & 0x0F) << 20) | 
                (dPeak << 31)) >>> 0;
}




/**
 * Seeds a specific tile with bacteria traits.
 * Now uses the BACTERIA_TYPES registry for scalability.
 */
// Add 'isRemote = false' to the arguments list
export function seedBacteria(gx, gy, typeName, health, virulence, isRemote = false) {
    const { data, idx } = getBacteriaData(gx, gy);
    const typeId = BACTERIA_TYPES[typeName] || 0;
    
    // Default range (you can make this dynamic later)
    let range = 2;

    const packed = (
        (Math.floor(health) & 0xFF) | 
        ((Math.floor(virulence) & 0xFF) << 8) | 
        ((range & 0x0F) << 16) | 
        ((typeId & 0x0F) << 20)
    ) >>> 0;

    data[idx] = packed;

    // 🛡️ THE FIX: Now 'isRemote' is defined!
    // We only tell the server if WE (local) planted this.
    // If it came FROM the server (isRemote = true), we stay quiet.
    if (!isRemote && typeof socket !== 'undefined' && socket) {
        socket.emit('syncTile', { gx, gy, traits: packed });
    }
}



/*
export function seedBacteria(gx, gy, type, customHealth = 255, customVir = 50) {
    const { data, idx } = getBacteriaData(gx, gy);

    // If it's a drop, use the passed values. Otherwise, use defaults.
    let health = (type === "organic_drop") ? customHealth : (type === "probiotic" ? 255 : 0);
    let virulence = (type === "organic_drop") ? customVir : 50; 
    let range = 3;      

    data[idx] = (health & 0xFF) | (virulence << 8) | (range << 16);
    console.log(`🦠 Seeded ${type} at [${gx}, ${gy}] with HP: ${Math.floor(health)}`);
}
*/
