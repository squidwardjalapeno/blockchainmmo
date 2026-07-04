// src/interactionManager.js

import { hero, getLevelInfo, CC_RESTRICT } from './entities.js';
import { getTileData, checkCollision, moveEntity } from './physics.js';
import { ITEM_TYPES, createItem } from './items.js';
import { updatePlants, createPlant, plants, PLANT_DEFS } from './plants.js';
import { getBacteriaData, seedBacteria, BACTERIA_TYPES } from './bacteria.js';
import { inputState } from './input.js';
import { socket, playerWallet, remotePlayers, syncInventoryWithServer } from './multiplayer.js';
import { openTempleMenu, openMapTableMenu, openWithdrawMenu } from './uiManager.js'; 
import { getObjectAt } from './staticObjects.js';
import { CONFIG } from './config.js';
import { animals } from './animals.js';
import { currentTarget } from './combat.js';
import { getWaitModifier, getRandomFish, globalFishCount } from './fish.js';

if (typeof window !== 'undefined') {
    logStep("interactionManager.js loaded");
}

function hasKeyForHouse(houseId) {
    return hero.inventory.some(item => item.isKey && item.houseId === houseId);
}

export function giveItemToHero(newItem) {
    if (!newItem) return false;

    let success = false;

    // 1. If the item is stackable, attempt to merge with an existing stack
    if (newItem.maxStack > 1) {
        const existing = hero.inventory.find(i => i.seedType === newItem.seedType && i.count < newItem.maxStack);
        if (existing) {
            const space = newItem.maxStack - existing.count;
            if (newItem.count <= space) {
                existing.count += newItem.count;
                success = true;
            } else {
                // Fill this stack, and let the remaining count fall through to a new slot
                existing.count = newItem.maxStack;
                newItem.count -= space;
            }
        }
    }

    // 2. If no stack was found (or has remaining leftovers), take up a new inventory slot
    if (!success && hero.inventory.length < hero.maxSlots) {
        hero.inventory.push(newItem);
        success = true;
    }

    // 3. Sync changes to the server immediately upon any success path
    if (success) {
        syncInventoryWithServer();
    } else {
        console.log("🎒 Backpack is full!");
    }

    return success;
}

