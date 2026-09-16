// src/interactionManager.js

import { hero, getLevelInfo, CC_RESTRICT } from './entities.js';
import { getTileData, checkCollision, moveEntity } from './physics.js';
import { ITEM_TYPES, createItem } from './items.js';
import { updatePlants, createPlant, plants } from './plants.js';
import { getBacteriaData, seedBacteria, BACTERIA_TYPES } from './bacteria.js';
import { inputState } from './input.js';
import { socket, playerWallet, remotePlayers, syncInventoryWithServer } from './multiplayer.js';
import { openTempleMenu, openMapTableMenu, openWithdrawMenu, openUnifiedStorage } from './uiManager.js'; 
import { getObjectAt } from './staticObjects.js';
import { CONFIG } from './config.js';
import { animals } from './animals.js';
import { currentTarget } from './combat.js';
import { getWaitModifier, getRandomFish, globalFishCount } from './fish.js';
import { hobbits } from './hobbitCore.js';
import { getCorpseAt, spawnCorpse } from './corpses.js';
import { createSecret, learnSecret, SECRET_TYPES } from './secrets.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("interactionManager.js loaded");
}

function hasKeyForHouse(houseId) {
    return hero.inventory.some(item => item.isKey && item.houseId === houseId);
}

export function giveItemToHero(newItem) {
    if (!newItem) return false;

    let success = false;

    // 1. If stackable, attempt to merge with an existing stack
    if (newItem.maxStack > 1) {
        const existing = hero.inventory.find(i => i.seedType === newItem.seedType && i.count < newItem.maxStack);
        if (existing) {
            const space = newItem.maxStack - existing.count;
            if (newItem.count <= space) {
                existing.count += newItem.count;
                success = true;
            } else {
                existing.count = newItem.maxStack;
                newItem.count -= space;
            }
        }
    }

    // 2. If no stack available, allocate a new inventory slot
    if (!success && hero.inventory.length < hero.maxSlots) {
        hero.inventory.push(newItem);
        success = true;
    }

    // 3. Sync changes to server immediately
    if (success) {
        syncInventoryWithServer();
    } else {
        console.log("🎒 Backpack is full!");
    }

    return success;
}

