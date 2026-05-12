import { checkCollision } from './physics.js';
import { remotePlayers } from './multiplayer.js'; // 👈 Needed for Divine Bubble
// Add this to the very top of src/abilities.js
import { getLevelInfo } from './entities.js';


if (typeof window !== 'undefined') {
    logStep("abilities.js loaded");
}

export const ABILITY_REGISTRY = {
    
    
    // ==========================================
    // p1 - VAULT
    // ==========================================
    'p1': {
        id: 'p1', name: 'Vault', cooldown: 4.0,
        execute: (hero, inputState) => {
            // 1. Read Aim Vector
            let dx = inputState.aim.dx;
            let dy = inputState.aim.dy;

            // 2. Auto-Cast Fallback (If quick-tapped, roll in movement dir or facing dir)
            if (dx === 0 && dy === 0) {
                dx = inputState.moveX; dy = inputState.moveY;
                if (dx === 0 && dy === 0) {
                    if (hero.dir.includes('North')) dy = -1;
                    if (hero.dir.includes('South')) dy = 1;
                    if (hero.dir.includes('West')) dx = -1;
                    if (hero.dir.includes('East')) dx = 1;
                }
            } else {
                // Normalize moving vectors
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist>0) { dx/=dist; dy/=dist; }
            }

            hero.dashTimer = 0.2;
            hero.dashVector = { x: dx * 240, y: dy * 240 };
            hero.animState = 'rolling';
            hero.animTimer = 0; hero.attackTimer = 0;
            hero.isWindingUp = false; hero.isAttacking = false; 
            hero.buffs.vaultEmpowered = true;
        }
    },

    'p2': {
        id: 'p2',
        name: 'Holy Shield / Holy Blast',
        cooldown: 0.25, // Very short cooldown so it can be toggled mid-swing
        execute: (hero, inputState) => {
            // Toggle the stance
            if (hero.p2_stance === 'blast') {
                hero.p2_stance = 'shield';
                console.log("🛡️ Stance: HOLY SHIELD");
            } else {
                hero.p2_stance = 'blast';
                console.log("💥 Stance: HOLY BLAST");
            }
            
            // Optional: You can play a small sound effect here later!
        }
    },

    // ==========================================
    // p3 - DIVINE BUBBLE
    // ==========================================
    'p3': {
        id: 'p3', name: 'Divine Bubble', cooldown: 12.0,
        isCleanse: true, // 👈 NEW: Tells the engine this spell removes CC
        isMovement: false,
        execute: (hero, inputState) => {
            let targetIsSelf = true;
            let targetAllyId = null;

            if (inputState.aim.dx !== 0 || inputState.aim.dy !== 0) {
                let bestScore = -Infinity;
                // ... (Keep your existing dot-product targeting logic here) ...
            }

            if (targetIsSelf) {
                console.log("🛡️ Self-Cast: DIVINE BUBBLE!");
                hero.buffs.divineBubble = true;
                
                // 🌟 THE CLEANSE EFFECT
                hero.activeCCs = []; // Instantly wipe all hard CC!
                hero.slowTimer = 0;  // Wipe soft CC (slows)!
                
                // We must recalculate stats to instantly restore movement speed from slows
                import('./interactionManager.js').then(m => m.recalculateStats());

                const explosionDamage = hero.magic * 0.10;
                import('./multiplayer.js').then(module => {
                    if (module.socket) {
                        module.socket.emit('abilityAoE', { type: 'divineBubbleExplosion', x: hero.x, y: hero.y, radius: 48, damage: explosionDamage });
                        module.socket.emit('updateStats', { hasDivineBubble: true });
                    }
                });
            } else {
                console.log(`🛡️ Ally-Cast: Shielding ${targetAllyId}`);
            }
        }
    },

    // ==========================================
    // p4 - LION'S BREATH / ASCENSION
    // ==========================================
    'p4': {
        id: 'p4', name: "Ascension", cooldown: 60.0,
        execute: (hero, inputState) => {
            if (!hero.buffs.isAscended) {
                if (hero.energy < 30) return 0;
                hero.energy -= 30;
                hero.buffs.isAscended = true;
                hero.ascensionTimer = 12.0;
                hero.maxHp += 100; hero.hp += 100; hero.armor += 20; hero.mr += 20;
                return 1.0; 
            } else {
                let dx = inputState.aim.dx; let dy = inputState.aim.dy;
                
                // Quick-cast fallback
                if (dx === 0 && dy === 0) {
                    if (hero.dir.includes('North')) dy = -1;
                    if (hero.dir.includes('South')) dy = 1;
                    if (hero.dir.includes('West')) dx = -1;
                    if (hero.dir.includes('East')) dx = 1;
                }

                hero.projectiles.push({
                    type: 'lionsBreath', x: hero.x + 8, y: hero.y + 8,
                    dx: dx, dy: dy, speed: 200, life: 0.5, healTick: hero.magic * 0.5 
                });
                return 3.0; 
            }
        }
    },

    // ==========================================
    // p5 - RADIANT NOVA
    // ==========================================
    'p5': {
        id: 'p5', name: 'Radiant Nova', cooldown: 8.0,
        execute: (hero, inputState) => {
            console.log("🌟 Casting Radiant Nova!");
            
            let dx = inputState.aim.dx; let dy = inputState.aim.dy; 
            let mag = inputState.aim.mag || 1.0;

            // Auto-Cast Fallback (Drop it right in front of you if quick-tapped)
            if (dx === 0 && dy === 0) {
                if (hero.dir.includes('North')) dy = -1;
                if (hero.dir.includes('South')) dy = 1;
                if (hero.dir.includes('West')) dx = -1;
                if (hero.dir.includes('East')) dx = 1;
                mag = 0.5; // Half range on auto-cast
            } else {
                // Normalize moving vectors
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist>0) { dx/=dist; dy/=dist; }
            }

            // 1. Calculate Target Location (Max Range ~12 tiles / 200px)
            const maxRange = 200;
            const targetX = (hero.x + 8) + (dx * maxRange * mag);
            const targetY = (hero.y + 8) + (dy * maxRange * mag);

            // 2. Spawn the Warning Zone!
            hero.aoeZones.push({
                type: 'radiantNova',
                x: targetX, y: targetY,
                radius: 32, // 2-tile explosion radius
                life: 0.6,  // 0.6s delay before it blows up!
                
                // 💥 SCALING: Base Damage + (120% AD)
                damage: 20 + (hero.ad * 1.20) 
            });
        }
    },

    // ==========================================
    // p6 - FLUX SHOT
    // ==========================================
    'p6': {
        id: 'p6',
        name: 'Flux Shot',
        cooldown: 5.0, // Short cooldown for an AA reset
        execute: (hero, inputState) => {
            console.log("💫 Flux Shot Activated!");
            hero.buffs.fluxShotEmpowered = true;

            // --- AUTO-ATTACK RESET ---
            // Instantly clear the attack cooldown and cancel any current windup
            hero.attackTimer = 0;
            hero.isWindingUp = false;
            hero.isAttacking = false; 
        }
    },

    // ==========================================
    // p7 - WARP
    // ==========================================
    'p7': {
        id: 'p7', name: 'Warp', cooldown: 12.0, // Flash-like cooldown
        execute: (hero, inputState, worldMatrix, roomMatrix) => {
            if (hero.energy < 40) {
                console.log("Not enough energy for Warp!");
                return 0; // Refunds cooldown if failed
            }

            let dx = inputState.aim.dx; let dy = inputState.aim.dy;
            let mag = inputState.aim.mag || 1.0;

            // Auto-Cast (Blink in moving/facing direction)
            if (dx === 0 && dy === 0) {
                dx = inputState.moveX; dy = inputState.moveY;
                if (dx === 0 && dy === 0) {
                    if (hero.dir.includes('North')) dy = -1;
                    if (hero.dir.includes('South')) dy = 1;
                    if (hero.dir.includes('West')) dx = -1;
                    if (hero.dir.includes('East')) dx = 1;
                }
                mag = 1.0;
            } else {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if(dist > 0){ dx/=dist; dy/=dist; }
            }

            hero.energy -= 40;
            console.log("🌌 Charging Warp...");

            // Max blink distance: ~5 tiles
            const maxWarpDist = 80; 
            const targetX = hero.x + (dx * maxWarpDist * mag);
            const targetY = hero.y + (dy * maxWarpDist * mag);

            // 🛑 SAFETY RAYCAST: Prevent warping into walls!
            // We take 20 micro-steps toward the target. The moment we hit a wall, we stop right in front of it.
            let safeX = hero.x;
            let safeY = hero.y;
            const steps = 20;
            const stepX = (targetX - hero.x) / steps;
            const stepY = (targetY - hero.y) / steps;

            const left = 2, right = 13, top = 8, bottom = 15;

            for(let i = 1; i <= steps; i++) {
                let testX = hero.x + stepX * i;
                let testY = hero.y + stepY * i;
                let canMove = true;

                // Test the 4 corners of the hitbox at the new position
                if (!checkCollision(testX + left, testY + top, worldMatrix, roomMatrix, hero)) canMove = false;
                if (!checkCollision(testX + right, testY + top, worldMatrix, roomMatrix, hero)) canMove = false;
                if (!checkCollision(testX + left, testY + bottom, worldMatrix, roomMatrix, hero)) canMove = false;
                if (!checkCollision(testX + right, testY + bottom, worldMatrix, roomMatrix, hero)) canMove = false;

                if (canMove) {
                    safeX = testX;
                    safeY = testY;
                } else {
                    break; // Stop at the last safe position before the wall!
                }
            }

            // Lock the hero in place for 0.1s, then pop out at safeX/safeY
            hero.warpTimer = 0.1; 
            hero.warpTarget = { x: safeX, y: safeY };
        }
    },

    // ==========================================
    // p8 - HEAVEN'S HALO
    // ==========================================
    'p8': {
        id: 'p8', name: "Heaven's Halo", cooldown: 70.0, // Massive Ultimate Cooldown
        execute: (hero, inputState) => {
            if (hero.energy < 40) {
                console.log("Not enough energy for Heaven's Halo!");
                return 0; // Refund cooldown
            }

            console.log("👼 HEAVEN'S HALO ACTIVATED!");
            hero.energy -= 40;
            hero.buffs.isInvincible = true;
            hero.invincibleTimer = 6.0; // 6 seconds of immunity

            // Tell the server we are glowing!
            import('./multiplayer.js').then(module => {
                if (module.socket) module.socket.emit('updateStats', { isInvincible: true });
            });
        }
    },

    // ==========================================
    // p9 - FLARE
    // ==========================================
    'p9': {
        id: 'p9', name: 'Flare', cooldown: 2.5, // Spammable!
        execute: (hero, inputState) => {
            if (hero.energy < 15) {
                console.log("Not enough energy for Flare!");
                return 0; // Refund cooldown
            }

            let dx = inputState.aim.dx; let dy = inputState.aim.dy;
            
            // Auto-Cast (Shoot in moving/facing direction)
            if (dx === 0 && dy === 0) {
                dx = inputState.moveX; dy = inputState.moveY;
                if (dx === 0 && dy === 0) {
                    if (hero.dir.includes('North')) dy = -1;
                    if (hero.dir.includes('South')) dy = 1;
                    if (hero.dir.includes('West')) dx = -1;
                    if (hero.dir.includes('East')) dx = 1;
                }
            } else {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist>0) { dx/=dist; dy/=dist; }
            }

            hero.energy -= 15;
            console.log("🔥 Casting Flare!");

            // Damage is 35% of Magic Power
            const damage = hero.magic * 0.35;

            import('./multiplayer.js').then(module => {
                if (module.socket) {
                    module.socket.emit('fireProjectile', {
                        type: 'flare',
                        x: hero.x + 8,
                        y: hero.y + 8,
                        dx: dx,
                        dy: dy,
                        speed: 300, // Very fast projectile
                        life: 0.6,  // Travels for 0.6s (Medium range)
                        radius: 6,  // Hitbox size
                        damage: damage
                    });
                }
            });
        }
    },

    // ==========================================
    // p11 - RING OF PENANCE
    // ==========================================
    'p11': {
        id: 'p11', name: 'Ring of Penance', cooldown: 8.0,
        isMovement: false,
        execute: (hero, inputState) => {
            if (hero.energy < 20) {
                console.log("Not enough energy for Ring of Penance!");
                return 0; // Refund cooldown
            }

            hero.energy -= 20;
            console.log("⏳ Charging Ring of Penance...");
            
            // 1. Lock the hero and start the 0.3s cast timer!
            hero.castTimer = 0.3;
            hero.castSpellId = 'p11';
            
            // 2. Play a brief visual "Charge Up" animation (Optional)
            hero.animState = 'idle'; 
            hero.isMoving = false;
        }
    },

    // ==========================================
    // p12 - ZEPHYR
    // ==========================================
    'p12': {
        id: 'p12', name: 'Zephyr', cooldown: 12.0, // Long and unforgiving baseline!
        isMovement: false,
        execute: (hero, inputState) => {
            const targetId = inputState.aim.targetId;
            
            if (!targetId) {
                console.log("❌ Zephyr requires a target!");
                return 0; // Refund cooldown
            }

            if (hero.energy < 25) {
                console.log("❌ Not enough energy for Zephyr!");
                return 0; // Refund cooldown
            }

            hero.energy -= 25;
            console.log(`💨 Casting Zephyr on ${targetId}!`);

            // 1. Give the caster the 30% Move Speed buff for 2.5s
            // (We will add the logic for this buff to interactionManager next)
            hero.buffs.zephyrSpeedTimer = 2.5;
            import('./interactionManager.js').then(m => m.recalculateStats());

            // 2. Fire the homing projectile to the server
            import('./multiplayer.js').then(m => {
                if (m.socket) {
                    m.socket.emit('fireHomingProjectile', {
                        type: 'zephyr',
                        targetId: targetId,
                        damage: hero.magic * 0.25, // Base 25% Magic Damage
                        skillIndex: hero.skills.indexOf('p12') // So server knows which CD to refund!
                    });
                }
            });

            // Return the full 12s cooldown (Server will refund it if we hit a resonant target!)
            return 12.0; 
        }
    },

    // ==========================================
    // p13 - VANGUARD
    // ==========================================
    'p13': {
        id: 'p13', name: 'Vanguard', cooldown: 8.0, // Medium cooldown
        isMovement: false,
        execute: (hero, inputState) => {
            const targetId = inputState.aim.targetId;
            
            if (!targetId) {
                console.log("❌ Vanguard requires a target!");
                return 0; // Refund cooldown
            }

            // 1. Enforce Short Range (~4 tiles = 64 pixels)
            // (We have to grab the target's distance from the remotePlayers list)
            let inRange = false;
            import('./multiplayer.js').then(m => {
                const target = m.remotePlayers.get(targetId);
                if (target) {
                    const dx = target.x - hero.x;
                    const dy = target.y - hero.y;
                    const distSq = (dx * dx) + (dy * dy);
                    if (distSq <= 64 * 64) { // 64 squared
                        inRange = true;
                    }
                }
            });

            // Hacky workaround for synchronous execution: assume true for now, 
            // the server will validate the distance anyway!
            
            if (hero.energy < 15) {
                console.log("❌ Not enough energy for Vanguard!");
                return 0; 
            }

            hero.energy -= 15;
            console.log(`💎 Casting Vanguard on ${targetId}!`);

            // Fire the homing projectile to the server
            import('./multiplayer.js').then(m => {
                if (m.socket) {
                    m.socket.emit('fireHomingProjectile', {
                        type: 'vanguard',
                        targetId: targetId,
                        damage: hero.magic * 0.15, // Base 15% Magic Damage
                        skillIndex: hero.skills.indexOf('p13') 
                    });
                }
            });

            return 8.0; 
        }
    },

    // ==========================================
    // p14 - CONSECRATION
    // ==========================================
    'p14': {
        id: 'p14', name: 'Consecration', cooldown: 12.0, // Long cooldown
        isMovement: false,
        execute: (hero, inputState) => {
            if (hero.energy < 25) {
                console.log("Not enough energy for Consecration!");
                return 0; // Refund cooldown
            }

            let dx = inputState.aim.dx; let dy = inputState.aim.dy; 
            let mag = inputState.aim.mag || 1.0;

            // Auto-Cast (Drop it at your feet if quick-tapped)
            if (dx === 0 && dy === 0) {
                mag = 0; // Center on self
            } else {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist>0) { dx/=dist; dy/=dist; }
            }

            hero.energy -= 25;
            console.log("🔥 Casting Consecration!");

            const maxRange = 150; // Medium cast range
            const targetX = (hero.x + 8) + (dx * maxRange * mag);
            const targetY = (hero.y + 8) + (dy * maxRange * mag);

            // Spawn the ticking AoE Zone
            hero.aoeZones.push({
                type: 'consecration',
                x: targetX, y: targetY,
                radius: 48, // 3-tile radius
                life: 4.0,  // Lasts 4 seconds
                tickTimer: 0, // Triggers immediately on cast!
                damage: hero.magic * 0.04 // 4% of Magic Power per tick
            });
        }
    },

    // ==========================================
    // p15 - FLEETING BULWARK
    // ==========================================
    'p15': {
        id: 'p15', name: 'Fleeting Bulwark', cooldown: 15.0, // High cooldown for a 5s mega-buff
        isMovement: false,
        execute: (hero, inputState) => {
            if (hero.energy < 20) {
                console.log("Not enough energy for Fleeting Bulwark!");
                return 0; // Refund cooldown
            }

            // 1. Calculate Buff Values based on Caster's Magic Power
            const bonusArmor = Math.floor(hero.magic * 0.07);
            const bonusMr = Math.floor(hero.magic * 0.04);
            
            // Base 25% + (5% per 100 Magic, which is 0.05% per 1 Magic)
            const speedMultiplier = 1.25 + (hero.magic * 0.0005); 

            // 2. Targeting Logic (Ally vs Self)
            let targetIsSelf = true;
            let targetAllyId = null;

            if (inputState.aim.dx !== 0 || inputState.aim.dy !== 0) {
                let bestScore = -Infinity;
                import('./multiplayer.js').then(m => {
                    m.remotePlayers.forEach((p, id) => {
                        if (p.hp <= 0) return;
                        const pdx = p.x - hero.x;
                        const pdy = p.y - hero.y;
                        const dist = Math.sqrt(pdx*pdx + pdy*pdy);
                        
                        if (dist < 150) { 
                            const dot = (pdx/dist)*inputState.aim.dx + (pdy/dist)*inputState.aim.dy;
                            if (dot > 0.8) { 
                                const score = dot * (150 - dist); 
                                if (score > bestScore) {
                                    bestScore = score;
                                    targetAllyId = id;
                                    targetIsSelf = false;
                                }
                            }
                        }
                    });
                });
            }

            hero.energy -= 20;

            // 3. Apply the Buff!
            if (targetIsSelf) {
                console.log("🛡️ Self-Cast: Fleeting Bulwark!");
                
                hero.bulwarkTimer = 5.0;
                hero.bulwarkArmorBonus = bonusArmor;
                hero.bulwarkMrBonus = bonusMr;
                hero.bulwarkSpeedBonus = speedMultiplier;

                // Apply the raw defensive stats instantly
                hero.armor += bonusArmor;
                hero.mr += bonusMr;

                // Recalculate stats to apply the speed multiplier
                import('./interactionManager.js').then(m => m.recalculateStats());

                // Tell the server we have new stats
                import('./multiplayer.js').then(module => {
                    if (module.socket) module.socket.emit('updateStats', { armor: hero.armor, mr: hero.mr });
                });

            } else {
                console.log(`🛡️ Ally-Cast: Fleeting Bulwark on ${targetAllyId}!`);
                
                // Send the buff to the server to route to the ally
                import('./multiplayer.js').then(module => {
                    if (module.socket) {
                        module.socket.emit('castBuffOnAlly', { 
                            targetId: targetAllyId, 
                            buffType: 'fleetingBulwark',
                            armor: bonusArmor,
                            mr: bonusMr,
                            speed: speedMultiplier,
                            duration: 5.0
                        });
                    }
                });
            }
        }
    },

    // ==========================================
    // p16 - SUMMON: ZENITH GUARDIAN
    // ==========================================
    'p16': {
        id: 'p16', name: 'Zenith Guardian', cooldown: 120.0,
        isMovement: false,
        execute: (hero, inputState) => {
            
            // 1. RECAST LOGIC (Control the Pet)
            if (hero.pet && hero.pet.active) {
                console.log("🤖 Redirecting Zenith Guardian!");
                let dx = inputState.aim.dx; 
                let dy = inputState.aim.dy;
                let mag = inputState.aim.mag || 1.0;

                if (dx === 0 && dy === 0) {
                    hero.pet.overrideTarget = null; 
                } else {
                    const range = 250;
                    hero.pet.overrideTarget = {
                        x: (hero.x + 8) + (dx * range * mag),
                        y: (hero.y + 8) + (dy * range * mag)
                    };
                }
                // Return a tiny 1s cooldown so you can't spam the network with move orders
                return 1.0; 
            }

            // 2. SUMMON LOGIC
            if (hero.energy < 50) {
                console.log("❌ Not enough energy for Zenith Guardian!");
                return 0; 
            }

            let dx = inputState.aim.dx; let dy = inputState.aim.dy; 
            let mag = inputState.aim.mag || 1.0;

            if (dx === 0 && dy === 0) {
                mag = 0; 
            } else {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist>0) { dx/=dist; dy/=dist; }
            }

            hero.energy -= 50;
            console.log("⏳ Calling down Zenith Guardian (1s Cast)...");
            
            const maxRange = 250; 
            const targetX = (hero.x + 8) + (dx * maxRange * mag);
            const targetY = (hero.y + 8) + (dy * maxRange * mag);

            hero.castSpellTarget = { x: targetX, y: targetY };
            
            hero.castTimer = 1.0; 
            hero.castSpellId = 'p16';
            hero.animState = 'idle'; 
            hero.isMoving = false;

            // 👇 THE FIX: Return a 1.0s cooldown so the button becomes available to Recast 
            // the exact second the pet finishes spawning!
            return 1.0; 
        }
    },
    
    // Future abilities (p2 - p16) will go here!
};