export function handleInteractions(modifier, worldMatrix, roomMatrix, fertilityMatrix) {
    // 1. FORGIVING HITBOX LOGIC (For Interactions)
    let bx = 0, by = 0;
    if (hero.dir.includes('North')) by = -1;
    if (hero.dir.includes('South')) by = 1;
    if (hero.dir.includes('West'))  bx = -1;
    if (hero.dir.includes('East'))  bx = 1;

    const currentTX = Math.floor((hero.x + 8) / 16);
    const currentTY = Math.floor((hero.y + 15) / 16);
    
    // Build a list of tiles to check (Standing tile, and front tile)
    let tilesToCheck = [
        {tx: currentTX + bx, ty: currentTY + by}, 
        {tx: currentTX, ty: currentTY}
    ];

    // If facing diagonal, check the adjacent corners too!
    if (bx !== 0 && by !== 0) {
        tilesToCheck.push({tx: currentTX + bx, ty: currentTY});
        tilesToCheck.push({tx: currentTX, ty: currentTY + by});
    }

    let tx = currentTX + bx, ty = currentTY + by;
    let obj = null;
    let target = getTileData(tx * 16, ty * 16, worldMatrix, roomMatrix);

    // Loop through the forgiving hitbox to find the first valid object/door
    for (let t of tilesToCheck) {
        const foundObj = getObjectAt(t.tx, t.ty);
        const tgt = getTileData(t.tx * 16, t.ty * 16, worldMatrix, roomMatrix);
        if (foundObj || (tgt && (tgt.tileID === 49 || tgt.tileID === 12) && tgt.roomID !== 0)) {
            tx = t.tx; ty = t.ty;
            obj = foundObj;
            target = tgt;
            break;
        }
    }

    // FEET COORDS (For Pickup/Planting)
    const feetTX = Math.floor((hero.x + 8) / 16);
    const feetTY = Math.floor((hero.y + 15) / 16);

    // 🆕 THE SURVIVAL MEAL: Consume food on 'C'
    if (inputState.keyC) {
        inputState.keyC = false;
        consumeFood();
    }

    if (inputState.interact || inputState.action) {
        
        if (obj) {

            // 🎯 THE FIX: Verify the player is in the same room as the object they are touching!
            const playerRoom = getTileData(hero.x + 8, hero.y + 15, worldMatrix, roomMatrix).roomID;
            const objRoom = obj.houseId || 0;
            const roomRestrictedTypes = ['CHEST_STORAGE', 'BEDROLL', 'FOOD_STORAGE', 'HAY_STORAGE'];

            if (roomRestrictedTypes.includes(obj.type) && playerRoom !== objRoom) {
                console.log("🔒 You cannot reach this through the wall!");
                inputState.interact = false;
                inputState.action = false;
                return; // Block interaction!
            }

            // Replaces the old openSmelterMenu
            if (obj.type === 'SMELTER') {
                if (socket) socket.emit('requestSmelter', `smelter_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'ANVIL') {
                if (socket) socket.emit('requestAnvil', `anvil_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'CRAFTING_TABLE') {
                import('./uiManager.js').then(m => m.openCraftingTableMenu());
                inputState.interact = false; return;
            }

            if (obj.type === 'BEDROLL') {
                if (confirm("🛌 Do you want to sleep here and safely log out?")) {
                    if (socket) {
                        socket.emit('updateStats', { hp: hero.hp, energy: hero.energy, xp: hero.xp });
                    }
                    setTimeout(() => { window.location.reload(); }, 500);
                }
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'STORE_COUNTER') {
                if (!playerWallet) { alert("Connect your wallet to trade!"); return; }
                if (socket) {
                    // 🎯 THE FIX: Mark as player-triggered so the UI opens on response
                    window.isManualStoreRequest = true; 
                    socket.emit('requestStore', `store_${tx}_${ty}`);
                }
                inputState.interact = false;
                inputState.action = false;
                return;
            }
            
            if (obj.type === 'FOOD_STORAGE') {
                if (socket) socket.emit('requestCellar', `cellar_${tx}_${ty}`);
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // Search for CHEST_STORAGE inside src/interactionManager.js and modify that block:
            if (obj.type === 'CHEST_STORAGE') {
                if (socket) {
                    import('./multiplayer.js').then(m => {
                        // 🎯 THE FIX: Declare that the player explicitly requested this chest ID
                        m.setPlayerRequestedChestId(`chest_${tx}_${ty}`);
                        m.socket.emit('requestChest', `chest_${tx}_${ty}`);
                    });
                }
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'TEMPLE_ALTAR') {
                openTempleMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // Locate handleInteractions() inside src/interactionManager.js and modify the KITCHEN interaction:
            if (obj.type === 'KITCHEN') {
                import('./uiManager.js').then(m => m.openKitchenMenu(`kitchen_${tx}_${ty}`));
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'MAP_TABLE') {
                openMapTableMenu();
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // Locate handleInteractions() inside src/interactionManager.js and modify the HAY_TABLE interaction:
            if (obj.type === 'HAY_TABLE') {
                import('./uiManager.js').then(m => m.openHayTableMenu(`haytable_${tx}_${ty}`));
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'HAY_STORAGE') {
                if (socket) socket.emit('requestHayStorage', `hay_${tx}_${ty}`);
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'MILITARY_STORAGE') {
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'STAIRS_TOGGLE') {
                hero.floor = (hero.floor === 1) ? 2 : 1;
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            // Locate handleInteractions() inside src/interactionManager.js and add this block:
            if (obj.type === 'HOBBIT_MANAGER') {
                import('./uiManager.js').then(m => m.openHobbitManagerMenu());
                inputState.interact = false;
                inputState.action = false;
                return;
            }
        }

        // B. PHYSICAL TILE ACTIONS (Doors/Mining)
        let doorTarget = null;
        if (target && [49, 12, 35, 13].includes(target.tileID) && target.roomID !== 0) {
            doorTarget = target;
        } else {
            // 🎯 THE FIX: Fallback to feet tile if standing directly in an open doorway
            const feetTile = getTileData(hero.x + 8, hero.y + 15, worldMatrix, roomMatrix);
            if (feetTile && [35, 13].includes(feetTile.tileID) && feetTile.roomID !== 0) {
                doorTarget = feetTile;
            }
        }

        if (doorTarget) {
            const closedTileID = [35, 49].includes(doorTarget.tileID) ? 49 : 12;
            const hasKey = hero.inventory.some(item => item.isKey && item.houseId === doorTarget.roomID);

            if (!hasKey) {
                const cx = Math.floor(doorTarget.gx / 100);
                const cy = Math.floor(doorTarget.gy / 100);
                const lx = ((doorTarget.gx % 100) + 100) % 100;
                const ly = ((doorTarget.gy % 100) + 100) % 100;
                
                if (fertilityMatrix[cx][cy][(ly * 100) + lx] === 254) {
                    console.log("🔒 This door is already claimed by someone else!");
                    inputState.interact = false;
                    inputState.action = false;
                    return;
                }

                if (hero.inventory.length < hero.maxSlots) {
                    const newKey = createItem(ITEM_TYPES.KEY);
                    newKey.houseId = doorTarget.roomID;
                    newKey.name = `Key to ${(closedTileID === 12) ? "Barn" : "House"} #${doorTarget.roomID}`;
                    giveItemToHero(newKey);
                    
                    fertilityMatrix[cx][cy][(ly * 100) + lx] = 254;
                    
                    console.log(`🔑 Claimed ${(closedTileID === 12) ? "Barn" : "House"} #${doorTarget.roomID}!`);
                    inputState.interact = false;
                    inputState.action = false;
                    return;
                }
            } else {
                // Player already HAS the key -> Open Door Control UI!
                import('./uiManager.js').then(m => m.openDoorControlMenu(doorTarget.gx, doorTarget.gy, doorTarget.roomID));
                inputState.interact = false;
                inputState.action = false;
                return;
            }
        }

        if (target.tileID === 29) {
            // Tell the server we want to look at this specific ore vein
            if (socket) socket.emit('requestOre', `ore_${tx}_${ty}`);
            inputState.interact = false;
            inputState.action = false;
            return;
        }
    }

    // --- 4. CONTINUOUS STATES (Fishing) ---
    if (hero.isFishing) {
        processFishing(modifier);
        return;
    }

    // --- 5. PICKUP LOGIC (E key only) ---
    // 👇 THE FIX: ONLY checks the tile directly under your feet!
    if (inputState.interact) {
        const picked = processPickup(feetTX, feetTY);
        if (picked) inputState.interact = false;
    }

    // --- WORK LOGIC (F Key Toggle) ---
    if (inputState.keyF) {
        inputState.keyF = false; 
        
        // 🎯 THE FIX: Add HAY_TABLE to the work object initializer
        if (obj && (obj.type === 'SMELTER' || obj.type === 'ANVIL' || obj.type === 'KITCHEN' || obj.type === 'HAY_TABLE')) {
            hero.isWorking = true;
            hero.workingObj = { tx: tx, ty: ty, type: obj.type };
            hero.workTimer = 0; 
            console.log(`🔥 Started working at the ${obj.type}...`);
        }
    }

    // 2. Continuously process work if active
    if (hero.isWorking && hero.workingObj) {
        
        // Did the player tap a movement key or touch the joystick?
        let isManualMove = false;
        if (inputState.inputType === 'touch' && inputState.leftJoystick.active) isManualMove = true;
        if (inputState.moveX !== 0 || inputState.moveY !== 0) isManualMove = true;

        if (isManualMove) {
            // Movement breaks concentration!
            hero.isWorking = false;
            hero.workingObj = null;
            hero.workTimer = 0;
            console.log("🛑 Work cancelled by movement.");
        } else {
            hero.isMoving = false; // Lock hero in place while hammering/smelting
            
            // Increment the 1-second timer
            hero.workTimer += modifier;
            
            if (hero.workTimer >= 1.0) {
                hero.workTimer -= 1.0; 
                
                if (hero.workingObj.type === 'SMELTER') {
                    if (socket) socket.emit('workSmelterStrike', { jobId: `smelter_${hero.workingObj.tx}_${hero.workingObj.ty}` });
                } else if (hero.workingObj.type === 'ANVIL') {
                    if (socket) socket.emit('workAnvilStrike', { jobId: `anvil_${hero.workingObj.tx}_${hero.workingObj.ty}` });
                } else if (hero.workingObj.type === 'KITCHEN') {
                    if (socket) socket.emit('workKitchenStrike', { jobId: `kitchen_${hero.workingObj.tx}_${hero.workingObj.ty}` });
                }
                // 🎯 THE FIX: Direct the manual work strike to the hay table socket event
                else if (hero.workingObj.type === 'HAY_TABLE') {
                    if (socket) socket.emit('workHayTableStrike', { jobId: `haytable_${hero.workingObj.tx}_${hero.workingObj.ty}` });
                }
            }
        }
    }

    // --- 6. DROP ITEM (G Key) ---
    if (inputState.drop) {
        inputState.drop = false;
        if (hero.equipment.mainHand) {
            const item = hero.equipment.mainHand;
            
            // 👇 THE FIX: Pass raw 16-bit ID directly! No bit-splitting!
            let dropHealth = item.isKey ? item.houseId : item.health;

            seedBacteria(feetTX, feetTY, item.seedType, dropHealth, item.virulence);
            
            item.count--;
            if (item.count <= 0 || isNaN(item.count)) {
                hero.equipment.mainHand = null;
            }

            syncInventoryWithServer(); 
        }
    }

    // --- 7. PLANT SEED (V Key) ---
    if (inputState.keyV) {
        inputState.keyV = false;
        if (hero.equipment.mainHand) {
            const item = hero.equipment.mainHand;

            if (item.seedType && (item.seedType.includes("_seed") || item.seedType === "potato_item")) {
                const cx = Math.floor(feetTX / 100); const cy = Math.floor(feetTY / 100);
                const lx = ((feetTX % 100) + 100) % 100; const ly = ((feetTY % 100) + 100) % 100;
                const tileID = worldMatrix[cx]?.[cy]?.[(ly * 100) + lx];
                const roomID = roomMatrix[cx]?.[cy]?.[(ly * 100) + lx] || 0;

                if (tileID === 63 && (roomID === 0 || roomID === 9999) && !plants.has(`${feetTX}_${feetTY}`)) {
                    
                    // 🎯 THE SECURE FIX: Request a seed-plant from the server!
                    const index = hero.inventory.indexOf(item);
                    
                    if (socket) {
                        socket.emit('requestPlantSeed', { tx: feetTX, ty: feetTY, index: index });
                    }
                }
            }
        }
    }

    if (inputState.action) {
        processCasting(tx, ty, worldMatrix, roomMatrix); 
    }
}

export function recalculateStats() {
    // Start with base stats
    hero.ad = hero.baseAd;
    
    // 👇 If holding a weapon, add its damage!
    if (hero.equipment.mainHand && hero.equipment.mainHand.isWeapon) {
        hero.ad += (hero.equipment.mainHand.ad || 0);
    }
    
    hero.speed = CONFIG.HERO_SPEED;
    if (hero.cc && hero.cc.isSlowed) hero.speed *= 0.5;
    if (hero.buffs && hero.buffs.zephyrSpeedTimer > 0) hero.speed *= 1.30; 

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
                passives: hero.passives 
            });
        });
    }
    
    console.log(`Stats Recalculated! AD: ${hero.ad}, SPEED: ${hero.speed}`);
}