export function handleInteractions(modifier, worldMatrix, roomMatrix, fertilityMatrix) {
    // 1. Forgiving directional hitbox logic
    let bx = 0, by = 0;
    if (hero.dir.includes('North')) by = -1;
    if (hero.dir.includes('South')) by = 1;
    if (hero.dir.includes('West'))  bx = -1;
    if (hero.dir.includes('East'))  bx = 1;

    const currentTX = Math.floor((hero.x + 8) / 16);
    const currentTY = Math.floor((hero.y + 15) / 16);
    
    const tilesToCheck = [
        { tx: currentTX + bx, ty: currentTY + by }, 
        { tx: currentTX, ty: currentTY }
    ];

    if (bx !== 0 && by !== 0) {
        tilesToCheck.push({ tx: currentTX + bx, ty: currentTY });
        tilesToCheck.push({ tx: currentTX, ty: currentTY + by });
    }

    let tx = currentTX + bx, ty = currentTY + by;
    let obj = null;
    let target = getTileData(tx * 16, ty * 16, worldMatrix, roomMatrix);

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

    const feetTX = Math.floor((hero.x + 8) / 16);
    const feetTY = Math.floor((hero.y + 15) / 16);

    // 🍗 SURVIVAL FOOD CONSUMPTION (Key C)
    if (inputState.keyC) {
        inputState.keyC = false;
        consumeFood();
    }

    // ==========================================
    // 💀 CORPSE LOOTING INTERACTION (Key E / Action)
    // ==========================================
    if (inputState.interact) {
        const nearbyCorpse = getCorpseAt(feetTX, feetTY) || getCorpseAt(currentTX + bx, currentTY + by);
        if (nearbyCorpse) {
            openUnifiedStorage(nearbyCorpse.id, nearbyCorpse.inventory, 'CORPSE');
            inputState.interact = false;
            return;
        }
    }

    // ==========================================
    // 🏛️ STATIC OBJECT & WORKSTATION INTERACTIONS
    // ==========================================
    if (inputState.interact || inputState.action) {
        if (obj) {
            const playerRoom = getTileData(hero.x + 8, hero.y + 15, worldMatrix, roomMatrix).roomID;
            const objRoom = obj.houseId || 0;
            const roomRestrictedTypes = ['CHEST_STORAGE', 'BEDROLL', 'FOOD_STORAGE', 'HAY_STORAGE'];

            if (roomRestrictedTypes.includes(obj.type) && playerRoom !== objRoom) {
                console.log("🔒 You cannot reach this through the wall!");
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'WELL_OBJECT') {
                import('./cellDecorator.js').then(m => {
                    const well = m.getVillageAt(tx, ty);
                    if (well && socket) {
                        socket.emit('requestWellState', { wellX: well.x, wellY: well.y });
                    }
                });
                inputState.interact = false;
                inputState.action = false;
                return;
            }

            if (obj.type === 'SMELTER') {
                if (socket) socket.emit('request_job', `smelter_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'ANVIL') {
                if (socket) socket.emit('request_job', `anvil_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'CRAFTING_TABLE') {
                import('./uiManager.js').then(m => m.openCraftingTableMenu());
                inputState.interact = false; return;
            }
            if (obj.type === 'GRAND_EXCHANGE') {
                document.getElementById('exchange-menu')?.classList.remove('hidden');
                inputState.interact = false; return;
            }
            if (obj.type === 'UNI_EXCHANGE') {
                import('./cellDecorator.js').then(m => {
                    const well = m.getVillageAt(tx, ty);
                    if (well && socket) socket.emit('requestUniExchangeData', { wellX: well.x, wellY: well.y });
                });
                inputState.interact = false; return;
            }
            if (obj.type === 'HOBBIT_EXCHANGE') {
                document.getElementById('hobbit-exchange-menu')?.classList.remove('hidden');
                inputState.interact = false; return;
            }
            if (obj.type === 'VILLAGE_VAULT') {
                import('./cellDecorator.js').then(m => {
                    const well = m.getVillageAt(tx, ty);
                    if (well && socket) {
                        const vaultId = `vault_${well.x}_${well.y}`;
                        import('./multiplayer.js').then(mult => {
                            mult.setPlayerRequestedChestId(vaultId);
                            mult.socket.emit('requestChest', vaultId);
                        });
                    }
                });
                inputState.interact = false; return;
            }
            if (obj.type === 'BEDROLL') {
                if (confirm("🛌 Do you want to sleep here and safely log out?")) {
                    if (socket) socket.emit('updateStats', { hp: hero.hp, energy: hero.energy, xp: hero.xp });
                    setTimeout(() => { window.location.reload(); }, 500);
                }
                inputState.interact = false; return;
            }
            if (obj.type === 'STORE_COUNTER') {
                if (!playerWallet) { alert("Connect your wallet to trade!"); return; }
                if (socket) {
                    window.isManualStoreRequest = true; 
                    socket.emit('requestStore', `store_${tx}_${ty}`);
                }
                inputState.interact = false; return;
            }
            if (obj.type === 'FOOD_STORAGE') {
                if (socket) socket.emit('requestCellar', `cellar_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'CHEST_STORAGE') {
                if (socket) {
                    import('./multiplayer.js').then(m => {
                        m.setPlayerRequestedChestId(`chest_${tx}_${ty}`);
                        m.socket.emit('requestChest', `chest_${tx}_${ty}`);
                    });
                }
                inputState.interact = false; return;
            }
            if (obj.type === 'TEMPLE_ALTAR') {
                openTempleMenu();
                inputState.interact = false; return;
            }
            if (obj.type === 'KITCHEN') {
                if (socket) socket.emit('request_job', `kitchen_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'MAP_TABLE') {
                openMapTableMenu();
                inputState.interact = false; return;
            }
            if (obj.type === 'HAY_TABLE') {
                if (socket) socket.emit('request_job', `haytable_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'HAY_STORAGE') {
                if (socket) socket.emit('requestHayStorage', `hay_${tx}_${ty}`);
                inputState.interact = false; return;
            }
            if (obj.type === 'STAIRS_TOGGLE') {
                hero.floor = (hero.floor === 1) ? 2 : 1;
                inputState.interact = false; return;
            }
            if (obj.type === 'HOBBIT_MANAGER') {
                import('./uiManager.js').then(m => m.openHobbitManagerMenu());
                inputState.interact = false; return;
            }
        }

        // Doors
        let doorTarget = null;
        if (target && [49, 12, 35, 13].includes(target.tileID) && target.roomID !== 0) {
            doorTarget = target;
        } else {
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
                
                if (fertilityMatrix[cx]?.[cy]?.[(ly * 100) + lx] === 254) {
                    console.log("🔒 This door is already claimed by someone else!");
                    inputState.interact = false; return;
                }

                if (hero.inventory.length < hero.maxSlots) {
                    const newKey = createItem(ITEM_TYPES.KEY);
                    newKey.houseId = doorTarget.roomID;
                    newKey.name = `Key to ${(closedTileID === 12) ? "Barn" : "House"} #${doorTarget.roomID}`;
                    giveItemToHero(newKey);
                    
                    if (fertilityMatrix[cx]?.[cy]) {
                        fertilityMatrix[cx][cy][(ly * 100) + lx] = 254;
                    }
                    inputState.interact = false; return;
                }
            } else {
                import('./uiManager.js').then(m => m.openDoorControlMenu(doorTarget.gx, doorTarget.gy, doorTarget.roomID));
                inputState.interact = false; return;
            }
        }

        // Mining Ores
        if (target && target.tileID === 29) {
            if (socket) socket.emit('requestOre', `ore_${tx}_${ty}`);
            inputState.interact = false; return;
        }
    }

    // Fishing
    if (hero.isFishing) {
        processFishing(modifier);
        return;
    }

    // Pickup
    if (inputState.interact) {
        const centerTX = Math.floor((hero.x + 8) / 16);
        const centerTY = Math.floor((hero.y + 8) / 16);
        
        let picked = processPickup(centerTX, centerTY);
        if (!picked && (feetTX !== centerTX || feetTY !== centerTY)) {
            picked = processPickup(feetTX, feetTY);
        }
        if (picked) inputState.interact = false;
    }

    // Work (Key F)
    if (inputState.keyF) {
        inputState.keyF = false; 
        if (obj && (obj.type === 'SMELTER' || obj.type === 'ANVIL' || obj.type === 'KITCHEN' || obj.type === 'HAY_TABLE')) {
            hero.isWorking = true;
            hero.workingObj = { tx, ty, type: obj.type };
            hero.workTimer = 0;
        }
    }

    if (hero.isWorking && hero.workingObj) {
        const isManualMove = (inputState.moveX !== 0 || inputState.moveY !== 0 || (inputState.inputType === 'touch' && inputState.leftJoystick.active));
        if (isManualMove) {
            hero.isWorking = false;
            hero.workingObj = null;
            hero.workTimer = 0;
        } else {
            hero.isMoving = false; 
            hero.workTimer += modifier;
            if (hero.workTimer >= 1.0) {
                hero.workTimer -= 1.0; 
                if (socket) socket.emit('work_job_strike', { jobId: `${hero.workingObj.type.toLowerCase()}_${hero.workingObj.tx}_${hero.workingObj.ty}` });
            }
        }
    }

    // Drop Item (Key G)
    if (inputState.drop) {
        inputState.drop = false;
        if (hero.equipment.mainHand) {
            const item = hero.equipment.mainHand;
            const dropHealth = item.isKey ? item.houseId : item.health;

            seedBacteria(feetTX, feetTY, item.seedType, dropHealth, item.virulence);
            item.count--;
            if (item.count <= 0 || isNaN(item.count)) {
                hero.equipment.mainHand = null;
            }
            syncInventoryWithServer(); 
        }
    }

    // Plant Seed (Key V)
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
                    const index = hero.inventory.indexOf(item);
                    if (socket) socket.emit('requestPlantSeed', { tx: feetTX, ty: feetTY, index });
                }
            }
        }
    }

    // Water Casting
    if (inputState.action) {
        processCasting(feetTX, feetTY, worldMatrix, roomMatrix); 
    }
}

