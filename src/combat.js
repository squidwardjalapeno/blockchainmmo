// src/combat.js
import { remotePlayers } from './multiplayer.js';
import { animals } from './animals.js';

export let currentTarget = null;

if (typeof window !== 'undefined') {
    logStep("combat.js");
}

/**
 * PvP Style: Find the nearest Remote Player or Animal in range
 * Priority is given to the entity with the lowest HP
 */
export function findPriorityTarget(hero, range = 150) {
    let bestTarget = null;
    let lowestHP = Infinity;

    // 1. Scan Players
    remotePlayers.forEach((player) => {
        const dx = player.x - hero.x;
        const dy = player.y - hero.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < range * range && player.hp > 0) {
            if (player.hp < lowestHP) { 
                lowestHP = player.hp;
                bestTarget = player;
            }
        }
    });

    // 2. Scan Animals
    animals.forEach((anim) => {
        const dx = anim.x - hero.x;
        const dy = anim.y - hero.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < range * range && anim.hp > 0) {
            if (anim.hp < lowestHP) { 
                lowestHP = anim.hp;
                bestTarget = anim;
            }
        }
    });

    currentTarget = bestTarget;
    return bestTarget;
}

export function validateTarget(hero, range = 250) {
    if (!currentTarget) return;

    const dx = currentTarget.x - hero.x;
    const dy = currentTarget.y - hero.y;
    const distSq = dx * dx + dy * dy;

    if (currentTarget.hp <= 0 || distSq > range * range) {
        console.log(`🎯 TARGET LOST | HP: ${currentTarget.hp}`);
        currentTarget = null;
        hero.isAttacking = false;
        hero.isWindingUp = false;
    }
}