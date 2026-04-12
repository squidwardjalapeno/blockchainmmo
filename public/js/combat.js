// js/combat.js
import { remotePlayers } from './multiplayer.js';

export let currentTarget = null;

/**
 * PvP Style: Find the nearest Remote Player in range
 * Priority is given to the player with the lowest HP
 */
export function findPriorityTarget(hero, range = 150) {
    let bestTarget = null;
    let lowestHP = Infinity;

    // We now iterate through remotePlayers (Map) instead of animals
    remotePlayers.forEach((player) => {
        const dx = player.x - hero.x;
        const dy = player.y - hero.y;
        const distSq = dx * dx + dy * dy;

        // Only target players who are alive and in range
        if (distSq < range * range && player.hp > 0) {
            if (player.hp < lowestHP) { 
                lowestHP = player.hp;
                bestTarget = player;
            }
        }
    });

    // Update global target reference
    currentTarget = bestTarget;
    return bestTarget;
}

/**
 * Logic to clear the target if they die or move too far away
 */
export function validateTarget(hero, range = 250) {
    if (!currentTarget) return;

    const dx = currentTarget.x - hero.x;
    const dy = currentTarget.y - hero.y;
    const distSq = dx * dx + dy * dy;

    // 🕵️ THE PROOF LOG
    if (currentTarget.hp <= 0 || distSq > range * range) {
        console.log(`🎯 TARGET LOST | HP: ${currentTarget.hp} | Dist: ${Math.sqrt(distSq).toFixed(1)}px (Limit: ${range}px)`);
        
        currentTarget = null;
        hero.isAttacking = false;
        hero.isWindingUp = false;
    }
}

/**
 * CLEANUP: Projectiles are removed for Bare Bones PvP
 * If you want to add them back later (spells), you can re-insert 
 * the spawnProjectile logic here.
 */