// In src/interactionManager.js -> update recalculateStats():

export function recalculateStats() {
    // 🎯 FIX: Reset strictly to baseAd + stat upgrades, never compounding
    hero.baseAd = CONFIG.HERO_ATTACK + (hero.spentAdPoints || 0);
    hero.ad = hero.baseAd;

    if (hero.equipment?.mainHand?.isWeapon) {
        hero.ad += (hero.equipment.mainHand.ad || 0);
    }
    
    hero.speed = CONFIG.HERO_SPEED + ((hero.spentSpeedPoints || 0) * 10);
    if (hero.cc && hero.cc.isSlowed) hero.speed *= 0.5;
    if (hero.buffs && hero.buffs.zephyrSpeedTimer > 0) hero.speed *= 1.30; 
    if (hero.bulwarkTimer > 0) hero.speed *= hero.bulwarkSpeedBonus; 

    hero.passives.hasFever = hero.skills.includes('p10');

    if (typeof window !== 'undefined' && socket) {
        socket.emit('updateStats', { 
            baseAd: hero.baseAd,
            ad: hero.ad, 
            speed: hero.speed,
            passives: hero.passives 
        });
    }
}

function consumeFood() {
    if (hero.hp <= 0 || !hero.equipment?.mainHand) return;
    const item = hero.equipment.mainHand;

    const foodValues = { 
        "cooked_fish": 60, "fish_muskellunge": 100, "fish_trevally": 80, 
        "fish_angler": 80, "fish_octopus": 60, "fish_squid": 50, 
        "fish_eel": 45, "fish_mackerel": 35, "fish_trout": 25, 
        "fish": 20, "fish_panfish": 15, "pineapple_item": 50,    
        "eggplant_item": 40, "tomato_item": 35, "pumpkin_item": 30, 
        "watermelon_item": 30, "potato_item": 25, "corn_item": 25, 
        "turnip_item": 20, "egg": 20, "strawberry_item": 15, "wheat_item": 10        
    };

    if (foodValues[item.seedType] !== undefined) {
        const restoreAmount = foodValues[item.seedType];
        hero.energy = Math.min(hero.maxEnergy, hero.energy + restoreAmount);
        console.log(`🍗 Consumed ${item.name}! +${restoreAmount} Energy.`);

        item.count--;
        if (item.count <= 0) hero.equipment.mainHand = null; 

        if (socket) socket.emit('updateStats', { energy: hero.energy });
        syncInventoryWithServer(); 
        import('./uiManager.js').then(m => m.renderTabContent());
    }
}

