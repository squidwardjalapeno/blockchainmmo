// src/combat.js
import { remotePlayers } from './multiplayer.js';
import { animals } from './animals.js';
import { getTileData } from './physics.js';
import { hobbits } from './hobbitCore.js';

export let currentTarget = null; // The passive "hover" target
export let lockedTarget = null;  // The active "I am attacking this" target

export function setLockedTarget(target) {
    lockedTarget = target;
}

if (typeof window !== 'undefined') logStep("combat.js");

export function scanForTarget(hero, range = 150, worldMatrix, roomMatrix) {
    if (lockedTarget) {
        currentTarget = lockedTarget;
        return;
    }

    let bestTarget = null;
    let nearestDist = Infinity; 

    // 🎯 1. DETERMINE HERO'S CURRENT ROOM
    // (0 and 9999 are considered outdoor wilderness / non-building zones)
    const heroTile = getTileData(hero.x + 8, hero.y + 15, worldMatrix, roomMatrix);
    const heroRoomRaw = heroTile ? (heroTile.roomID || 0) : 0;
    const heroHouseId = (heroRoomRaw === 9999) ? 0 : heroRoomRaw;

    const checkEntity = (entity) => {
        if (!entity || entity.hp <= 0) return;

        // 🎯 2. ROOM & BUILDING ISOLATION CHECK
        // Heroes outdoors cannot target entities inside houses, and heroes indoors can ONLY target entities inside that exact room
        if (worldMatrix && roomMatrix) {
            const entTile = getTileData(entity.x + 8, entity.y + 15, worldMatrix, roomMatrix);
            const entRoomRaw = entTile ? (entTile.roomID || 0) : 0;
            const entHouseId = (entRoomRaw === 9999) ? 0 : entRoomRaw;

            if (heroHouseId !== entHouseId) {
                return; // Blocked: Cannot target through walls or between indoor/outdoor boundaries
            }
        }

        const dx = (entity.x + 8) - (hero.x + 8);
        const dy = (entity.y + 8) - (hero.y + 8);
        const distSq = dx * dx + dy * dy;

        // 🎯 3. ALLIED HOBBIT FILTER
        // Prevents auto-targeting friendly hobbits belonging to your owned village
        const isAlly = entity.isHobbit && (() => {
            if (entity.cachedWell === undefined && typeof window !== 'undefined' && window.getVillageAt) {
                const hx = entity.homeX || Math.floor(entity.x / 16);
                const hy = entity.homeY || Math.floor(entity.y / 16);
                entity.cachedWell = window.getVillageAt(hx, hy);
            }
            const well = entity.cachedWell;
            if (well && window.villageOwners) {
                const data = window.villageOwners.get(`${well.x}_${well.y}`);
                const playerWallet = window.playerWallet;
                return data && data.owner === playerWallet;
            }
            return false;
        })();

        if (isAlly) return;

        // 🎯 4. NEAREST PROXIMITY CHECK
        if (distSq < range * range && distSq < nearestDist) {
            nearestDist = distSq;
            bestTarget = entity;
        }
    };

    // Scan all live entity pools
    remotePlayers.forEach(checkEntity);
    animals.forEach(checkEntity);
    hobbits.forEach(checkEntity);

    // 🎯 5. SCAN FOR ORE DEPOSITS (Tile 29 - Only when outdoors)
    if (worldMatrix && roomMatrix && heroHouseId === 0) {
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
                            hp: 1, 
                            maxHp: 1 
                        };
                    }
                }
            }
        }
    }

    currentTarget = bestTarget;
}

export function validateTarget(hero, range = 250, worldMatrix, roomMatrix) {
    if (lockedTarget) {
        const dx = lockedTarget.x - hero.x;
        const dy = lockedTarget.y - hero.y;
        
        let sameRoom = true;
        if (worldMatrix && roomMatrix && !lockedTarget.isOre) {
            const heroTile = getTileData(hero.x + 8, hero.y + 15, worldMatrix, roomMatrix);
            const entTile = getTileData(lockedTarget.x + 8, lockedTarget.y + 15, worldMatrix, roomMatrix);
            const heroHouse = (heroTile?.roomID === 9999) ? 0 : (heroTile?.roomID || 0);
            const entHouse = (entTile?.roomID === 9999) ? 0 : (entTile?.roomID || 0);
            sameRoom = (heroHouse === entHouse);
        }

        if (lockedTarget.hp <= 0 || (dx * dx + dy * dy) > range * range || !sameRoom) {
            lockedTarget = null;
            hero.isAttacking = false;
            hero.target = null;
            hero.isWindingUp = false;
        }
    }
}