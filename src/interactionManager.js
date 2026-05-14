
import { hero, getLevelInfo } from './entities.js';
import { getTileData, checkCollision } from './physics.js';
import { ITEM_TYPES, createItem } from './items.js';
// Near the top of src/interactionManager.js
import { updatePlants, createPlant, plants, PLANT_DEFS } from './plants.js';
import { getBacteriaData, seedBacteria, BACTERIA_TYPES } from './bacteria.js';
import { inputState } from './input.js';
import { socket, playerWallet, remotePlayers } from './multiplayer.js';

import { openSmelterMenu, openChestMenu, openTempleMenu, openKitchenMenu, openMapTableMenu, openCellarMenu, openHayTableMenu, openHayStorageMenu, openWithdrawMenu, } from './uiManager.js'; 
import { getObjectAt } from './staticObjects.js';
import { CONFIG } from './config.js'
import { CC_RESTRICT } from './entities.js'; // 👈 Import the restriction masks


// To this:
if (typeof window !== 'undefined') {
    logStep("interactionManager.js");
}


// 🛑 ADD THIS LINE (or add it to your existing combat.js import)
import { findPriorityTarget, currentTarget } from './combat.js';
// js/interactionManager.js
import { getWaitModifier, getRandomFish, globalFishCount } from './fish.js';


// Add this helper to check for keys
function hasKeyForHouse(houseId) {
    return hero.inventory.some(item => item.isKey && item.houseId === houseId);
}

// src/interactionManager.js

// 🎒 SAFE STACKING HELPER
export function giveItemToHero(newItem) {
    if (!newItem) return false;

    // 1. If it's stackable, try to find an existing stack that isn't full
    if (newItem.maxStack > 1) {
        const existing = hero.inventory.find(i => i.seedType === newItem.seedType && i.count < newItem.maxStack);
        if (existing) {
            existing.count++;
            return true;
        }
    }

    // 2. If no stack found (or stack is full), take up a new inventory slot
    if (hero.inventory.length < hero.maxSlots) {
        hero.inventory.push(newItem);
        return true;
    }

    console.log("🎒 Backpack is full!");
    return false; 
}
/**
 * 💡 MAIN ENTRY POINT: Call this in your game loop update()
 */
