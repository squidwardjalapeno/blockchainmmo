// src/combat.js
import { remotePlayers } from './multiplayer.js';
import { animals } from './animals.js';
import { getTileData } from './physics.js';
import { hobbits } from './hobbits.js'; // 👈 IMPORT HOBBITS



export let currentTarget = null; // The passive "hover" target
export let lockedTarget = null;  // The active "I am attacking this" target

// 👇 ADD THIS SETTER FUNCTION:
export function setLockedTarget(target) {
    lockedTarget = target;
}

if (typeof window !== 'undefined') logStep("combat.js");

// inside src/combat.js

export function scanForTarget(hero, range = 150, worldMatrix, roomMatrix) {
    if (lockedTarget) {
        currentTarget = lockedTarget;
        return;
    }

    let bestTarget = null;
    let nearestDist = Infinity; 

    const checkEntity = (entity) => {
        if (entity.hp <= 0) return;
        const dx = entity.x - hero.x;
        const dy = entity.y - hero.y;
        const distSq = dx * dx + dy * dy;

        // Skip targeting automated locking sweeps if the hobbit belongs to our owned village
        const isAlly = entity.isHobbit && typeof window !== 'undefined' && window.getVillageAt && (() => {
            const hx = entity.homeX || Math.floor(entity.x / 16);
            const hy = entity.homeY || Math.floor(entity.y / 16);
            const well = window.getVillageAt(hx, hy);
            if (well && window.villageOwners) {
                const data = window.villageOwners.get(`${well.x}_${well.y}`);
                const playerWallet = window.playerWallet;
                return data && data.owner === playerWallet;
            }
            return false;
        })();

        if (isAlly) return; 

        if (distSq < range * range && distSq < nearestDist) {
            nearestDist = distSq;
            bestTarget = entity;
        }
    };

    remotePlayers.forEach(checkEntity);
    animals.forEach(checkEntity);
    hobbits.forEach(checkEntity); 

    // Scan the local map area for Ore Deposits (Tile 29)
    if (worldMatrix && roomMatrix) {
        const hTX = Math.floor((hero.x + 8) / 16);
        const hTY = Math.floor((hero.y + 8) / 16);
        const tileRange = Math.ceil(range / 16);

        for (let ox = -tileRange; ox <= tileRange; ox++) {
            for (let oy = -tileRange; oy <= tileRange; oy++) {
                const tx = hTX + ox;
                const ty = hTY + oy;
                const tData = getTileData(tx * 16, ty * 16, worldMatrix, roomMatrix);
                
                if (tData && tData.tileID === 29) { 
                    const dx = (tx * 16 + 8) - (hero.x + 8);
                    const dy = (ty * 16 + 8) - (hero.y + 8);
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < range * range && distSq < nearestDist) {
                        nearestDist = distSq;
                        bestTarget = {
                            id: `ore_${tx}_${ty}`,
                            x: tx * 16,
                            y: ty * 16,
                            isOre: true,
                            hp: 1, maxHp: 1 
                        };
                    }
                }
            }
        }
    }

    currentTarget = bestTarget;
}

export function validateTarget(hero, range = 250) {
    if (lockedTarget) {
        const dx = lockedTarget.x - hero.x;
        const dy = lockedTarget.y - hero.y;
        if (lockedTarget.hp <= 0 || (dx * dx + dy * dy) > range * range) {
            lockedTarget = null;
            hero.isAttacking = false;
            hero.target = null; // 👈 FIX: Ensure hero's reference is also dropped!
            hero.isWindingUp = false;
        }
    }
}