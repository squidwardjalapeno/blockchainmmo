// src/combat.js
import { remotePlayers } from './multiplayer.js';
import { animals } from './animals.js';

export let currentTarget = null; // The passive "hover" target
export let lockedTarget = null;  // The active "I am attacking this" target

// 👇 ADD THIS SETTER FUNCTION:
export function setLockedTarget(target) {
    lockedTarget = target;
}

if (typeof window !== 'undefined') logStep("combat.js");

// Runs constantly to find the nearest valid thing to punch
export function scanForTarget(hero, range = 150) {
    // If we are actively fighting someone, don't change the hover target!
    if (lockedTarget) {
        currentTarget = lockedTarget;
        return;
    }

    let bestTarget = null;
    let nearestDist = Infinity; // Wild Rift prioritizes DISTANCE over HP for passive targeting

    const checkEntity = (entity) => {
        if (entity.hp <= 0) return;
        const dx = entity.x - hero.x;
        const dy = entity.y - hero.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < range * range && distSq < nearestDist) {
            nearestDist = distSq;
            bestTarget = entity;
        }
    };

    remotePlayers.forEach(checkEntity);
    animals.forEach(checkEntity);

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