function consumeFood() {
    if (hero.hp <= 0) return;

    if (!hero.equipment || !hero.equipment.mainHand) {
        console.log("❌ Equip a food item in your hand first!");
        return;
    }

    const item = hero.equipment.mainHand;

    // 🍱 THE FOOD REGISTRY (Energy restored per item)
    const foodValues = { 
        "cooked_fish": 60,
        "fish_muskellunge": 100, 
        "fish_trevally": 80, "fish_angler": 80, "fish_octopus": 60,
        "fish_squid": 50, "fish_eel": 45, "fish_mackerel": 35,
        "fish_trout": 25, "fish": 20, "fish_panfish": 15,
        "pineapple_item": 50,    
        "eggplant_item": 40,
        "tomato_item": 35,
        "pumpkin_item": 30,
        "watermelon_item": 30,
        "potato_item": 25,
        "corn_item": 25,
        "turnip_item": 20,
        "egg": 20,              
        "strawberry_item": 15,   
        "wheat_item": 10        
    };

    if (foodValues[item.seedType] !== undefined) {
        const restoreAmount = foodValues[item.seedType];
        
        hero.energy = Math.min(hero.maxEnergy, hero.energy + restoreAmount);
        console.log(`🍗 Consumed ${item.name}! +${restoreAmount} Energy.`);

        item.count--;
        if (item.count <= 0) {
            hero.equipment.mainHand = null; 
        }

        import('./multiplayer.js').then(m => {
            if (m.socket) m.socket.emit('updateStats', { energy: hero.energy });
        });

        syncInventoryWithServer(); 
        
        import('./uiManager.js').then(m => m.renderTabContent());
    } else {
        console.log(`❌ ${item.name} is not edible!`);
    }
}