function processCasting(tx, ty, world, room) {
    let bx = 0, by = 0;
    if (hero.dir === 'North') by = -1;
    if (hero.dir === 'South') by = 1;
    if (hero.dir === 'West')  bx = -1;
    if (hero.dir === 'East')  bx = 1;

    const target = getTileData((tx + bx) * 16, (ty + by) * 16, world, room);
    if (target.tileID === 17) { 
        hero.isFishing = true;
        hero.hasBite = false;
        hero.bobberX = (tx + bx) * 16 + 8;
        hero.bobberY = (ty + by) * 16 + 8;

        if (socket) socket.emit('requestCastLine', { tx: tx + bx, ty: ty + by });
        inputState.action = false;
    }
}

function processFishing(modifier) {
    if (!hero.hasBite) {
        hero.fishTimer -= modifier;
        if (hero.fishTimer <= 0) hero.hasBite = true; 
    } else if (inputState.action) {
        if (socket) socket.emit('requestReelIn');
        inputState.action = false;
    }
}

// src/interactionManager.js

function processPickup(tx, ty) {
    if (hero.inventory.length >= hero.maxSlots) return false;

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
                let extractedHouseId = (typeID === 61) ? (traits & 0xFFFF) : undefined;
                let itemName = (typeID === 61) ? `Key to House #${extractedHouseId}` : template.name;

                if (socket) {
                    socket.emit('requestPickup', {
                        tx, ty,
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

    const plantKey = `${tx}_${ty}`;
    if (plants.has(plantKey)) {
        // ⚡ OPTIMISTIC HARVEST: Instant local removal (0ms perceptible delay)
        const plant = plants.get(plantKey);
        const cx = Math.floor(tx / 100);
        const cy = Math.floor(ty / 100);
        const lx = ((tx % 100) + 100) % 100;
        const ly = ((ty % 100) + 100) % 100;
        
        import('./plants.js').then(m => {
            const grid = m.plantChunks.get(`${cx}_${cy}`);
            if (grid) grid[(ly * 100) + lx] = null;
            m.plants.delete(plantKey);
        });

        if (socket && socket.connected) {
            socket.emit('requestHarvest', { tx, ty });
        }
        return true;
    }

    return false; 
}

export function updateHeroStats(modifier, hero) {
    if (hero.charClass === 'Overseer') {
        hero.hp = hero.maxHp;
        hero.energy = hero.maxEnergy;
        return;
    }

    // Cooldown management
    for (let i = 0; i < 4; i++) {
        if (hero.cooldowns[i] > 0) {
            hero.cooldowns[i] = Math.max(0, hero.cooldowns[i] - modifier);
        }
    }
    if (hero.attackTimer < 0) {
        hero.attackTimer += modifier; 
    } else if (!hero.isWindingUp) {
        hero.attackTimer = Math.max(0, hero.attackTimer - modifier);
    }

    // Energy drain & Lethal Starvation $\rightarrow$ Corpse Spawn
    if (hero.hp > 0) {
        hero.energy = Math.max(0, hero.energy - (CONFIG.ENERGY_DRAIN_RATE * modifier));
        
        if (hero.energy <= 0) {
            hero.energy = 0;
            hero.hp = 0; 
            console.log("💀 You starved to death! A lootable corpse has formed.");
            
            // Spawn Corpse on Starvation
            spawnCorpse(hero.x, hero.y, hero.wallet || "Hero", hero.inventory, true);
            hero.inventory = [];
            syncInventoryWithServer();

            if (socket) socket.emit('updateStats', { hp: 0, energy: 0 });
        }
    }

    // Buff decay
    if (hero.buffs?.isAscended) {
        hero.ascensionTimer -= modifier;
        if (hero.ascensionTimer <= 0) {
            hero.buffs.isAscended = false;
            hero.maxHp -= 100;
            hero.hp = Math.max(1, Math.min(hero.hp, hero.maxHp)); 
            hero.armor -= 20;
            hero.mr -= 20;
        }
    }

    if (hero.buffs?.isInvincible) {
        hero.invincibleTimer -= modifier;
        if (hero.invincibleTimer <= 0) {
            hero.buffs.isInvincible = false;
            if (socket) socket.emit('updateStats', { isInvincible: false });
        }
    }

    if (hero.buffs?.zephyrSpeedTimer > 0) {
        hero.buffs.zephyrSpeedTimer -= modifier;
        if (hero.buffs.zephyrSpeedTimer <= 0) recalculateStats(); 
    }

    if (hero.bulwarkTimer > 0) {
        hero.bulwarkTimer -= modifier;
        if (hero.bulwarkTimer <= 0) {
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

    // CC flags
    let currentMask = 0;
    if (hero.activeCCs) {
        for (let i = hero.activeCCs.length - 1; i >= 0; i--) {
            hero.activeCCs[i].timer -= modifier;
            if (hero.activeCCs[i].timer <= 0) hero.activeCCs.splice(i, 1);
            else currentMask |= hero.activeCCs[i].mask; 
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

    if (hero.pet?.active) {
        updatePetAI(modifier, hero.pet);
    }
}

export function handlePvPCombat(modifier, worldMatrix, roomMatrix, hero, remotePlayers) {
    if (hero.target) {
        if (hero.target.isAnimal) {
            const live = animals.find(a => a.id === hero.target.id);
            if (live) { hero.target.x = live.x; hero.target.y = live.y; hero.target.hp = live.hp; }
        } else if (hero.target.isHobbit) {
            const live = hobbits.find(h => h.id === hero.target.id);
            if (live) { hero.target.x = live.x; hero.target.y = live.y; hero.target.hp = live.hp; }
        } else {
            const live = remotePlayers.get(hero.target.id);
            if (live) { hero.target.x = live.x; hero.target.y = live.y; hero.target.hp = live.hp; } 
        }
    }

    const isManualMove = (inputState.moveX !== 0 || inputState.moveY !== 0 || (inputState.inputType === 'touch' && inputState.leftJoystick.active));

    if (inputState.mainBtn) {
        import('./combat.js').then(c => {
            c.scanForTarget(hero, 150, worldMatrix, roomMatrix);
            if (c.currentTarget) {
                hero.target = c.currentTarget;
                c.setLockedTarget(c.currentTarget);
                if (!isManualMove) hero.isAttacking = true;
            }
        });
    } else if (!hero.isAttacking) {
        hero.target = null;
        import('./combat.js').then(c => c.setLockedTarget(null));
    }

    if (hero.hp <= 0 || isManualMove) {
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

                if (hero.buffs?.vaultEmpowered) { 
                    finalDamage += (hero.ad * 0.4); 
                    hero.buffs.vaultEmpowered = false; 
                }
                if (hero.buffs?.fluxShotEmpowered) { 
                    finalDamage += (hero.ad * 0.20); 
                    hero.buffs.fluxShotEmpowered = false; 
                    fluxShieldToGain = finalDamage * 0.28; 
                }

                if (hero.target.isOre) {
                    if (hero.equipment.mainHand?.seedType === 'tool_pickaxe') {
                        if (socket) socket.emit('mineOreStrike', { oreId: hero.target.id });
                    }
                } 
                else if (hero.target.isAnimal) { 
                    hero.target.hp -= finalDamage; 
                } 
                // In src/interactionManager.js -> inside handlePvPCombat around line 540:
                // In src/interactionManager.js -> inside handlePvPCombat():
                else if (hero.target.isHobbit) {
                    applyPlayerDamage(hero.target, finalDamage);
                    
                    // 🎯 Optimistic local damage application
                    hero.target.hp = Math.max(0, hero.target.hp - finalDamage);
                    const localHob = hobbits.find(h => h.id === hero.target.id);
                    if (localHob) {
                        localHob.hp = hero.target.hp;
                    }

                    const attackerId = playerWallet || "Hero";
                    const crimeLoc = { x: Math.floor(hero.x / 16), y: Math.floor(hero.y / 16) };
                    const isKill = (hero.target.hp <= 0);
                    const secretType = isKill ? SECRET_TYPES.MURDER : SECRET_TYPES.ATTACK;
                    const secret = createSecret(secretType, attackerId, crimeLoc, { victimName: hero.target.name });

                    // 1. Victim registers secret and reacts immediately
                    learnSecret(hero.target, secret);
                    if (hero.target.courage === 'FIGHT') {
                        hero.target.combatTargetId = attackerId;
                        hero.target.thoughtBubble = { icon: '⚔️', timer: 3.0 };
                    } else {
                        hero.target.isFleeing = true;
                        hero.target.flagTargetStep = 'LAST_KNOWN';
                        hero.target.thoughtBubble = { icon: '😱', timer: 3.0 };
                    }

                    // 2. Alert all witnesses within 250px
                    hobbits.forEach(witness => {
                        if (witness.id !== hero.target.id && Math.hypot(witness.x - hero.x, witness.y - hero.y) < 250) {
                            learnSecret(witness, secret);
                            if (witness.courage === 'FIGHT' && witness.villageRole === 'CITIZEN') {
                                witness.thoughtBubble = { icon: '⚔️', timer: 3.0 };
                            } else if (witness.villageRole === 'GUARD' || witness.villageRole === 'QUARTERMASTER') {
                                witness.thoughtBubble = { icon: '🚨', timer: 3.0 };
                            } else {
                                witness.isFleeing = true;
                                witness.flagTargetStep = 'LAST_KNOWN';
                                witness.thoughtBubble = { icon: '😱', timer: 3.0 };
                            }
                        }
                    });
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
        } else {
            const dx = (hero.target.x + 8) - (hero.x + 8);
            const dy = (hero.target.y + 8) - (hero.y + 8);
            const attackRange = hero.attackRange || 24;

            if ((dx * dx) + (dy * dy) <= attackRange * attackRange) {
                hero.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : (dy > 0 ? 'South' : 'North');
                if (hero.attackTimer >= 0) hero.isWindingUp = true;
            }
        }
    }
}

function applyPlayerDamage(target, damage) {
    if (socket) {
        socket.emit('pvpAttack', { targetId: target.id, damage });
    }
}

export function upgradeStat(statName) {
    const info = getLevelInfo(hero.xp);
    const spentPoints = (hero.spentPoints || 0);
    if (info.points - spentPoints <= 0) return; 

    if (statName === 'hp') { hero.maxHp += 10; hero.hp += 10; }
    else if (statName === 'speed') { hero.spentSpeedPoints = (hero.spentSpeedPoints || 0) + 1; }
    else if (statName === 'ad') { hero.spentAdPoints = (hero.spentAdPoints || 0) + 1; }
    else if (statName === 'armor') hero.armor += 1;
    else if (statName === 'mr') hero.mr += 1;
    else if (statName === 'magic') hero.magic += 1;

    hero.spentPoints = spentPoints + 1;
    recalculateStats();
}

function updateSpells(modifier) {
    for (let i = hero.projectiles.length - 1; i >= 0; i--) {
        let p = hero.projectiles[i];
        p.x += p.dx * p.speed * modifier;
        p.y += p.dy * p.speed * modifier;
        p.life -= modifier;

        if (p.life <= 0) {
            applyAoEHeal(p.x, p.y, 40, p.healTick);
            hero.aoeZones.push({
                x: p.x, y: p.y, radius: 40, life: 4.0, tickTimer: 0, healAmount: hero.magic * 0.1 
            });
            hero.projectiles.splice(i, 1);
        }
    }

    for (let i = hero.aoeZones.length - 1; i >= 0; i--) {
        let z = hero.aoeZones[i];
        z.life -= modifier;

        if (z.type === 'radiantNova') {
            if (z.life <= 0) {
                if (socket) socket.emit('abilityAoE', { type: 'radiantNovaExplosion', x: z.x, y: z.y, radius: z.radius, damage: z.damage });
                hero.aoeZones.splice(i, 1);
            }
            continue; 
        }

        if (z.type === 'consecration') {
            z.tickTimer -= modifier;
            if (z.tickTimer <= 0) {
                if (socket) socket.emit('abilityAoE', { type: 'consecrationTick', x: z.x, y: z.y, radius: z.radius, damage: z.damage });
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

        if (z.life <= 0) hero.aoeZones.splice(i, 1);
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
        if (pdx * pdx + pdy * pdy <= radius * radius && socket) {
            socket.emit('healPlayer', { targetId: id, amount });
        }
    });
}

function updatePetAI(modifier, pet) {
    pet.life -= modifier;
    if (pet.life <= 0 || pet.hp <= 0) {
        pet.active = false;
        const p16Index = hero.skills.indexOf('p16');
        if (p16Index !== -1) hero.cooldowns[p16Index] = 120.0; 
        return; 
    }

    pet.healTimer -= modifier;
    if (pet.healTimer <= 0) {
        const healAmount = hero.magic * 0.20;
        hero.hp = Math.min(hero.maxHp, hero.hp + healAmount);
        if (socket) socket.emit('updateStats', { hp: hero.hp });
        pet.healTimer = 10.0; 
    }

    let targetX = hero.x + 8, targetY = hero.y + 8;
    let isAttacking = false, enemyTarget = null;

    if (pet.overrideTarget) {
        targetX = pet.overrideTarget.x;
        targetY = pet.overrideTarget.y;
        if (Math.hypot(pet.x - targetX, pet.y - targetY) < 16) pet.overrideTarget = null; 
    } else {
        let nearestDist = 200; 
        remotePlayers.forEach((p) => {
            if (p.hp <= 0) return;
            const dist = Math.hypot((p.x + 8) - pet.x, (p.y + 8) - pet.y);
            if (dist < nearestDist) { nearestDist = dist; enemyTarget = p; }
        });

        if (enemyTarget) {
            targetX = enemyTarget.x + 8;
            targetY = enemyTarget.y + 8;
            if (nearestDist < 24) isAttacking = true;
        }
    }

    if (!isAttacking) {
        const dx = targetX - pet.x, dy = targetY - pet.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 16) { 
            pet.dx = dx; pet.dy = dy; 
            pet.x += (dx / dist) * pet.speed * modifier;
            pet.y += (dy / dist) * pet.speed * modifier;
        } else {
            pet.dx = 0; pet.dy = 0; 
        }
    } else {
        pet.dx = 0; pet.dy = 0; 
    }

    pet.attackTimer -= modifier;
    if (isAttacking && pet.attackTimer <= 0 && enemyTarget) {
        pet.attackTimer = 1.5; 
        if (socket) socket.emit('pvpAttack', { targetId: enemyTarget.id, damage: pet.ad });
    }
}

export function handleFinancialActions() {
    if (inputState.keyP) {
        inputState.keyP = false;
        hero.isMoving = false;
        openWithdrawMenu(); 
    }
}