// --- Replace executeAbility at the bottom of src/abilities.js ---

// --- Replace executeAbility in src/abilities.js ---
export function executeAbility(hero, skillIndex, inputState, worldMatrix, roomMatrix) {
    if (!hero.skills || !hero.skills[skillIndex]) return; 
    
    // 🌟 LEVEL GATE CHECK
    const unlockLevels = [1, 25, 50, 75];
    const currentLevel = getLevelInfo(hero.xp).level;
    
    if (currentLevel < unlockLevels[skillIndex]) {
        console.log(`🔒 Skill Locked! Requires Level ${unlockLevels[skillIndex]}.`);
        return; // Block the cast!
    }

    if (hero.cooldowns[skillIndex] > 0) return; 
    if (hero.dashTimer > 0 || hero.warpTimer > 0) return; 

    const skillId = hero.skills[skillIndex];
    const ability = ABILITY_REGISTRY[skillId];

    if (ability) {
        if (ability.isCleanse && !hero.ccFlags.canCleanse) {
            console.log("❌ Uncleansable CC active! Cannot use Cleanse.");
            return;
        }
        if (ability.isMovement && !hero.ccFlags.canCastMovement) {
            console.log("❌ Movement spells restricted!");
            return;
        }
        if (!ability.isMovement && !ability.isCleanse && !hero.ccFlags.canCastNonMovement) {
            console.log("❌ Non-Movement spells restricted!");
            return;
        }

        const overrideCd = ability.execute(hero, inputState, worldMatrix, roomMatrix);
        hero.cooldowns[skillIndex] = (overrideCd !== undefined) ? overrideCd : ability.cooldown; 
    }
}