function processAction(tx, ty, worldMatrix, roomMatrix) {
    processCasting(tx, ty, worldMatrix, roomMatrix); 
}

function processCasting(tx, ty, world, room) {
    let bx = 0, by = 0;
    if (hero.dir === 'North')  by = -1;
    if (hero.dir === 'South')  by = 1;
    if (hero.dir === 'West')   bx = -1;
    if (hero.dir === 'East')   bx = 1;

    const target = getTileData((tx + bx) * 16, (ty + by) * 16, world, room);
    if (target.tileID === 17) { 
        hero.isFishing = true;
        hero.hasBite = false;
        hero.bobberX = (tx + bx) * 16 + 8;
        hero.bobberY = (ty + by) * 16 + 8;

        if (socket) {
            socket.emit('requestCastLine', { tx: tx + bx, ty: ty + by });
        }
        
        inputState.action = false;
    }
}

function processFishing(modifier) {
    if (!hero.hasBite) {
        hero.fishTimer -= modifier;
        if (hero.fishTimer <= 0) hero.hasBite = true; 
    } else if (inputState.action) {
        if (socket) {
            socket.emit('requestReelIn');
        }
        inputState.action = false;
    }
}

function processPickup(tx, ty) {
    if (hero.inventory.length >= hero.maxSlots) return false;

    // ==========================================
    // PRIORITY 1: DROPPED ITEMS (Keys, Weapons, Eggs, Dropped Crops)
    // ==========================================
    const bac = getBacteriaData(tx, ty);
    const traits = bac ? bac.data[bac.idx] : 0;

    if (traits > 0) {
        const typeID = (traits >> 20) & 0xFF; 
        
        const matchedSeedType = Object.keys(BACTERIA_TYPES).find(key => 
            BACTERIA_TYPES[key] === typeID && !['organic_drop', 'organic_plant', 'grass'].includes(key)
        );

        if (matchedSeedType) {
            const template = Object.values(ITEM_TYPES).find(t => t.seedType === matchedSeedType);
            if (template) {
                let extractedHouseId = undefined;
                let itemName = template.name;

                if (typeID === 61) { 
                    extractedHouseId = traits & 0xFFFF; 
                    itemName = `Key to House #${extractedHouseId}`;
                }

                if (socket) {
                    socket.emit('requestPickup', {
                        tx: tx, ty: ty,
                        name: itemName,
                        seedType: template.seedType,
                        count: 1,
                        spriteID: template.spriteID,
                        tileset: template.tileset,
                        houseId: extractedHouseId
                    });
                }

                bac.data[bac.idx] = 0; 
                return true;
            }
        }
    }

    // ==========================================
    // PRIORITY 2: GROWING PLANTS (Crops, Flowers, Grass)
    // ==========================================
    const plantKey = `${tx}_${ty}`;
    if (plants.has(plantKey)) {
        if (socket) {
            socket.emit('requestHarvest', { tx: tx, ty: ty });
        }
        return true;
    }

    return false; 
}

