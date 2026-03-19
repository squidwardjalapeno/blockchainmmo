export const projectiles = [];
export let currentTarget = null;

/**
 * Wild Rift Style: Find lowest HP (Hunger) target in range
 */
export function findPriorityTarget(hero, animals, range = 150) {
    let bestTarget = null;
    let lowestHP = Infinity;

    animals.forEach(animal => {
        const dx = animal.x - hero.x;
        const dy = animal.y - hero.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < range * range) {
            // Using hunger as the health metric
            if (animal.hunger < lowestHP) { 
                lowestHP = animal.hunger;
                bestTarget = animal;
            }
        }
    });

    currentTarget = bestTarget;
    return bestTarget;
}

/**
 * Skillshot Spawner
 */
export function spawnProjectile(owner, targetX, targetY, speed, damage, size) {
    const dx = targetX - owner.x;
    const dy = targetY - owner.y;
    // Safety check to avoid division by zero
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    projectiles.push({
        x: owner.x,
        y: owner.y,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        damage: damage,
        radius: size,
        life: 1.5, 
        owner: owner
    });
}

/**
 * The Combat "Engine"
 */
export function updateProjectiles(modifier, animals) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * modifier;
        p.y += p.vy * modifier;
        p.life -= modifier;

        // Check collision with Animals
        for (let j = 0; j < animals.length; j++) {
            const target = animals[j];
            const dx = p.x - target.x;
            const dy = p.y - target.y;
            const distSq = dx * dx + dy * dy;

            // Collision: p.radius + target size (8)
            if (distSq < (p.radius + 8) ** 2) {
                applyDamage(target, p.damage);
                p.life = 0; // Destroy projectile
                break;
            }
        }

        if (p.life <= 0) projectiles.splice(i, 1);
    }
}

/**
 * Ecosystem Damage: In this world, damage = hunger!
 * If hunger hits 100, the animal "starves" into a drop.
 */
function applyDamage(target, amount) {
    target.hunger = Math.min(100, target.hunger + amount);
    console.log(`💥 Hit! Target Hunger: ${Math.floor(target.hunger)}`);
}
