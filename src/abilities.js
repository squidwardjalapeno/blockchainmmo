// src/abilities.js

import { checkCollision } from './physics.js';
import { remotePlayers } from './multiplayer.js'; 
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
            let dx = inputState.aim.dx;
            let dy = inputState.aim.dy;

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

            hero.dashTimer = 0.2;
            hero.dashVector = { x: dx * 240, y: dy * 240 };
            hero.animState = 'rolling';
            hero.animTimer = 0; hero.attackTimer = 0;
            hero.isWindingUp = false; hero.isAttacking = false; 
            hero.buffs.vaultEmpowered = true;
        }
    },

    // ==========================================
    // p2 - STANCE TOGGLE
    // ==========================================
    'p2': {
        id: 'p2',
        name: 'Holy Shield / Holy Blast',
        cooldown: 0.25, 
        execute: (hero, inputState) => {
            if (hero.p2_stance === 'blast') {
                hero.p2_stance = 'shield';
                console.log("🛡️ Stance: HOLY SHIELD");
            } else {
                hero.p2_stance = 'blast';
                console.log("💥 Stance: HOLY BLAST");
            }
        }
    },

    // ==========================================
    // p3 - DIVINE BUBBLE
    // ==========================================
    'p3': {
        id: 'p3', name: 'Divine Bubble', cooldown: 12.0,
        isCleanse: true, 
        isMovement: false,
        execute: (hero, inputState) => {
            let targetIsSelf = true;
            let targetAllyId = null;

            if (targetIsSelf) {
                console.log("🛡️ Self-Cast: DIVINE BUBBLE!");
                hero.buffs.divineBubble = true;
                
                hero.activeCCs = []; 
                hero.slowTimer = 0;  
                
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
    // p4 - ASCENSION
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

            if (dx === 0 && dy === 0) {
                if (hero.dir.includes('North')) dy = -1;
                if (hero.dir.includes('South')) dy = 1;
                if (hero.dir.includes('West')) dx = -1;
                if (hero.dir.includes('East')) dx = 1;
                mag = 0.5; 
            } else {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist>0) { dx/=dist; dy/=dist; }
            }

            const maxRange = 200;
            const targetX = (hero.x + 8) + (dx * maxRange * mag);
            const targetY = (hero.y + 8) + (dy * maxRange * mag);

            hero.aoeZones.push({
                type: 'radiantNova',
                x: targetX, y: targetY,
                radius: 32, 
                life: 0.6,  
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
        cooldown: 5.0, 
        execute: (hero, inputState) => {
            console.log("💫 Flux Shot Activated!");
            hero.buffs.fluxShotEmpowered = true;

            hero.attackTimer = 0;
            hero.isWindingUp = false;
            hero.isAttacking = false; 
        }
    },

    // ==========================================
    // p7 - WARP
    // ==========================================
    'p7': {
        id: 'p7', name: 'Warp', cooldown: 12.0, 
        execute: (hero, inputState, worldMatrix, roomMatrix) => {
            if (hero.energy < 40) {
                console.log("Not enough energy for Warp!");
                return 0; 
            }

            let dx = inputState.aim.dx; let dy = inputState.aim.dy;
            let mag = inputState.aim.mag || 1.0;

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

            const maxWarpDist = 80; 
            const targetX = hero.x + (dx * maxWarpDist * mag);
            const targetY = hero.y + (dy * maxWarpDist * mag);

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

                if (!checkCollision(testX + left, testY + top, worldMatrix, roomMatrix, hero)) canMove = false;
                if (!checkCollision(testX + right, testY + top, worldMatrix, roomMatrix, hero)) canMove = false;
                if (!checkCollision(testX + left, testY + bottom, worldMatrix, roomMatrix, hero)) canMove = false;
                if (!checkCollision(testX + right, testY + bottom, worldMatrix, roomMatrix, hero)) canMove = false;

                if (canMove) {
                    safeX = testX;
                    safeY = testY;
                } else {
                    break; 
                }
            }

            hero.warpTimer = 0.1; 
            hero.warpTarget = { x: safeX, y: safeY };
        }
    },

    // ==========================================
    // p8 - HEAVEN'S HALO
    // ==========================================
    'p8': {
        id: 'p8', name: "Heaven's Halo", cooldown: 70.0, 
        execute: (hero, inputState) => {
            if (hero.energy < 40) {
                console.log("Not enough energy for Heaven's Halo!");
                return 0; 
            }

            console.log("👼 HEAVEN'S HALO ACTIVATED!");
            hero.energy -= 40;
            hero.buffs.isInvincible = true;
            hero.invincibleTimer = 6.0; 

            import('./multiplayer.js').then(module => {
                if (module.socket) module.socket.emit('updateStats', { isInvincible: true });
            });
        }
    },

    // ==========================================
    // p9 - FLARE
    // ==========================================
    'p9': {
        id: 'p9', name: 'Flare', cooldown: 2.5, 
        execute: (hero, inputState) => {
            if (hero.energy < 15) {
                console.log("Not enough energy for Flare!");
                return 0; 
            }

            let dx = inputState.aim.dx; let dy = inputState.aim.dy;
            
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

            const damage = hero.magic * 0.35;

            import('./multiplayer.js').then(module => {
                if (module.socket) {
                    module.socket.emit('fireProjectile', {
                        type: 'flare',
                        x: hero.x + 8,
                        y: hero.y + 8,
                        dx: dx,
                        dy: dy,
                        speed: 300, 
                        life: 0.6,  
                        radius: 6,  
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
                return 0; 
            }

            hero.energy -= 20;
            console.log("⏳ Charging Ring of Penance...");
            
            hero.castTimer = 0.3;
            hero.castSpellId = 'p11';
            
            hero.animState = 'idle'; 
            hero.isMoving = false;
        }
    },

    // ==========================================
    // p12 - ZEPHYR
    // ==========================================
    'p12': {
        id: 'p12', name: 'Zephyr', cooldown: 12.0, 
        isMovement: false,
        execute: (hero, inputState) => {
            const targetId = inputState.aim.targetId;
            
            if (!targetId) {
                console.log("❌ Zephyr requires a target!");
                return 0; 
            }

            if (hero.energy < 25) {
                console.log("❌ Not enough energy for Zephyr!");
                return 0; 
            }

            hero.energy -= 25;
            console.log(`💨 Casting Zephyr on ${targetId}!`);

            hero.buffs.zephyrSpeedTimer = 2.5;
            import('./interactionManager.js').then(m => m.recalculateStats());

            import('./multiplayer.js').then(m => {
                if (m.socket) {
                    m.socket.emit('fireHomingProjectile', {
                        type: 'zephyr',
                        targetId: targetId,
                        damage: hero.magic * 0.25, 
                        skillIndex: hero.skills.indexOf('p12') 
                    });
                }
            });

            return 12.0; 
        }
    },

    // ==========================================
    // p13 - VANGUARD
    // ==========================================
    'p13': {
        id: 'p13', name: 'Vanguard', cooldown: 8.0, 
        isMovement: false,
        execute: (hero, inputState) => {
            const targetId = inputState.aim.targetId;
            
            if (!targetId) {
                console.log("❌ Vanguard requires a target!");
                return 0; 
            }

            if (hero.energy < 15) {
                console.log("❌ Not enough energy for Vanguard!");
                return 0; 
            }

            hero.energy -= 15;
            console.log(`💎 Casting Vanguard on ${targetId}!`);

            import('./multiplayer.js').then(m => {
                if (m.socket) {
                    m.socket.emit('fireHomingProjectile', {
                        type: 'vanguard',
                        targetId: targetId,
                        damage: hero.magic * 0.15, 
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
        id: 'p14', name: 'Consecration', cooldown: 12.0, 
        isMovement: false,
        execute: (hero, inputState) => {
            if (hero.energy < 25) {
                console.log("Not enough energy for Consecration!");
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

            hero.energy -= 25;
            console.log("🔥 Casting Consecration!");

            const maxRange = 150; 
            const targetX = (hero.x + 8) + (dx * maxRange * mag);
            const targetY = (hero.y + 8) + (dy * maxRange * mag);

            hero.aoeZones.push({
                type: 'consecration',
                x: targetX, y: targetY,
                radius: 48, 
                life: 4.0,  
                tickTimer: 0, 
                damage: hero.magic * 0.04 
            });
        }
    },

    // ==========================================
    // p15 - FLEETING BULWARK
    // ==========================================
    'p15': {
        id: 'p15', name: 'Fleeting Bulwark', cooldown: 15.0, 
        isMovement: false,
        execute: (hero, inputState) => {
            if (hero.energy < 20) {
                console.log("Not enough energy for Fleeting Bulwark!");
                return 0; 
            }

            const bonusArmor = Math.floor(hero.magic * 0.07);
            const bonusMr = Math.floor(hero.magic * 0.04);
            const speedMultiplier = 1.25 + (hero.magic * 0.0005); 

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

            if (targetIsSelf) {
                console.log("🛡️ Self-Cast: Fleeting Bulwark!");
                
                hero.bulwarkTimer = 5.0;
                hero.bulwarkArmorBonus = bonusArmor;
                hero.bulwarkMrBonus = bonusMr;
                hero.bulwarkSpeedBonus = speedMultiplier;

                hero.armor += bonusArmor;
                hero.mr += bonusMr;

                import('./interactionManager.js').then(m => m.recalculateStats());

                import('./multiplayer.js').then(module => {
                    if (module.socket) module.socket.emit('updateStats', { armor: hero.armor, mr: hero.mr });
                });

            } else {
                console.log(`🛡️ Ally-Cast: Fleeting Bulwark on ${targetAllyId}!`);
                
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
    // p16 - ZENITH GUARDIAN
    // ==========================================
    'p16': {
        id: 'p16', name: 'Zenith Guardian', cooldown: 120.0,
        isMovement: false,
        execute: (hero, inputState) => {
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
                return 1.0; 
            }

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

            return 1.0; 
        }
    },
};

export function executeAbility(hero, skillIndex, inputState, worldMatrix, roomMatrix) {
    if (!hero.skills || !hero.skills[skillIndex]) return; 
    
    const unlockLevels = [1, 25, 50, 75];
    const currentLevel = getLevelInfo(hero.xp).level;
    
    if (currentLevel < unlockLevels[skillIndex]) {
        console.log(`🔒 Skill Locked! Requires Level ${unlockLevels[skillIndex]}.`);
        return; 
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

export const PALADIN_SKILLS = [
    { id: 'p1', name: 'Vault', icon: '⚔️' },
    { id: 'p2', name: 'Holy Shield / Holy Blast', icon: '✨' },
    { id: 'p3', name: 'Divine Bubble', icon: '🛡️' },
    { id: 'p4', name: "Ascension / Lion's Breath", icon: '🏃' },
    { id: 'p5', name: 'Radiant Nova', icon: '💪' },
    { id: 'p6', name: 'Flux Shot', icon: '🔥' },
    { id: 'p7', name: 'Warp', icon: '🦁' },
    { id: 'p8', name: "Heaven's Halo", icon: '🌪️' },
    { id: 'p9', name: 'Flare', icon: '🔨' },
    { id: 'p10', name: 'Fever', icon: '🤲' },
    { id: 'p11', name: 'Ring of Penance', icon: '⚡' },
    { id: 'p12', name: 'Zephyr', icon: '🔆' },
    { id: 'p13', name: 'Vanguard', icon: '👁️' },
    { id: 'p14', name: 'Consecration', icon: '💥' },
    { id: 'p15', name: 'Fleeting Bulwark', icon: '😤' },
    { id: 'p16', name: 'Summon: Zenith Guardian', icon: '🗡️' }
];