export function updateHeroStats(modifier, hero) {
    for (let i = 0; i < 4; i++) {
        if (hero.cooldowns[i] > 0) {
            hero.cooldowns[i] = Math.max(0, hero.cooldowns[i] - modifier);
        }
    }
    if (hero.attackTimer < 0) {
        hero.attackTimer += modifier; 
    } 
    else if (!hero.isWindingUp) {
        hero.attackTimer = Math.max(0, hero.attackTimer - modifier);
    }

    if (hero.hp > 0) {
        hero.energy = Math.max(0, hero.energy - (CONFIG.ENERGY_DRAIN_RATE * modifier));
        
        if (hero.energy <= 0) {
            hero.energy = 0;
            hero.hp = 0; 
            console.log("💀 You starved to death! Gather food to survive.");
            
            if (socket) socket.emit('updateStats', { hp: 0, energy: 0 });
        }
    }

    if (hero.buffs && hero.buffs.isAscended) {
        hero.ascensionTimer -= modifier;
        if (hero.ascensionTimer <= 0) {
            hero.buffs.isAscended = false;
            hero.maxHp -= 100;
            hero.hp = Math.max(1, Math.min(hero.hp, hero.maxHp)); 
            hero.armor -= 20;
            hero.mr -= 20;
            console.log("🌟 Ascension ended. Stats normalized.");
            
            const p4Index = hero.skills.indexOf('p4');
            if (p4Index !== -1) hero.cooldowns[p4Index] = 60.0;
        }
    }

    if (hero.buffs && hero.buffs.isInvincible) {
        hero.invincibleTimer -= modifier;
        if (hero.invincibleTimer <= 0) {
            hero.buffs.isInvincible = false;
            console.log("👼 Heaven's Halo faded.");
            if (socket) socket.emit('updateStats', { isInvincible: false });
        }
    }

    if (hero.buffs && hero.buffs.zephyrSpeedTimer > 0) {
        hero.buffs.zephyrSpeedTimer -= modifier;
        if (hero.buffs.zephyrSpeedTimer <= 0) recalculateStats(); 
    }

    if (hero.bulwarkTimer > 0) {
        hero.bulwarkTimer -= modifier;
        if (hero.bulwarkTimer <= 0) {
            console.log("🛡️ Fleeting Bulwark faded.");
            hero.armor -= hero.bulwarkArmorBonus;
            hero.mr -= hero.bulwarkMrBonus;
            
            hero.bulwarkArmorBonus = 0;
            hero.bulwarkMrBonus = 0;
            hero.bulwarkSpeedBonus = 0;

            recalculateStats(); 
            
            if (socket) socket.emit('updateStats', { armor: hero.armor, mr: hero.mr });
        }
    }

    if (hero.slowTimer > 0) {
        hero.slowTimer -= modifier;
        if (hero.slowTimer <= 0) recalculateStats(); 
    }

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

    if (hero.ccFlags) {
        hero.ccFlags.canMove = !(currentMask & CC_RESTRICT.MOVE);
        hero.ccFlags.canAttack = !(currentMask & CC_RESTRICT.ATTACK);
        hero.ccFlags.canCastMovement = !(currentMask & CC_RESTRICT.CAST_MOVEMENT);
        hero.ccFlags.canCastNonMovement = !(currentMask & CC_RESTRICT.CAST_NON_MOVEMENT);
        hero.ccFlags.canCleanse = !(currentMask & CC_RESTRICT.CLEANSE);
    }

    updateSpells(modifier);

    if (hero.pet && hero.pet.active) {
        updatePetAI(modifier, hero.pet);
    }
}

