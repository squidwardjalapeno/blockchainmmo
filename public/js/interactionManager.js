import { hero, getLevelInfo } from './entities.js';
import { getTileData, checkCollision } from './physics.js';
import { ITEM_TYPES, createItem } from './items.js';
import { plants } from './plants.js';
import { getBacteriaData, seedBacteria } from './bacteria.js';
import { inputState } from './input.js';
import { socket, playerWallet, pendingVouchers, remotePlayers } from './multiplayer.js';

import { redeemAllVouchers, withdrawPoints, refreshOnChainPoints } from './blockchainManager.js';


// 🛑 ADD THIS LINE (or add it to your existing combat.js import)
import { findPriorityTarget, currentTarget } from './combat.js';
// js/interactionManager.js
import { getWaitModifier, getRandomFish, globalFishCount } from './fish.js';

/**
 * 💡 MAIN ENTRY POINT: Call this in your game loop update()
 */
export function handleInteractions(modifier, worldMatrix, roomMatrix) {
    const tx = Math.floor((hero.x + 8) / 16);
    const ty = Math.floor((hero.y + 14) / 16);

    // 🛑 EARLY EXIT: If the hero is currently moving, they can't interact
    if (hero.isMoving) return;

    // --- 1. FISHING STATE (Active) ---
    // If we are already fishing, we only care about reeling in
    if (hero.isFishing) {
        processFishing(modifier);
        return;
    }

    // --- 2. PICKUP / HARVEST (Key E) ---
    if (inputState.interact) {
        processPickup(tx, ty);
        inputState.interact = false;
    }

    // --- 3. DROP ITEM (Key G) ---
    if (inputState.drop && hero.inventory.length > 0) {
        const item = hero.inventory.pop();
        seedBacteria(tx, ty, item.seedType, item.health, item.virulence);
        inputState.drop = false;
    }

    // --- 4. ACTION (Key Space / Main Button) ---
    // This handles Fire, Well, or Casting a line
    if (inputState.action) {
        processAction(tx, ty, worldMatrix, roomMatrix);
    }
}

/**
 * Handles "Stationary" actions: Cooking, Banking, or Casting a line
 */
function processAction(tx, ty, worldMatrix, roomMatrix) {
    let nearFire = false;
    let nearWell = false;
    const wellTiles = [30, 31, 38, 39];

    // Scan 3x3 area for special objects
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const check = getTileData((tx + ox) * 16, (ty + oy) * 16, worldMatrix, roomMatrix);
            if (check.tileID === 62) nearFire = true;
            if (wellTiles.includes(check.tileID)) nearWell = true;
        }
    }

    if (nearFire) {
        handleCooking();
    } else if (nearWell) {
        handleWellSacrifice();
    } else {
        // If not near a fire or well, try to cast a fishing line
        processCasting(tx, ty, worldMatrix, roomMatrix);
    }
}

/**
 * 🍳 COOKING LOGIC
 */
function handleCooking() {
    if (hero.inventory.length === 0) return;
    const topItem = hero.inventory[hero.inventory.length - 1];

    if (topItem.name === "River Bass" && topItem.health > 0) {
        hero.inventory.pop();
        hero.inventory.push(createItem(ITEM_TYPES.COOKED_BASS));
        console.log("🔥 SIZZLE! Fish cooked.");
        inputState.action = false;
    }
}

/**
 * 🏦 WELL SACRIFICE LOGIC
 */
function handleWellSacrifice() {
    if (hero.inventory.length === 0) return;
    if (!playerWallet) {
        console.warn("🚫 Connect wallet to bank points!");
        return;
    }

    const item = hero.inventory.pop();
    socket.emit('sacrificeToWell', {
        itemType: item.seedType,
        health: item.health,
        virulence: item.virulence,
        playerWalletAddress: playerWallet
    });
    console.log(`💎 Sacrificed ${item.name}`);
    inputState.action = false;
}

/**
 * 🎣 CASTING LOGIC
 */
function processCasting(tx, ty, world, room) {
    let bx = 0, by = 0;
    if (hero.dir === 'Up')    by = -1;
    if (hero.dir === 'Down')  by = 1;
    if (hero.dir === 'Left')  bx = -1;
    if (hero.dir === 'Right') bx = 1;

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
            hero.inventory.push(caughtFish);
            
            console.log(`🎣 Caught a ${caughtFish.name}! World Pop: ${Math.floor(globalFishCount)}`);
        }
        hero.isFishing = false;
        hero.hasBite = false;
        inputState.action = false;
    }
}

/**
 * 🌱 PICKUP LOGIC
 */
function processPickup(tx, ty) {
    const plantKey = `${tx}_${ty}`;
    const bac = getBacteriaData(tx, ty);
    const traits = bac.data[bac.idx];

    if (plants.has(plantKey) && hero.inventory.length < hero.maxSlots) {
        hero.inventory.push(createItem(ITEM_TYPES.UPROOTED_GRASS));
        plants.delete(plantKey);
        bac.data[bac.idx] = 0;
    } 
    else if (traits > 0 && hero.inventory.length < hero.maxSlots) {
        const typeID = (traits >> 20) & 0x0F;
        const template = Object.values(ITEM_TYPES).find(t => t.seedType === getSeedTypeFromID(typeID));
        if (template) {
            const item = createItem(template);
            item.health = traits & 0xFF;
            item.virulence = (traits >> 8) & 0xFF;
            hero.inventory.push(item);
            bac.data[bac.idx] = 0;
        }
    }
}

// js/interactionManager.js

export function updateHeroStats(modifier, hero) {
    // 1. If we are in "Cooldown" (negative), move back to 0
    if (hero.attackTimer < 0) {
        hero.attackTimer += modifier; 
    } 
    // 2. ONLY subtract if we ARE NOT currently winding up for a punch!
    else if (!hero.isWindingUp) {
        hero.attackTimer = Math.max(0, hero.attackTimer - modifier);
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

            // Simple movement logic: No Sin, Cos, or Atan2
            let moveX = 0;
            let moveY = 0;

            if (dx > 2)      moveX = hero.speed * modifier;
            else if (dx < -2) moveX = -hero.speed * modifier;
            
            if (dy > 2)      moveY = hero.speed * modifier;
            else if (dy < -2) moveY = -hero.speed * modifier;

            if (checkCollision(hero.x + moveX, hero.y + moveY, worldMatrix, roomMatrix, hero)) {
                hero.x += moveX;
                hero.y += moveY;
            }

            // Update Direction for animations
            if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx > 0 ? 'Right' : 'Left';
            else hero.dir = dy > 0 ? 'Down' : 'Up';
            
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
                    applyPlayerDamage(hero.target, hero.ad);
                    
                    hero.isWindingUp = false;      
                    hero.attackTimer = -1.7; // This triggers the Lunge in drawHero
                    
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

    // Withdrawal (Point to Token)
    if (inputState.keyP) {
        inputState.keyP = false;
        if (hero.onChainPoints >= 100) {
            hero.isMoving = false;
            withdrawPoints(100);
        }
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