export function handleInteractions(modifier, worldMatrix, roomMatrix, fertilityMatrix) {
    // 1. Project a target exactly 1 tile in front of the hero's feet
    let interactX = hero.x + 8;
    let interactY = hero.y + 15;

    if (hero.dir.includes('North')) interactY -= 16;
    if (hero.dir.includes('South')) interactY += 16;
    if (hero.dir.includes('West'))  interactX -= 16;
    if (hero.dir.includes('East'))  interactX += 16;

    const tx = Math.floor(interactX / 16);
    const ty = Math.floor(interactY / 16);

    // We don't need fx/fy anymore, just use tx/ty
    let fx = tx, fy = ty;

    // 🆕 THE SURVIVAL MEAL: Consume food on 'C'
    if (inputState.keyC) {
        inputState.keyC = false;
        consumeFood();
    }

    if (inputState.interact || inputState.action) {
        
        // --- THE NEW REGISTRY CHECK ---
        const obj = getObjectAt(tx, ty);
        const target = getTileData(fx * 16, fy * 16, worldMatrix, roomMatrix); // Physical Tile Layer
        
        if (obj) {
            if (obj.type === 'SMELTER') {
                console.log(`🔥 Smelter accessed in House #${obj.houseId}`);
                openSmelterMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // 🆕 THE BEDROLL LOGOUT LOGIC
            if (obj.type === 'BEDROLL') {
                if (confirm("🛌 Do you want to sleep here and safely log out?")) {
                    console.log("Logging off safely...");
                    
                    // 1. Force the server to record our final position and stats
                    if (socket) {
                        socket.emit('updateStats', { 
                            hp: hero.hp, 
                            energy: hero.energy,
                            xp: hero.xp
                        });
                    }

                    // 2. Wait half a second for the emit to finish, then reload
                    setTimeout(() => {
                        window.location.reload(); 
                    }, 500);
                }
                
                inputState.interact = false;
                inputState.action = false;
                return;
            }
// 🆕 UPDATED STORE COUNTER LOGIC
            if (obj.type === 'STORE_COUNTER') {
                if (!playerWallet) {
                    alert("You must connect your wallet to trade at the general store!");
                    return;
                }
                console.log("🏪 Accessing Trade Counter...");
                const storeId = `store_${tx}_${ty}`; 
                
                if (socket) {
                    socket.emit('requestStore', storeId);
                }
                
                inputState.interact = false;
                inputState.action = false;
                return;
            }
            
            // 2. 🆕 UPDATED ROOT CELLAR LOGIC
            if (obj.type === 'FOOD_STORAGE') {
                console.log("🧺 Inspecting the Root Cellar...");
                const cellarId = `cellar_${tx}_${ty}`; 
                
                if (socket) {
                    socket.emit('requestCellar', cellarId);
                }
                
                inputState.interact = false;
                inputState.action = false;
                return;
            }

    // 🆕 UPDATED CHEST LOGIC
            if (obj.type === 'CHEST_STORAGE') {
                console.log("📦 Requesting chest data from server...");
                // Create a unique ID based on the chest's physical coordinates
                const chestId = `chest_${tx}_${ty}`; 
                
                if (socket) {
                    socket.emit('requestChest', chestId);
                }
                
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // 🆕 TEMPLE ALTAR LOGIC
            if (obj.type === 'TEMPLE_ALTAR') {
                console.log("⛩️ Approached the Holy Altar.");
                openTempleMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // 🆕 KITCHEN LOGIC
            if (obj.type === 'KITCHEN') {
                console.log("🍳 Opened the Kitchen.");
                openKitchenMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // 🆕 MAP TABLE LOGIC
            if (obj.type === 'MAP_TABLE') {
                console.log("🗺️ Consulting the Map Table...");
                openMapTableMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // 🆕 HAY TABLE & STORAGE LOGIC
            if (obj.type === 'HAY_TABLE') {
                console.log("🌾 Using the Hay Table.");
                openHayTableMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }
            if (obj.type === 'HAY_STORAGE') {
                console.log("🌾 Inspecting the Hay Storage...");
                const hayStorageId = `hay_${tx}_${ty}`; 
                if (socket) {
                    socket.emit('requestHayStorage', hayStorageId);
                }
                inputState.interact = false;
                inputState.action = false;
                return;
            }

    if (obj.type === 'MILITARY_STORAGE') {
        console.log("🛡️ This rack holds sharpened spears and sturdy leather armor. The town is ready for trouble.");
        inputState.interact = false;
        inputState.action = false;
        return;
    }

 if (obj && obj.type === 'STAIRS_TOGGLE') {
    // Flip between 1 and 2
    hero.floor = (hero.floor === 1) ? 2 : 1;
    
    console.log(`🏠 Switched to Floor ${hero.floor}`);
    
    // Prevent double-clicking
    inputState.interact = false;
    inputState.action = false;
    return;
}


        }

        // js/interactionManager.js -> inside handleInteractions()

// ... inside if (inputState.interact || inputState.action) block ...

// B. PHYSICAL TILE ACTIONS
// Claiming Keys (Updated to include Barn Doors)
if (target && (target.tileID === 49 || target.tileID === 12) && target.roomID !== 0) {
    if (!hasKeyForHouse(target.roomID)) {
        if (hero.inventory.length < hero.maxSlots) {
            const newKey = createItem(ITEM_TYPES.KEY);
            newKey.houseId = target.roomID;
            
            // Dynamic naming based on door type
            const buildingName = (target.tileID === 12) ? "Barn" : "House";
            newKey.name = `Key to ${buildingName} #${target.roomID}`;
            
            giveItemToHero(newKey);
            console.log(`🔑 ${buildingName} #${target.roomID} claimed!`);
            
            inputState.interact = false;
            inputState.action = false;
            return;
        }
    }
}

        // C. MINING LOGIC
        if (target.tileID === 29) {
            if (hero.inventory.length < hero.maxSlots) {
                giveItemToHero(createItem(ITEM_TYPES.GOLD_ORE));
                console.log("⛏️ Mined Gold Ore!");
                inputState.interact = false;
                inputState.action = false;
                return;
            }
        }
    }

    // --- 4. CONTINUOUS STATES (Fishing) ---
    if (hero.isFishing) {
        processFishing(modifier);
        return;
    }

    // --- 5. PICKUP LOGIC (E key only) ---
    if (inputState.interact) {
        const picked = processPickup(tx, ty) || processPickup(fx, fy);
        if (picked) inputState.interact = false;
    }

    // In src/interactionManager.js -> handleInteractions()

    // Inside handleInteractions:
    // --- 6. DROP ITEM (G Key) ---
    if (inputState.drop) {
        inputState.drop = false;
        if (hero.equipment.mainHand) {
            const item = hero.equipment.mainHand;
            
            // Drop exactly 1 tile in front of us
            seedBacteria(tx, ty, item.seedType, item.health, item.virulence);

            item.count--;
            if (item.count <= 0) hero.equipment.mainHand = null;
        }
    }

    // --- 7. PLANT SEED (V Key) ---
    if (inputState.keyV) {
        inputState.keyV = false;
        if (hero.equipment.mainHand) {
            const item = hero.equipment.mainHand;

            if (item.seedType && (item.seedType.includes("_seed") || item.seedType === "potato_item")) {
                const cx = Math.floor(tx / 100); const cy = Math.floor(ty / 100);
                const lx = ((tx % 100) + 100) % 100; const ly = ((ty % 100) + 100) % 100;
                const tileID = worldMatrix[cx]?.[cy]?.[(ly * 100) + lx];
                const roomID = roomMatrix[cx]?.[cy]?.[(ly * 100) + lx] || 0;

                if (tileID === 63 && (roomID === 0 || roomID === 9999) && !plants.has(`${tx}_${ty}`)) {
                    const plantType = item.seedType.replace("_seed", "").replace("_item", "");
                    createPlant(tx, ty, fertilityMatrix, 0, plantType);

                    item.count--;
                    if (item.count <= 0) hero.equipment.mainHand = null;
                    console.log(`🌱 Planted ${plantType}!`);
                }
            } else {
                console.log("❌ You are not holding a seed!");
            }
        }
    }

    // --- 7. RESIDUAL ACTIONS (Cooking/Fishing) ---
    if (inputState.action) {
        processAction(tx, ty, worldMatrix, roomMatrix);
    }
}

// --- Add to src/interactionManager.js ---

export function recalculateStats() {
    // Start with base stats
    hero.ad = hero.baseAd;
    
    // 👇 If holding a weapon, add its damage!
    if (hero.equipment.mainHand && hero.equipment.mainHand.isWeapon) {
        hero.ad += (hero.equipment.mainHand.ad || 0);
    }
    
    // Add Armor stats (for the future!)
    if (hero.equipment.armor) {
        // hero.armor = hero.baseArmor + hero.equipment.armor.def;
    }
// Inside recalculateStats()
    hero.speed = CONFIG.HERO_SPEED;
    if (hero.cc && hero.cc.isSlowed) hero.speed *= 0.5;
    if (hero.buffs && hero.buffs.zephyrSpeedTimer > 0) hero.speed *= 1.30; // 👈 +30% Speed!

    // 🆕 APPLY BULWARK SPEED!
    if (hero.bulwarkTimer > 0) {
        hero.speed *= hero.bulwarkSpeedBonus; 
    }

    // 🆕 Check for Passives!
    hero.passives.hasFever = hero.skills.includes('p10');

    // Tell the server our updated stats/passives
    if (typeof window !== 'undefined') {
        import('./multiplayer.js').then(module => {
            if (module.socket) module.socket.emit('updateStats', { 
                ad: hero.ad, 
                speed: hero.speed,
                passives: hero.passives // 👈 Send passive flags to server!
            });
        });
    }
    
    console.log(`⚔️ Stats Recalculated! AD: ${hero.ad}, SPEED: ${hero.speed}`);
}

// In src/interactionManager.js -> consumeFood()

function consumeFood() {
    if (hero.hp <= 0) return;

    // 🤚 Check the Main Hand
    if (!hero.equipment || !hero.equipment.mainHand) {
        console.log("❌ Equip a food item in your hand first!");
        return;
    }

    const item = hero.equipment.mainHand;

    // 🍱 THE FOOD REGISTRY (Energy restored per item)
    const foodValues = { 
        "cooked_fish": 60,
        "fish_muskellunge": 100, // Legendary food!
        "fish_trevally": 80, "fish_angler": 80, "fish_octopus": 60,
        "fish_squid": 50, "fish_eel": 45, "fish_mackerel": 35,
        "fish_trout": 25, "fish": 20, "fish_panfish": 15,
        "pineapple_item": 50,    // Rare, slow growth
        "eggplant_item": 40,
        "tomato_item": 35,
        "pumpkin_item": 30,
        "watermelon_item": 30,
        "potato_item": 25,
        "corn_item": 25,
        "turnip_item": 20,
        "egg": 20,              // Consistent ranching yield
        "fish": 15,             // Raw fish penalty
        "strawberry_item": 15,   // Small snack
        "wheat_item": 10        // Lowest tier
    };

    if (foodValues[item.seedType] !== undefined) {
        const restoreAmount = foodValues[item.seedType];
        
        // Apply restoration
        hero.energy = Math.min(hero.maxEnergy, hero.energy + restoreAmount);
        console.log(`🍗 Consumed ${item.name}! +${restoreAmount} Energy.`);

        // 🎒 Subtract from stack
        item.count--;
        if (item.count <= 0) {
            hero.equipment.mainHand = null; 
        }

        // Sync stamina to the server
        import('./multiplayer.js').then(m => {
            if (m.socket) m.socket.emit('updateStats', { energy: hero.energy });
        });
        
        // Refresh UI to update the hand slot / inventory count
        import('./uiManager.js').then(m => m.renderTabContent());
    } else {
        console.log(`❌ ${item.name} is not edible!`);
    }
}

// 🗑️ CLEANED UP ACTION PROCESSOR
function processAction(tx, ty, worldMatrix, roomMatrix) {
    // Cooking is now strictly handled by the Kitchen UI, 
    // so the Spacebar action only defaults to Fishing!
    processCasting(tx, ty, worldMatrix, roomMatrix); 
}

/**
 * 🎣 CASTING LOGIC
 */
function processCasting(tx, ty, world, room) {
    let bx = 0, by = 0;
    if (hero.dir === 'North')    by = -1;
    if (hero.dir === 'South')  by = 1;
    if (hero.dir === 'West')  bx = -1;
    if (hero.dir === 'East') bx = 1;

    const target = getTileData((tx + bx) * 16, (ty + by) * 16, world, room);
    if (target.tileID === 17) { // Water
        hero.isFishing = true;
        hero.hasBite = false;
        hero.bobberX = (tx + bx) * 16 + 8;
        hero.bobberY = (ty + by) * 16 + 8;

        // 🆕 THE SCARCITY FIX:
        // Base wait (2-5s) multiplied by the world's scarcity
        const scarcityMod = getWaitModifier();
        hero.fishTimer = (2 + Math.random() * 3) * scarcityMod;
        
        inputState.action = false;
    }
}

/**
 * 🎣 REELING LOGIC
 */
function processFishing(modifier) {
    if (!hero.hasBite) {
        hero.fishTimer -= modifier;
        if (hero.fishTimer <= 0) hero.hasBite = true;
    } else if (inputState.action) {
        if (hero.inventory.length < hero.maxSlots) {
            
            // 🆕 THE SCARCITY FIX:
            // Don't just give a BASS; ask fish.js what we got!
            const caughtFish = getRandomFish();
            giveItemToHero(caughtFish);
            
            console.log(`🎣 Caught a ${caughtFish.name}! World Pop: ${Math.floor(globalFishCount)}`);
        }
        hero.isFishing = false;
        hero.hasBite = false;
        inputState.action = false;
    }
}

function processPickup(tx, ty) {
    // 1. Calculate the exact pixel coordinate of where the player is interacting
    const interactPxX = tx * 16 + 8;
    const interactPxY = ty * 16 + 8;

    // 2. FORGIVING HITBOX: Find the closest plant within 24 pixels (1.5 tiles)
    let closestPlantKey = null;
    let closestDist = 24 * 24; // 24 squared

    for (let [key, plant] of plants) {
        // Find the center pixel of the plant
        const plantPxX = plant.gx * 16 + 8;
        const plantPxY = plant.gy * 16 + 8;
        
        const dx = interactPxX - plantPxX;
        const dy = interactPxY - plantPxY;
        const distSq = (dx * dx) + (dy * dy);

        if (distSq < closestDist) {
            closestDist = distSq;
            closestPlantKey = key;
        }
    }

    // In src/interactionManager.js -> processPickup()

    // 3. IF WE FOUND A PLANT TO PICK UP
    if (closestPlantKey && hero.inventory.length < hero.maxSlots) {
        const plant = plants.get(closestPlantKey);
        
        // 👇 THE FIX: Use the exact same dynamic math as the renderer!
        const stagesArray = PLANT_DEFS[plant.type].stages;
        const maxStageIndex = stagesArray.length - 1;
        
        // E.g. For 4 stages: 100 / 4 = 25. Growth of 75 / 25 = Stage 3 (Mature!)
        const currentVisualStage = Math.floor(plant.growth / (100 / stagesArray.length));
        
        const isMature = currentVisualStage >= maxStageIndex;
        
        if (isMature) {
            if (plant.type === 'turnip') { giveItemToHero(createItem(ITEM_TYPES.TURNIP_ITEM)); } 
            else if (plant.type === 'tomato') { giveItemToHero(createItem(ITEM_TYPES.TOMATO_ITEM)); }
            else if (plant.type === 'eggplant') { giveItemToHero(createItem(ITEM_TYPES.EGGPLANT_ITEM)); }
            else if (plant.type === 'strawberry') { giveItemToHero(createItem(ITEM_TYPES.STRAWBERRY_ITEM)); }
            else if (plant.type === 'pumpkin') { giveItemToHero(createItem(ITEM_TYPES.PUMPKIN_ITEM)); }
            else if (plant.type === 'watermelon') { giveItemToHero(createItem(ITEM_TYPES.WATERMELON_ITEM)); }
            else if (plant.type === 'corn') { giveItemToHero(createItem(ITEM_TYPES.CORN_ITEM)); }
            else if (plant.type === 'pineapple') { giveItemToHero(createItem(ITEM_TYPES.PINEAPPLE_ITEM)); }
            else if (plant.type === 'potato') { giveItemToHero(createItem(ITEM_TYPES.POTATO_ITEM)); }
            else if (plant.type === 'wheat') { giveItemToHero(createItem(ITEM_TYPES.WHEAT_ITEM)); }
            else { giveItemToHero(createItem(ITEM_TYPES.PLANT_MATTER)); }    
            
            // Yield Seeds
            const seedConstName = `${plant.type.toUpperCase()}_SEED`;
            const seedCount = Math.floor(Math.random() * 2) + 1; 
            for (let i = 0; i < seedCount; i++) {
                if (ITEM_TYPES[seedConstName]) giveItemToHero(createItem(ITEM_TYPES[seedConstName]));
            }
            console.log(`🌱 Harvested mature ${plant.type}!`);
        } 
        else {
            // 👇 If picked too early, it's just ruined Plant Matter
            giveItemToHero(createItem(ITEM_TYPES.PLANT_MATTER));
            console.log(`🍂 Harvested immature plant. You got Plant Matter.`);
        }

        // Wipe it from memory and clear the bacteria anchor
        plants.delete(closestPlantKey);
        const bac = getBacteriaData(plant.gx, plant.gy);
        if (bac && bac.data) bac.data[bac.idx] = 0;
        
        return true; 
    }

    // In src/interactionManager.js -> processPickup()

    // 4. IF NO PLANT WAS FOUND, CHECK FOR DROPPED ITEMS (BACTERIA)
    const bac = getBacteriaData(tx, ty);
    const traits = bac ? bac.data[bac.idx] : 0;

    if (traits > 0 && hero.inventory.length < hero.maxSlots) {
        const typeID = (traits >> 20) & 0xFF; 
        
        // 👇 Dynamic Reverse Lookup! Maps ID 25 directly back to "pumpkin_seed"
        const matchedSeedType = Object.keys(BACTERIA_TYPES).find(key => 
            BACTERIA_TYPES[key] === typeID && !['organic_drop', 'organic_plant', 'grass'].includes(key)
        );

        if (matchedSeedType) {
            const template = Object.values(ITEM_TYPES).find(t => t.seedType === matchedSeedType);
            if (template) {
                const item = createItem(template);
                item.health = traits & 0xFF;
                item.virulence = (traits >> 8) & 0xFF;
                
                // If it successfully stacks or finds a slot
                if (giveItemToHero(item)) {
                    bac.data[bac.idx] = 0;
                    return true;
                }
            }
        }
    }
    
    return false; // Nothing was picked up
}

// js/interactionManager.js

export function updateHeroStats(modifier, hero) {

    // 🆕 Tick down ability cooldowns
    for (let i = 0; i < 4; i++) {
        if (hero.cooldowns[i] > 0) {
            hero.cooldowns[i] = Math.max(0, hero.cooldowns[i] - modifier);
        }
    }
    // 1. If we are in "Cooldown" (negative), move back to 0
    if (hero.attackTimer < 0) {
        hero.attackTimer += modifier; 
    } 
    // 2. ONLY subtract if we ARE NOT currently winding up for a punch!
    else if (!hero.isWindingUp) {
        hero.attackTimer = Math.max(0, hero.attackTimer - modifier);
    }

    // 2. 🆕 SURVIVAL: Energy Drain
    if (hero.hp > 0) {
        hero.energy = Math.max(0, hero.energy - (CONFIG.ENERGY_DRAIN_RATE * modifier));
        
        if (hero.energy <= 0) {
            hero.energy = 0;
            hero.hp = 0; // Death by starvation
            console.log("💀 You starved to death! Gather food to survive.");
            
            // Immediately tell server we died from hunger
            if (socket) socket.emit('updateStats', { hp: 0, energy: 0 });
        }
    }

    // 🌟 ASCENSION TIMER TICK
    if (hero.buffs && hero.buffs.isAscended) {
        hero.ascensionTimer -= modifier;
        if (hero.ascensionTimer <= 0) {
            hero.buffs.isAscended = false;
            // Remove the bonus stats, clamping HP so it doesn't drop below 1
            hero.maxHp -= 100;
            hero.hp = Math.max(1, Math.min(hero.hp, hero.maxHp)); 
            hero.armor -= 20;
            hero.mr -= 20;
            console.log("🌟 Ascension ended. Stats normalized.");
            
            // Put p4 back on its massive ultimate cooldown!
            const p4Index = hero.skills.indexOf('p4');
            if (p4Index !== -1) hero.cooldowns[p4Index] = 60.0;
        }
    }

    // --- Inside updateHeroStats() in src/interactionManager.js ---

    // 👼 HEAVEN'S HALO TIMER TICK
    if (hero.buffs && hero.buffs.isInvincible) {
        hero.invincibleTimer -= modifier;
        if (hero.invincibleTimer <= 0) {
            hero.buffs.isInvincible = false;
            console.log("👼 Heaven's Halo faded.");
            if (socket) socket.emit('updateStats', { isInvincible: false });
        }
    }

    // Inside updateHeroStats()
    // 💨 ZEPHYR SPEED BUFF TICK
    if (hero.buffs && hero.buffs.zephyrSpeedTimer > 0) {
        hero.buffs.zephyrSpeedTimer -= modifier;
        if (hero.buffs.zephyrSpeedTimer <= 0) recalculateStats(); 
    }

    // --- Inside updateHeroStats() in src/interactionManager.js ---

    // 🛡️ FLEETING BULWARK TICK
    if (hero.bulwarkTimer > 0) {
        hero.bulwarkTimer -= modifier;
        if (hero.bulwarkTimer <= 0) {
            console.log("🛡️ Fleeting Bulwark faded.");
            // Remove the exact amount of armor/mr we gained
            hero.armor -= hero.bulwarkArmorBonus;
            hero.mr -= hero.bulwarkMrBonus;
            
            hero.bulwarkArmorBonus = 0;
            hero.bulwarkMrBonus = 0;
            hero.bulwarkSpeedBonus = 0;

            recalculateStats(); // Removes the speed buff
            
            if (socket) socket.emit('updateStats', { armor: hero.armor, mr: hero.mr });
        }
    }

    // 1. TICK SLOWS (Soft CC - Kept completely separate!)
    if (hero.slowTimer > 0) {
        hero.slowTimer -= modifier;
        if (hero.slowTimer <= 0) recalculateStats(); 
    }

    // 2. TICK HARD CC & BUILD BITMASK
    let currentMask = 0;
    if (hero.activeCCs) {
        for (let i = hero.activeCCs.length - 1; i >= 0; i--) {
            hero.activeCCs[i].timer -= modifier;
            if (hero.activeCCs[i].timer <= 0) {
                hero.activeCCs.splice(i, 1); 
            } else {
                currentMask |= hero.activeCCs[i].mask; 
            }
        }
    }

    // 3. EVALUATE THE 5 FLAGS DIRECTLY FROM YOUR SPREADSHEET RULES!
    if (hero.ccFlags) {
        hero.ccFlags.canMove = !(currentMask & CC_RESTRICT.MOVE);
        hero.ccFlags.canAttack = !(currentMask & CC_RESTRICT.ATTACK);
        hero.ccFlags.canCastMovement = !(currentMask & CC_RESTRICT.CAST_MOVEMENT);
        hero.ccFlags.canCastNonMovement = !(currentMask & CC_RESTRICT.CAST_NON_MOVEMENT);
        hero.ccFlags.canCleanse = !(currentMask & CC_RESTRICT.CLEANSE);
    }

    // 🔥 UPDATE SPELLS (Projectiles & AoE Zones)
    updateSpells(modifier);

    // 🤖 UPDATE PET AI
    if (hero.pet && hero.pet.active) {
        updatePetAI(modifier, hero.pet);
    }
}



// js/interactionManager.js

// js/interactionManager.js

export function handlePvPCombat(modifier, worldMatrix, roomMatrix, hero, remotePlayers) {

    // 1. RE-SYNC TARGET (Ghost Killer)
    if (hero.target) {
        const liveData = remotePlayers.get(hero.target.id);
        if (liveData) {
            hero.target.x = liveData.x;
            hero.target.y = liveData.y;
            hero.target.hp = liveData.hp; // Keep HP synced too
        } 
    }

    // 0. DEATH & MANUAL OVERRIDE
    if (hero.hp <= 0 || inputState.moveX !== 0 || inputState.moveY !== 0) {
        hero.isAttacking = false;
        hero.target = null;
        hero.isWindingUp = false;
        return; 
    }

    // 2. TARGET SELECTION (Search nearby)
    let targetPlayer = findNearestPlayer(hero, remotePlayers, 200);

    // 3. CLICK-TO-LOCK
    if (inputState.mainBtn && targetPlayer) {
        hero.target = targetPlayer;
        hero.isAttacking = true;
        inputState.mainBtn = false;
    }

    // 4. COMBAT STATE MACHINE
    if (hero.isAttacking && hero.target) {
        const dx = hero.target.x - hero.x;
        const dy = hero.target.y - hero.y;
        const currentDistSq = (dx * dx) + (dy * dy);
        
        const attackRange = hero.attackRange || 24;
        const rangeSq = Math.pow(attackRange, 2);

        // --- PHASE A: CHASE (Simple Step Movement) ---
        if (currentDistSq > rangeSq) {
            hero.isWindingUp = false;
            hero.isMoving = true;

            let moveX = 0;
            let moveY = 0;

            if (dx > 2)      moveX = hero.speed * modifier;
            else if (dx < -2) moveX = -hero.speed * modifier;
            
            if (dy > 2)      moveY = hero.speed * modifier;
            else if (dy < -2) moveY = -hero.speed * modifier;

            // 🛠️ BUG FIX: Replaced the old top-left single-pixel collision check with proper 16x16 feet hitboxes
            const left = 3, right = 12, top = 10, bottom = 15;

            if (moveX !== 0) {
                const nextX = hero.x + moveX;
                const sideToCheck = (moveX < 0) ? nextX + left : nextX + right;
                if (checkCollision(sideToCheck, hero.y + top, worldMatrix, roomMatrix, hero) && 
                    checkCollision(sideToCheck, hero.y + bottom, worldMatrix, roomMatrix, hero)) {
                    hero.x = nextX;
                }
            }

            if (moveY !== 0) {
                const nextY = hero.y + moveY;
                const sideToCheck = (moveY < 0) ? nextY + top : nextY + bottom;
                if (checkCollision(hero.x + left, sideToCheck, worldMatrix, roomMatrix, hero) && 
                    checkCollision(hero.x + right, sideToCheck, worldMatrix, roomMatrix, hero)) {
                    hero.y = nextY;
                }
            }

            // 🛠️ BUG FIX: Renamed Left/Right/Up/Down to East/West/North/South for the new spritesheets
            if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx > 0 ? 'East' : 'West';
            else hero.dir = dy > 0 ? 'South' : 'North';
            
        } 
        // --- PHASE B: WIND-UP & IMPACT ---
        else {
            hero.isMoving = false;

            // Only start the "Shake" if the 2-second cooldown is over
            if (hero.attackTimer >= 0) {
                hero.isWindingUp = true;
                hero.attackTimer += modifier;

                const windUpLimit = 0.3 / (hero.attackSpeed || 1.0);

                if (hero.attackTimer >= windUpLimit) {
                    console.log("👊 IMPACT TRIGGERED!");
                    
                    let finalDamage = hero.ad;

                    if (hero.buffs.vaultEmpowered) {
                        finalDamage += (hero.ad * 0.4); // +40% AD
                        hero.buffs.vaultEmpowered = false; // Consume the buff
                        console.log("✨ Vault Empowered Strike!");
                    }

                    // 2. 🆕 FLUX SHOT EMPOWERMENT
                    if (hero.buffs.fluxShotEmpowered) {
                        finalDamage += (hero.ad * 0.20); // Bonus 20% Physical Damage
                        hero.buffs.fluxShotEmpowered = false;
                        
                        // 28% Physical Flux (Shield based on physical damage dealt)
                        fluxShieldToGain = finalDamage * 0.28;
                        console.log(`💫 Flux Shot! +${fluxShieldToGain.toFixed(1)} Flux Shield`);
                    }


                    // 3. 🔄 UPDATED: AATROX-STYLE 3RD HIT LOGIC
                    if (hero.skills.includes('p2')) {
                        hero.attackCount++;
                        if (hero.attackCount >= 3) {
                            hero.attackCount = 0;
                            if (hero.energy >= 5) {
                                hero.energy -= 5;
                                
                                // (Optional: Keep the low HP reduction if you want, 
                                // or remove it if you dropped that mechanic!)
                                const isLowHp = (hero.hp / hero.maxHp) < 0.5;

                                if (hero.p2_stance === 'blast') {
                                    // 💥 HOLY BLAST: +20% Magic Damage
                                    let bonusDmg = hero.magic * 0.20;
                                    if (isLowHp) bonusDmg *= 0.70; 
                                    
                                    finalDamage += bonusDmg; 
                                    console.log(`💥 HOLY BLAST! +${bonusDmg.toFixed(1)} Magic DMG`);
                                } 
                                else if (hero.p2_stance === 'shield') {
                                    // 🛡️ HOLY SHIELD: 14% Flux (Shield based on the Total Damage dealt)
                                    let fluxPercent = 0.14;
                                    if (isLowHp) fluxPercent *= 0.70;

                                    const bonusShield = finalDamage * fluxPercent;
                                    
                                    // Add to our running flux total for this swing
                                    fluxShieldToGain += bonusShield;
                                    console.log(`🛡️ HOLY SHIELD! +${bonusShield.toFixed(1)} Flux Shield`);
                                }
                            }
                        }
                    }

                    // Apply Damage to Target
                    applyPlayerDamage(hero.target, finalDamage);
                    
                    // 4. APPLY ALL FLUX SHIELDS TO SELF (Flux Shot + Holy Shield)
                    if (fluxShieldToGain > 0) {
                        hero.shield += fluxShieldToGain;
                        // Sync our new shield to the server immediately!
                        if (socket) socket.emit('updateStats', { shield: hero.shield });
                    }
                    
                    hero.isWindingUp = false;      
                    hero.attackTimer = -1.7;
                    
                    if (hero.target && hero.target.hp <= 0) {
                        console.log("its 0");
                        hero.isAttacking = false;
                        hero.target = null;
                    }
                }
            } else {
                // If we are still in the 1.7s cooldown, don't shake
                hero.isWindingUp = false;
            }
        }
    }
    else if (hero.isAttacking && !hero.target) {
        // PROOF LOG 4: Target was lost but 'isAttacking' flag is still true
        console.error("❌ STATE ERROR: isAttacking is true but target is null!");
        hero.isAttacking = false;
    }
}




function applyPlayerDamage(target, damage) {
    // 1. Send hit to server
    if (socket) {
        socket.emit('pvpAttack', {
            targetId: target.id,
            damage: damage
        });
    }

    console.log(`⚔️ PvP HIT sent! Waiting for server truth...`);

    // ❌ REMOVED: target.hp = Math.max(0, target.hp - damage);
    // ❌ REMOVED: if (target.hp <= 0) { ... }
    
    // THE NEW LOGIC: 
    // We let the 'playerHit' listener in multiplayer.js 
    // handle the HP update and the death check.
}


function findNearestPlayer(hero, remotePlayers, range) {
    let nearest = null;
    let minDist = range;

    remotePlayers.forEach((p) => {
        const dx = p.x - hero.x;
        const dy = p.y - hero.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
            minDist = dist;
            nearest = p;
        }
    });

    return nearest;
}

export function upgradeStat(statName) {
    const info = getLevelInfo(hero.xp);
    const spentPoints = (hero.spentPoints || 0);
    
    if (info.points - spentPoints <= 0) return; // No points left

    switch(statName) {
        case 'hp':
            hero.maxHp += 10;
            hero.hp += 10; // Heal them for the gain
            break;
        case 'speed':
            hero.speed += 10;
            break;
        case 'ad':
            hero.ad += 1;
        case 'armor':
            hero.armor += 1;
        case 'mr':
            hero.mr += 1;
        case 'magic':
            hero.magic += 1;
            break;
    }

    hero.spentPoints = spentPoints + 1;
    
    // Sync the new stats to the server
    socket.emit('updateStats', {

        xp: hero.xp, // 👈 THE SERVER NEEDS THIS
        
        maxHp: hero.maxHp,
        ad: hero.ad,
        armor: hero.armor,
        magic: hero.magic,
        mr: hero.mr,
        speed: hero.speed
    });
}



// --- 3. Add this new function at the bottom of the file ---
function updateSpells(modifier) {
    // 1. Move Projectiles
    for (let i = hero.projectiles.length - 1; i >= 0; i--) {
        let p = hero.projectiles[i];
        p.x += p.dx * p.speed * modifier;
        p.y += p.dy * p.speed * modifier;
        p.life -= modifier;

        if (p.life <= 0) {
            console.log("💥 Lion's Breath Exploded!");
            // A. Burst Heal
            applyAoEHeal(p.x, p.y, 40, p.healTick);
            
            // B. Spawn Persistent Scorched Earth
            hero.aoeZones.push({
                x: p.x, y: p.y,
                radius: 40,
                life: 4.0, // Lasts 4 seconds
                tickTimer: 0,
                healAmount: hero.magic * 0.1 // Small heal over time
            });
            hero.projectiles.splice(i, 1);
        }
    }

    // 2. Tick AoE Zones
    for (let i = hero.aoeZones.length - 1; i >= 0; i--) {
        let z = hero.aoeZones[i];
        z.life -= modifier;

        // 🌟 RADIANT NOVA LOGIC
        if (z.type === 'radiantNova') {
            if (z.life <= 0) {
                console.log("🌠 Radiant Nova Detonated!");
                if (socket) socket.emit('abilityAoE', { type: 'radiantNovaExplosion', x: z.x, y: z.y, radius: z.radius, damage: z.damage });
                hero.aoeZones.splice(i, 1);
            }
            continue; // 👈 This skips the healing logic below and moves to the next zone!
        }

        // 🌟 CONSECRATION LOGIC
        if (z.type === 'consecration') {
            z.tickTimer -= modifier;
            if (z.tickTimer <= 0) {
                // Tell the server to deal damage in this area!
                if (socket) {
                    socket.emit('abilityAoE', { 
                        type: 'consecrationTick', 
                        x: z.x, 
                        y: z.y, 
                        radius: z.radius, 
                        damage: z.damage 
                    });
                }
                z.tickTimer = 1.0; // Reset timer for the next second
            }
            if (z.life <= 0) hero.aoeZones.splice(i, 1);
            continue; 
        }

        // 🔥 LION'S BREATH (HEALING ZONE) LOGIC
        z.tickTimer -= modifier;
        if (z.tickTimer <= 0) {
            applyAoEHeal(z.x, z.y, z.radius, z.healAmount);
            z.tickTimer = 1.0; // Apply heal every 1 second
        }

        // Clean up healing zones when they expire
        if (z.life <= 0) {
            hero.aoeZones.splice(i, 1);
        }
    }
}

function applyAoEHeal(x, y, radius, amount) {
    // Heal Self
    const dx = (hero.x + 8) - x;
    const dy = (hero.y + 8) - y;
    if (dx * dx + dy * dy <= radius * radius) {
        hero.hp = Math.min(hero.maxHp, hero.hp + amount);
        if (socket) socket.emit('updateStats', { hp: hero.hp });
    }
    
    // Heal Allies (Currently heals all remote players in radius)
    remotePlayers.forEach((p, id) => {
        const pdx = (p.x + 8) - x;
        const pdy = (p.y + 8) - y;
        if (pdx * pdx + pdy * pdy <= radius * radius) {
            if (socket) socket.emit('healPlayer', { targetId: id, amount: amount });
        }
    });
}

// --- Add to the bottom of src/interactionManager.js ---
function updatePetAI(modifier, pet) {
    pet.life -= modifier;
    
    // 💀 DEATH / EXPIRE LOGIC
    if (pet.life <= 0 || pet.hp <= 0) {
        pet.active = false;
        console.log("🤖 Zenith Guardian departed.");
        
        // 👇 TRIGGER THE MASSIVE COOLDOWN HERE!
        // Find which slot holds p16 and set it to 120 seconds
        const p16Index = hero.skills.indexOf('p16');
        if (p16Index !== -1) {
            hero.cooldowns[p16Index] = 120.0; 
        }

        return; // Exit the loop, pet is dead!
    }

    // 1. LAY ON HANDS (Auto-Heal Owner)
    pet.healTimer -= modifier;
    if (pet.healTimer <= 0) {
        const healAmount = hero.magic * 0.20;
        hero.hp = Math.min(hero.maxHp, hero.hp + healAmount);
        console.log(`🤲 Guardian Healed you for ${healAmount}!`);
        if (socket) socket.emit('updateStats', { hp: hero.hp });
        pet.healTimer = 10.0; // Lay on hands has a 10s internal CD
    }

    // 2. MOVEMENT & TARGETING
    let targetX = hero.x + 8;
    let targetY = hero.y + 8;
    let isAttacking = false;
    let enemyTarget = null;

    if (pet.overrideTarget) {
        // Player used Recast to send the pet somewhere
        targetX = pet.overrideTarget.x;
        targetY = pet.overrideTarget.y;
        
        // If it reaches the destination, clear the override
        if (Math.hypot(pet.x - targetX, pet.y - targetY) < 16) {
            pet.overrideTarget = null; 
        }
    } else {
        // AI Mode: Find nearest enemy
        let nearestDist = 200; // Aggro radius
        remotePlayers.forEach((p, id) => {
            if (p.hp <= 0) return;
            const dist = Math.hypot((p.x + 8) - pet.x, (p.y + 8) - pet.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                enemyTarget = p;
            }
        });

        if (enemyTarget) {
            targetX = enemyTarget.x + 8;
            targetY = enemyTarget.y + 8;
            
            // If in punch range, stop moving and attack!
            if (nearestDist < 24) {
                isAttacking = true;
            }
        }
    }

    // Move the Pet
    if (!isAttacking) {
        const dx = targetX - pet.x;
        const dy = targetY - pet.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 16) { 
            pet.dx = dx; // 👈 Track direction
            pet.dy = dy; // 👈 Track direction
            
            pet.x += (dx / dist) * pet.speed * modifier;
            pet.y += (dy / dist) * pet.speed * modifier;
        } else {
            pet.dx = 0; // 👈 Stop moving
            pet.dy = 0; // 👈 Stop moving
        }
    } else {
        pet.dx = 0; 
        pet.dy = 0;
    }


    // 3. COMBAT
    pet.attackTimer -= modifier;
    if (isAttacking && pet.attackTimer <= 0 && enemyTarget) {
        console.log("🤖 Guardian smashed an enemy!");
        pet.attackTimer = 1.5; // Pet attacks every 1.5s
        
        // Deal damage directly via server
        if (socket) {
            socket.emit('pvpAttack', {
                targetId: enemyTarget.id,
                damage: pet.ad // Uses Pet's AD
            });
        }
    }
}
/**
 * 🏦 3. FINANCIAL ACTIONS (B, P)
 * Slow, Web3/Blockchain interactions.
 */
export function handleFinancialActions() {
    // Banking (Voucher Redemption)
    if (inputState.keyB) {
        inputState.keyB = false;
        if (pendingVouchers.length > 0) {
            // 🛑 SAFETY: Stop the hero from moving before opening MetaMask
            hero.isMoving = false; 
            redeemAllVouchers(); 
        }
    }

    // Withdrawal Menu (Key P)
    if (inputState.keyP) {
        inputState.keyP = false;
        hero.isMoving = false;
        openWithdrawMenu(); // 🆕 Now opens the menu
    }
}


// Helper to map IDs back to types
function getSeedTypeFromID(id) {
    if (id === 1) return "fish";
    if (id === 3) return "grass_item";
    if (id === 4) return "chicken_poop";
    if (id === 5) return "cooked_fish";
    return null;
}