export function handlePvPCombat(modifier, worldMatrix, roomMatrix, hero, remotePlayers) {
    if (hero.target) {
        if (hero.target.isAnimal) {
            const liveData = animals.find(a => a.id === hero.target.id);
            if (liveData) { hero.target.x = liveData.x; hero.target.y = liveData.y; hero.target.hp = liveData.hp; }
        } else {
            const liveData = remotePlayers.get(hero.target.id);
            if (liveData) { hero.target.x = liveData.x; hero.target.y = liveData.y; hero.target.hp = liveData.hp; } 
        }
    }

    let isManualMove = false;
    if (inputState.inputType === 'touch' && inputState.leftJoystick.active) isManualMove = true;
    if (inputState.moveX !== 0 || inputState.moveY !== 0) isManualMove = true;

    if (inputState.mainBtn) {
        import('./combat.js').then(c => {
            c.scanForTarget(hero, 150, worldMatrix, roomMatrix);
            
            if (c.currentTarget) {
                hero.target = c.currentTarget;
                c.setLockedTarget(c.currentTarget);
                
                if (!isManualMove) {
                    hero.isAttacking = true;
                }
            }
        });
    } else {
        if (!hero.isAttacking) {
            hero.target = null;
            import('./combat.js').then(c => c.setLockedTarget(null));
        }
    }

    if (hero.hp <= 0) {
        hero.isAttacking = false;
        hero.target = null;
        import('./combat.js').then(c => c.setLockedTarget(null));
        hero.isWindingUp = false;
        return; 
    }

    if (isManualMove) {
        hero.isAttacking = false;
        hero.isWindingUp = false;
        return; 
    }

    if (hero.isAttacking && hero.target) {
        if (hero.isWindingUp) {
            hero.attackTimer += modifier;
            const windUpLimit = 0.3 / (hero.attackSpeed || 1.0);

            if (hero.attackTimer >= windUpLimit) {
                let fluxShieldToGain = 0;
                let finalDamage = hero.ad;

                if (hero.buffs.vaultEmpowered) { finalDamage += (hero.ad * 0.4); hero.buffs.vaultEmpowered = false; }
                if (hero.buffs.fluxShotEmpowered) { finalDamage += (hero.ad * 0.20); hero.buffs.fluxShotEmpowered = false; fluxShieldToGain = finalDamage * 0.28; }

                if (hero.skills.includes('p2')) {
                    hero.attackCount++;
                    if (hero.attackCount >= 3) {
                        hero.attackCount = 0;
                        if (hero.energy >= 5) {
                            hero.energy -= 5;
                            const isLowHp = (hero.hp / hero.maxHp) < 0.5;
                            if (hero.p2_stance === 'blast') {
                                let bonusDmg = hero.magic * 0.20;
                                if (isLowHp) bonusDmg *= 0.70; 
                                finalDamage += bonusDmg; 
                            } else if (hero.p2_stance === 'shield') {
                                let fluxPercent = 0.14;
                                if (isLowHp) fluxPercent *= 0.70;
                                fluxShieldToGain += finalDamage * fluxPercent;
                            }
                        }
                    }
                }

                if (hero.target.isOre) {
                    if (hero.equipment.mainHand && hero.equipment.mainHand.seedType === 'tool_pickaxe') {
                        if (socket) socket.emit('mineOreStrike', { oreId: hero.target.id });
                        console.log("⛏️ Chink! You struck the ore.");
                    } else {
                        console.log("❌ You need a Pickaxe to mine this ore!");
                    }
                } 
                else if (hero.target.isAnimal || hero.target.isHobbit) { 
                    hero.target.hp -= finalDamage; 
                    console.log(`🗡️ Hit Hobbit/Animal for ${finalDamage} damage! (HP: ${hero.target.hp}/${hero.target.maxHp})`);
                } 
                else { 
                    applyPlayerDamage(hero.target, finalDamage); 
                }
                
                if (fluxShieldToGain > 0) {
                    hero.shield += fluxShieldToGain;
                    if (socket) socket.emit('updateStats', { shield: hero.shield });
                }
                
                hero.isWindingUp = false;      
                hero.attackTimer = -1.7; 
                
                if (hero.target && hero.target.hp <= 0) {
                    hero.isAttacking = false;
                    hero.target = null;
                    import('./combat.js').then(c => c.setLockedTarget(null));
                }
            }
        } 
        else {
            const hx = hero.x + 8;
            const hy = hero.y + 8;
            const tx = hero.target.x + 8;
            const ty = hero.target.y + 8;
            
            const dx = tx - hx;
            const dy = ty - hy;
            const currentDistSq = (dx * dx) + (dy * dy);
            const attackRange = hero.attackRange || 24;

            if (currentDistSq <= attackRange * attackRange) {
                if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx > 0 ? 'East' : 'West';
                else hero.dir = dy > 0 ? 'South' : 'North';

                if (hero.attackTimer >= 0) {
                    hero.isWindingUp = true;
                }
            }
        }
    }
}

function applyPlayerDamage(target, damage) {
    if (socket) {
        socket.emit('pvpAttack', {
            targetId: target.id,
            damage: damage
        });
    }
    console.log(`⚔️ PvP HIT sent! Waiting for server truth...`);
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
    
    if (info.points - spentPoints <= 0) return; 

    switch(statName) {
        case 'hp':
            hero.maxHp += 10;
            hero.hp += 10; 
            break;
        case 'speed':
            hero.speed += 10;
            break;
        case 'ad':
            hero.ad += 1;
            break;
        case 'armor':
            hero.armor += 1;
            break;
        case 'mr':
            hero.mr += 1;
            break;
        case 'magic':
            hero.magic += 1;
            break;
    }

    hero.spentPoints = spentPoints + 1;
    
    socket.emit('updateStats', {
        xp: hero.xp, 
        maxHp: hero.maxHp,
        ad: hero.ad,
        armor: hero.armor,
        magic: hero.magic,
        mr: hero.mr,
        speed: hero.speed
    });
}

function updateSpells(modifier) {
    for (let i = hero.projectiles.length - 1; i >= 0; i--) {
        let p = hero.projectiles[i];
        p.x += p.dx * p.speed * modifier;
        p.y += p.dy * p.speed * modifier;
        p.life -= modifier;

        if (p.life <= 0) {
            console.log("💥 Lion's Breath Exploded!");
            applyAoEHeal(p.x, p.y, 40, p.healTick);
            
            hero.aoeZones.push({
                x: p.x, y: p.y,
                radius: 40,
                life: 4.0, 
                tickTimer: 0,
                healAmount: hero.magic * 0.1 
            });
            hero.projectiles.splice(i, 1);
        }
    }

    for (let i = hero.aoeZones.length - 1; i >= 0; i--) {
        let z = hero.aoeZones[i];
        z.life -= modifier;

        if (z.type === 'radiantNova') {
            if (z.life <= 0) {
                console.log("🌠 Radiant Nova Detonated!");
                if (socket) socket.emit('abilityAoE', { type: 'radiantNovaExplosion', x: z.x, y: z.y, radius: z.radius, damage: z.damage });
                hero.aoeZones.splice(i, 1);
            }
            continue; 
        }

        if (z.type === 'consecration') {
            z.tickTimer -= modifier;
            if (z.tickTimer <= 0) {
                if (socket) {
                    socket.emit('abilityAoE', { 
                        type: 'consecrationTick', 
                        x: z.x, 
                        y: z.y, 
                        radius: z.radius, 
                        damage: z.damage 
                    });
                }
                z.tickTimer = 1.0; 
            }
            if (z.life <= 0) hero.aoeZones.splice(i, 1);
            continue; 
        }

        z.tickTimer -= modifier;
        if (z.tickTimer <= 0) {
            applyAoEHeal(z.x, z.y, z.radius, z.healAmount);
            z.tickTimer = 1.0; 
        }

        if (z.life <= 0) {
            hero.aoeZones.splice(i, 1);
        }
    }
}

function applyAoEHeal(x, y, radius, amount) {
    const dx = (hero.x + 8) - x;
    const dy = (hero.y + 8) - y;
    if (dx * dx + dy * dy <= radius * radius) {
        hero.hp = Math.min(hero.maxHp, hero.hp + amount);
        if (socket) socket.emit('updateStats', { hp: hero.hp });
    }
    
    remotePlayers.forEach((p, id) => {
        const pdx = (p.x + 8) - x;
        const pdy = (p.y + 8) - y;
        if (pdx * pdx + pdy * pdy <= radius * radius) {
            if (socket) socket.emit('healPlayer', { targetId: id, amount: amount });
        }
    });
}

function updatePetAI(modifier, pet) {
    pet.life -= modifier;
    
    if (pet.life <= 0 || pet.hp <= 0) {
        pet.active = false;
        console.log("🤖 Zenith Guardian departed.");
        
        const p16Index = hero.skills.indexOf('p16');
        if (p16Index !== -1) {
            hero.cooldowns[p16Index] = 120.0; 
        }
        return; 
    }

    pet.healTimer -= modifier;
    if (pet.healTimer <= 0) {
        const healAmount = hero.magic * 0.20;
        hero.hp = Math.min(hero.maxHp, hero.hp + healAmount);
        console.log(`🤲 Guardian Healed you for ${healAmount}!`);
        if (socket) socket.emit('updateStats', { hp: hero.hp });
        pet.healTimer = 10.0; 
    }

    let targetX = hero.x + 8;
    let targetY = hero.y + 8;
    let isAttacking = false;
    let enemyTarget = null;

    if (pet.overrideTarget) {
        targetX = pet.overrideTarget.x;
        targetY = pet.overrideTarget.y;
        
        if (Math.hypot(pet.x - targetX, pet.y - targetY) < 16) {
            pet.overrideTarget = null; 
        }
    } else {
        let nearestDist = 200; 
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
            
            if (nearestDist < 24) {
                isAttacking = true;
            }
        }
    }

    if (!isAttacking) {
        const dx = targetX - pet.x;
        const dy = targetY - pet.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 16) { 
            pet.dx = dx; 
            pet.dy = dy; 
            
            pet.x += (dx / dist) * pet.speed * modifier;
            pet.y += (dy / dist) * pet.speed * modifier;
        } else {
            pet.dx = 0; 
            pet.dy = 0; 
        }
    } else {
        pet.dx = 0; 
        pet.dy = 0;
    }

    pet.attackTimer -= modifier;
    if (isAttacking && pet.attackTimer <= 0 && enemyTarget) {
        console.log("🤖 Guardian smashed an enemy!");
        pet.attackTimer = 1.5; 
        
        if (socket) {
            socket.emit('pvpAttack', {
                targetId: enemyTarget.id,
                damage: pet.ad 
            });
        }
    }
}

export function handleFinancialActions() {
    if (inputState.keyB) {
        inputState.keyB = false;
        if (typeof pendingVouchers !== 'undefined' && pendingVouchers.length > 0) {
            hero.isMoving = false; 
            redeemAllVouchers(); 
        }
    }

    if (inputState.keyP) {
        inputState.keyP = false;
        hero.isMoving = false;
        openWithdrawMenu(); 
    }
}