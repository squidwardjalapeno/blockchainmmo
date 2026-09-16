// src/hobbitManager.js
import { getTileData } from './physics.js';
import { getTilePath, isTilePassable } from './hobbitNavigation.js';
import { worldTime } from './clock.js';
import { socket, chestCache, remotePlayers, myID, doorStates } from './multiplayer.js';
import { plants, deletePlant } from './plants.js';
import { createItem, ITEM_TYPES } from './items.js';
import { hobbits, giveItemToHobbit, getHobbitVillage, YIELD_MAP } from './hobbitCore.js';
import { hero } from './entities.js';
import { trySocialGossip, learnSecret, SECRET_TYPES } from './secrets.js';
import { spawnCorpse } from './corpses.js';
import { staticObjects } from './staticObjects.js';

export const macroTravelers = [];

export function updateHobbits(modifier, worldMatrix, roomMatrix) {
    // 1. Clean up deceased hobbits and spawn lootable corpses
    for (let i = hobbits.length - 1; i >= 0; i--) {
        if (hobbits[i].hp <= 0) {
            const dead = hobbits[i];
            spawnCorpse(dead.x, dead.y, dead.name, dead.inventory, false);
            hobbits.splice(i, 1);
        }
    }

    // 2. Tick individual brains and social interactions
    for (let i = 0; i < hobbits.length; i++) {
        tickHobbit(hobbits[i], modifier, worldMatrix, roomMatrix);

        // Social gossip & Secret Highway interaction check between neighbors
        for (let j = i + 1; j < hobbits.length; j++) {
            trySocialGossip(hobbits[i], hobbits[j]);
        }
    }
}

function tickHobbit(hobbit, delta, worldMatrix, roomMatrix) {
    // Metabolic & Social Drain
    hobbit.energy = Math.max(0, (hobbit.energy || 100) - (delta * 0.15));

    // Socialization decays slowly while working in isolation
    if (hobbit.goal !== 'social_walk') {
        hobbit.socialization = Math.max(0, (hobbit.socialization || 100) - (delta * 0.15));
    }

    if (hobbit.thoughtBubble) {
        hobbit.thoughtBubble.timer -= delta;
        if (hobbit.thoughtBubble.timer <= 0) hobbit.thoughtBubble = null;
    }

    // ========================================================================
    // 🏃 60 FPS VISUAL INTERPOLATION & STEP ENGINE
    // ========================================================================
    if (hobbit.path && hobbit.path.length > 0) {
        const nextNode = hobbit.path[0];
        const nextWorldX = nextNode.x * 16;
        const nextWorldY = nextNode.y * 16;

        const dx = nextWorldX - hobbit.x;
        const dy = nextWorldY - hobbit.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 1.5) {
            const speedMultiplier = (hobbit.combatTargetId || hobbit.isSearching || hobbit.isFleeing) ? 1.35 : 1.0;
            const step = Math.min(dist, hobbit.speed * speedMultiplier * delta);
            hobbit.x += (dx / dist) * step;
            hobbit.y += (dy / dist) * step;
            hobbit.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : (dy > 0 ? 'South' : 'North');
            hobbit.state = 'walking';

            hobbit.animTimer = (hobbit.animTimer || 0) + delta * 10;
            hobbit.frame = Math.floor(hobbit.animTimer) % 4;

            // 🚪 1. Auto-open doors underfoot or directly ahead in path
            const checkTX = Math.floor((hobbit.x + 8) / 16);
            const checkTY = Math.floor((hobbit.y + 8) / 16);

            const currentTile = getTileData(checkTX * 16 + 8, checkTY * 16 + 8, worldMatrix, roomMatrix);
            if (currentTile && [49, 12].includes(currentTile.tileID)) {
                setDoorOpen(checkTX, checkTY, true, worldMatrix, roomMatrix);
                hobbit.recentDoor = { x: checkTX, y: checkTY };
            }

            if (nextNode) {
                const nextTile = getTileData(nextNode.x * 16 + 8, nextNode.y * 16 + 8, worldMatrix, roomMatrix);
                if (nextTile && [49, 12].includes(nextTile.tileID)) {
                    setDoorOpen(nextNode.x, nextNode.y, true, worldMatrix, roomMatrix);
                    hobbit.recentDoor = { x: nextNode.x, y: nextNode.y };
                }
            }

            // 🚪 2. Auto-close doors behind the hobbit once stepped past (> 22px away)
            if (hobbit.recentDoor) {
                const doorCenterDist = Math.hypot(
                    (hobbit.x + 8) - (hobbit.recentDoor.x * 16 + 8), 
                    (hobbit.y + 8) - (hobbit.recentDoor.y * 16 + 8)
                );
                if (doorCenterDist > 22) {
                    setDoorOpen(hobbit.recentDoor.x, hobbit.recentDoor.y, false, worldMatrix, roomMatrix);
                    hobbit.recentDoor = null;
                }
            }
        } else {
            hobbit.x = nextWorldX;
            hobbit.y = nextWorldY;
            hobbit.path.shift();

            // Breadcrumbs to prevent 2x2 loop oscillations
            if (!hobbit.recentTiles) hobbit.recentTiles = [];
            hobbit.recentTiles.push(`${nextNode.x}_${nextNode.y}`);
            if (hobbit.recentTiles.length > 6) hobbit.recentTiles.shift();
        }
    } else if (hobbit.state !== 'attacking') {
        hobbit.state = 'idle';
        hobbit.frame = 0;
    }

    const currentTX = Math.floor((hobbit.x + 8) / 16);
    const currentTY = Math.floor((hobbit.y + 8) / 16);
    const currentRoomRaw = getTileData(hobbit.x + 8, hobbit.y + 8, worldMatrix, roomMatrix)?.roomID || 0;
    const currentRoom = (currentRoomRaw === 9999) ? 0 : currentRoomRaw;
    const now = Date.now();

    // ========================================================================
    // 📢 RALLY SHOUT PULSE (Spread threat to allies while in alert/combat)
    // ========================================================================
    if (hobbit.combatTargetId || hobbit.isSearching || hobbit.isFleeing) {
        hobbit.rallyPulseTimer = (hobbit.rallyPulseTimer || 0) - delta;
        if (hobbit.rallyPulseTimer <= 0) {
            hobbit.rallyPulseTimer = 1.2;
            const activeSecret = hobbit.secrets?.find(s => 
                (s.type === SECRET_TYPES.MURDER || s.type === SECRET_TYPES.ATTACK) && s.expiresAt > now
            );
            
            if (activeSecret) {
                hobbits.forEach(ally => {
                    if (ally.id !== hobbit.id && Math.hypot(ally.x - hobbit.x, ally.y - hobbit.y) <= 64) {
                        if (learnSecret(ally, activeSecret)) {
                            if (ally.courage === 'FIGHT' && ally.villageRole === 'CITIZEN') {
                                ally.thoughtBubble = { icon: '⚔️', timer: 2.5 };
                            } else if (ally.villageRole === 'GUARD' || ally.villageRole === 'QUARTERMASTER') {
                                ally.thoughtBubble = { icon: '🚨', timer: 2.5 };
                            } else {
                                ally.isFleeing = true;
                                ally.thoughtBubble = { icon: '😱', timer: 2.5 };
                            }
                        }
                    }
                });
            }
        }
    }

    // ========================================================================
    // ⚔️ 1. ACTIVE COMBAT PURSUIT
    // ========================================================================
    if (hobbit.combatTargetId) {
        const target = (hobbit.combatTargetId === myID || hobbit.combatTargetId === 'Hero' || (window.playerWallet && hobbit.combatTargetId === window.playerWallet))
            ? hero 
            : remotePlayers?.get(hobbit.combatTargetId);

        if (!target || target.hp <= 0) {
            hobbit.combatTargetId = null;
            hobbit.state = 'idle';
            return;
        }

        const targetTile = getTileData(target.x + 8, target.y + 15, worldMatrix, roomMatrix);
        const targetRoom = (targetTile?.roomID === 9999) ? 0 : (targetTile?.roomID || 0);
        const distToTarget = Math.hypot((target.x + 8) - (hobbit.x + 8), (target.y + 8) - (hobbit.y + 8));

        if (distToTarget <= 250) {
            hobbit.lastKnownTargetPos = { x: Math.floor((target.x + 8) / 16), y: Math.floor((target.y + 8) / 16) };
        }

        if (distToTarget <= 24 && currentRoom === targetRoom) {
            hobbit.path = [];
            hobbit.attackCooldown = (hobbit.attackCooldown || 0) - delta;
            if (hobbit.attackCooldown <= 0) {
                hobbit.state = 'attacking';
                hobbit.attackCooldown = 0.8;
                if (target === hero && hero.hp > 0) {
                    const heroArmor = Math.max(1, hero.armor || 1);
                    const armorReduction = Math.pow(0.5, Math.log10(heroArmor));
                    const finalDamage = Math.max(1, Math.floor(hobbit.ad * armorReduction));
                    hero.hp = Math.max(0, hero.hp - finalDamage);
                    if (socket) socket.emit('updateStats', { hp: hero.hp });
                }
            }
            return;
        }

        if (distToTarget <= 250) {
            hobbit.brainTimer = (hobbit.brainTimer || 0) - delta;
            if (hobbit.brainTimer <= 0) {
                hobbit.path = getTilePath(currentTX, currentTY, Math.floor((target.x + 8) / 16), Math.floor((target.y + 8) / 16), worldMatrix, roomMatrix, hobbit, 50);
                hobbit.brainTimer = 0.6;
            }
            return;
        }

        hobbit.combatTargetId = null;
        hobbit.isSearching = true;
        hobbit.searchTimer = 12.0;
        hobbit.thoughtBubble = { icon: '🔍', timer: 3.0 };
    }

    // ========================================================================
    // 🔍 2. SEARCHING LAST KNOWN LOCATION
    // ========================================================================
    if (hobbit.isSearching) {
        hobbit.searchTimer = (hobbit.searchTimer || 12.0) - delta;

        const criminalTarget = (hero && hero.hp > 0 && Math.hypot(hero.x - hobbit.x, hero.y - hobbit.y) <= 200) ? hero : null;
        if (criminalTarget) {
            hobbit.isSearching = false;
            hobbit.combatTargetId = window.playerWallet || 'Hero';
            hobbit.thoughtBubble = { icon: '❗', timer: 3.0 };
            return;
        }

        if (hobbit.searchTimer <= 0) {
            hobbit.isSearching = false;
            hobbit.lastKnownTargetPos = null;
            hobbit.path = [];
            hobbit.thoughtBubble = { icon: '🛡️', timer: 2.0 };
            return;
        }

        hobbit.brainTimer = (hobbit.brainTimer || 0) - delta;
        if (hobbit.brainTimer <= 0 && (!hobbit.path || hobbit.path.length === 0)) {
            const anchor = hobbit.lastKnownTargetPos || { x: currentTX, y: currentTY };
            const sweepOffsets = [
                { dx: 0, dy: 0 }, { dx: 5, dy: 0 }, { dx: -5, dy: 5 },
                { dx: 5, dy: -5 }, { dx: -5, dy: -5 }, { dx: 0, dy: 6 }
            ];
            hobbit.searchIndex = ((hobbit.searchIndex || 0) + 1) % sweepOffsets.length;
            const destX = anchor.x + sweepOffsets[hobbit.searchIndex].dx;
            const destY = anchor.y + sweepOffsets[hobbit.searchIndex].dy;

            hobbit.path = getTilePath(currentTX, currentTY, destX, destY, worldMatrix, roomMatrix, hobbit, 40);
            hobbit.brainTimer = 2.5;
        }
        return;
    }

    // ========================================================================
    // 🚨 3. THREAT RESPONSE & FLEEING
    // ========================================================================
    const crimeSecret = hobbit.secrets?.find(s => 
        (s.type === SECRET_TYPES.MURDER || s.type === SECRET_TYPES.ATTACK) && s.expiresAt > now
    );

    if (crimeSecret) {
        if (hobbit.courage === 'FLEE' && hobbit.villageRole === 'CITIZEN') {
            const distToPerp = Math.hypot(crimeSecret.location.x - currentTX, crimeSecret.location.y - currentTY);

            if (distToPerp >= 20) {
                hobbit.isFleeing = false;
                hobbit.secrets = hobbit.secrets.filter(s => s !== crimeSecret);
                hobbit.path = [];
                hobbit.thoughtBubble = { icon: '😌', timer: 2.0 };
            } else {
                hobbit.isFleeing = true;
                const retreatTargetX = hobbit.homeX ? hobbit.homeX + 1 : currentTX;
                const retreatTargetY = hobbit.homeY ? hobbit.homeY - 1 : currentTY;

                if (currentRoom === hobbit.houseId && hobbit.houseId !== null) {
                    hobbit.path = [];
                    hobbit.state = 'idle';
                    hobbit.thoughtBubble = { icon: '🔒', timer: 1.0 };
                    return;
                }

                hobbit.brainTimer = (hobbit.brainTimer || 0) - delta;
                if (hobbit.brainTimer <= 0 || !hobbit.path || hobbit.path.length === 0) {
                    hobbit.path = getTilePath(currentTX, currentTY, retreatTargetX, retreatTargetY, worldMatrix, roomMatrix, hobbit, 50);

                    if (!hobbit.path || hobbit.path.length === 0) {
                        const fleeDX = Math.sign(currentTX - crimeSecret.location.x) || 1;
                        const fleeDY = Math.sign(currentTY - crimeSecret.location.y) || 1;
                        const stepTX = Math.max(10, Math.min(9990, currentTX + fleeDX * 6));
                        const stepTY = Math.max(10, Math.min(9990, currentTY + fleeDY * 6));
                        hobbit.path = getTilePath(currentTX, currentTY, stepTX, stepTY, worldMatrix, roomMatrix, hobbit, 25);
                    }
                    hobbit.brainTimer = 1.0;
                }
                return;
            }
        }

        if (hobbit.villageRole === 'GUARD' || hobbit.villageRole === 'QUARTERMASTER') {
            const criminal = (crimeSecret.targetId === myID || crimeSecret.targetId === 'Hero' || crimeSecret.targetId === window.playerWallet)
                ? hero 
                : remotePlayers?.get(crimeSecret.targetId);

            if (criminal && criminal.hp > 0 && Math.hypot(criminal.x - hobbit.x, criminal.y - hobbit.y) <= 48) {
                hobbit.combatTargetId = crimeSecret.targetId;
                hobbit.thoughtBubble = { icon: '⚔️', timer: 3.0 };
                return;
            }

            hobbit.isSearching = true;
            hobbit.searchTimer = 15.0;
            hobbit.lastKnownTargetPos = { x: crimeSecret.location.x, y: crimeSecret.location.y };
            return;
        }
    } else {
        hobbit.isFleeing = false;
        hobbit.musterAlerted = false;
    }

    // ========================================================================
    // 🧠 4. STATE ENGINE: WORK ➔ SOCIAL STROLL ➔ STORAGE ➔ REST
    // ========================================================================
    hobbit.brainTimer = (hobbit.brainTimer || 0) - delta;
    if (hobbit.brainTimer > 0) return;
    hobbit.brainTimer = 0.4 + Math.random() * 0.2;

    const home = getOrCreateHomeMemory(hobbit);
    const nonKeyItems = (hobbit.inventory || []).filter(i => !i.isKey);
    const isBackpackFull = nonKeyItems.length >= 4;
    const isNight = worldTime.isNight;

    // ------------------------------------------------------------------------
    // 🌙 STATE: NIGHTTIME SHELTER & INSIDE LOCKING
    // ------------------------------------------------------------------------
    if (isNight && home) {
        if (nonKeyItems.length > 0) {
            hobbit.goal = 'deposit_chest';
        } else {
            hobbit.goal = 'sleep';
            const houseTile = getTileData(home.standX * 16 + 8, home.standY * 16 + 8, worldMatrix, roomMatrix);
            const houseRoomId = houseTile?.roomID || 0;

            // Inside house: close door, lock, and sleep in bedroll
            if (currentRoom === houseRoomId && houseRoomId !== 0) {
                setDoorOpen(home.doorX, home.doorY, false, worldMatrix, roomMatrix);
                setDoorLock(home.doorX, home.doorY, true);

                const nextToBed = Math.hypot(currentTX - home.bedrollX, currentTY - home.bedrollY) <= 1.5;
                if (nextToBed) {
                    hobbit.path = [];
                    hobbit.state = 'idle';
                    hobbit.energy = Math.min(100, (hobbit.energy || 0) + delta * 20);
                    if (Math.random() < 0.05 && !hobbit.thoughtBubble) {
                        hobbit.thoughtBubble = { icon: '💤', timer: 2.0 };
                    }
                    hobbit.brainTimer = 1.0;
                    return;
                } else {
                    hobbit.path = getTilePath(currentTX, currentTY, home.bedrollX, home.bedrollY, worldMatrix, roomMatrix, hobbit, 6);
                    return;
                }
            }

            // Outside: unlock own door and walk inside
            setDoorLock(home.doorX, home.doorY, false);
            navigateTowardPorchOrEnter(hobbit, currentTX, currentTY, currentRoom, home, { x: home.bedrollX, y: home.bedrollY }, worldMatrix, roomMatrix);
            return;
        }
    }

    // ------------------------------------------------------------------------
    // 📦 STATE: DEPOSIT (Backpack full or night deposit)
    // ------------------------------------------------------------------------
    if ((isBackpackFull || hobbit.goal === 'deposit_chest') && home) {
        hobbit.goal = 'deposit_chest';

        const houseTile = getTileData(home.standX * 16 + 8, home.standY * 16 + 8, worldMatrix, roomMatrix);
        const houseRoomId = houseTile?.roomID || 0;

        if (currentRoom === houseRoomId && houseRoomId !== 0) {
            const nextToChest = Math.hypot(currentTX - home.chestX, currentTY - home.chestY) <= 1.5;

            if (nextToChest) {
                hobbit.path = [];
                hobbit.state = 'idle';
                depositBackpack(hobbit, home.chestX, home.chestY);

                if (isNight) {
                    hobbit.goal = 'sleep';
                } else {
                    setDoorLock(home.doorX, home.doorY, false);
                    hobbit.goal = (hobbit.socialization < 40) ? 'social_walk' : 'explore';
                    hobbit.path = getTilePath(currentTX, currentTY, home.porchX, home.porchY, worldMatrix, roomMatrix, hobbit, 8);
                }
                hobbit.brainTimer = 0.3;
                return;
            } else {
                hobbit.path = getTilePath(currentTX, currentTY, home.standX, home.standY, worldMatrix, roomMatrix, hobbit, 6);
                return;
            }
        }

        setDoorLock(home.doorX, home.doorY, false);
        navigateTowardPorchOrEnter(hobbit, currentTX, currentTY, currentRoom, home, { x: home.standX, y: home.standY }, worldMatrix, roomMatrix);
        return;
    }

    // src/hobbitManager.js (inside tickHobbit)

    // ------------------------------------------------------------------------
    // 🚶 STATE: RING ROAD SOCIAL WALK (Socialization < 40%)
    // ------------------------------------------------------------------------
    if ((hobbit.socialization || 100) < 40 && !isNight && hobbit.goal !== 'deposit_chest') {
        hobbit.goal = 'social_walk';
    }

    // When socialization is restored to >= 80%, return to work!
    if (hobbit.goal === 'social_walk' && (hobbit.socialization || 100) >= 80) {
        hobbit.goal = 'explore';
        hobbit.onRingRoad = false; // Reset on-ramp flag
        hobbit.thoughtBubble = { icon: '😊', timer: 2.0 };
    }

    if (hobbit.goal === 'social_walk' && !isNight) {
        // Step 1: Step out to porch if still inside house
        if (currentRoom !== 0 && home) {
            setDoorLock(home.doorX, home.doorY, false);
            hobbit.path = getTilePath(currentTX, currentTY, home.porchX, home.porchY, worldMatrix, roomMatrix, hobbit, 8);
            return;
        }

        const well = getHobbitVillage(hobbit);
        if (well) {
            const numWaypoints = 16;
            const ringRadius = 20; // 20-tile radius around village center
            const dirMultiplier = hobbit.walkDirection || 1; // 1 = CW, -1 = CCW

            // Generate the 16 circular ring road coordinates
            const waypoints = [];
            for (let i = 0; i < numWaypoints; i++) {
                const angle = (i / numWaypoints) * Math.PI * 2;
                waypoints.push({
                    index: i,
                    x: Math.floor(well.x + Math.cos(angle) * ringRadius),
                    y: Math.floor(well.y + Math.sin(angle) * ringRadius)
                });
            }

            // Step 2: If not on the ring road yet, find the NEAREST on-ramp waypoint!
            if (!hobbit.onRingRoad) {
                let closestWaypoint = waypoints[0];
                let minDistance = Infinity;

                waypoints.forEach(wp => {
                    const d = Math.hypot(currentTX - wp.x, currentTY - wp.y);
                    if (d < minDistance) {
                        minDistance = d;
                        closestWaypoint = wp;
                    }
                });

                hobbit.ringWaypointIndex = closestWaypoint.index;

                // Check if we arrived at the nearest on-ramp
                if (minDistance <= 2.0) {
                    hobbit.onRingRoad = true; // Locked onto highway!
                } else {
                    // Pathfind to the nearest on-ramp waypoint
                    if (!hobbit.path || hobbit.path.length === 0 || (hobbit.brainTimer || 0) <= 0) {
                        hobbit.path = getTilePath(currentTX, currentTY, closestWaypoint.x, closestWaypoint.y, worldMatrix, roomMatrix, hobbit, 30);
                        hobbit.brainTimer = 1.5;

                        // 🎯 FAIL-SAFE RADIAL STEPPER: If A* fails due to building geometry, step directly away from the well!
                        if (!hobbit.path || hobbit.path.length === 0) {
                            const awayDX = Math.sign(currentTX - well.x) || 1;
                            const awayDY = Math.sign(currentTY - well.y) || 1;
                            const stepX = currentTX + awayDX;
                            const stepY = currentTY + awayDY;

                            if (isTilePassable(stepX, stepY, worldMatrix, roomMatrix, hobbit, currentTX, currentTY)) {
                                hobbit.path = [{ x: stepX, y: stepY }];
                            } else if (isTilePassable(stepX, currentTY, worldMatrix, roomMatrix, hobbit, currentTX, currentTY)) {
                                hobbit.path = [{ x: stepX, y: currentTY }];
                            } else if (isTilePassable(currentTX, stepY, worldMatrix, roomMatrix, hobbit, currentTX, currentTY)) {
                                hobbit.path = [{ x: currentTX, y: stepY }];
                            }
                        }
                    }
                    return;
                }
            }

            // Step 3: Cruising the Ring Road highway loop!
            const targetWaypoint = waypoints[hobbit.ringWaypointIndex];
            const distToTarget = Math.hypot(currentTX - targetWaypoint.x, currentTY - targetWaypoint.y);

            // Arrived at current waypoint -> Advance to next circular waypoint!
            if (distToTarget <= 2.0) {
                hobbit.ringWaypointIndex = (hobbit.ringWaypointIndex + dirMultiplier + numWaypoints) % numWaypoints;
            }

            const nextTarget = waypoints[hobbit.ringWaypointIndex];
            if (!hobbit.path || hobbit.path.length === 0 || (hobbit.brainTimer || 0) <= 0) {
                hobbit.path = getTilePath(currentTX, currentTY, nextTarget.x, nextTarget.y, worldMatrix, roomMatrix, hobbit, 25);
                hobbit.brainTimer = 1.0;
            }
            return;
        }
    }

    // ------------------------------------------------------------------------
    // 🌾 STATE: HARVEST & EXPLORE (Daytime Foraging)
    // ------------------------------------------------------------------------
    if (hobbit.job === 'Forager') {
        // Step out if still inside in the morning
        if (currentRoom !== 0 && home) {
            setDoorLock(home.doorX, home.doorY, false);
            hobbit.goal = 'explore';
            hobbit.path = getTilePath(currentTX, currentTY, home.porchX, home.porchY, worldMatrix, roomMatrix, hobbit, 8);
            return;
        }

        // 1. Concentric scan for visible mature plants within 4 tiles
        const crop = findNearbyMatureCrop(currentTX, currentTY, 4);

        if (crop) {
            hobbit.goal = 'harvest';
            const distToCrop = Math.hypot(currentTX - crop.gx, currentTY - crop.gy);

            if (distToCrop <= 1.5) {
                hobbit.path = [];
                hobbit.state = 'idle';
                harvestPlant(hobbit, crop.gx, crop.gy);
                hobbit.brainTimer = 0.2; // Rapid chain harvest
                return;
            }

            hobbit.path = getTilePath(currentTX, currentTY, crop.gx, crop.gy, worldMatrix, roomMatrix, hobbit, 8);
            return;
        }

        // 2. Explore: wander short 2-4 tile distances
        hobbit.goal = 'explore';
        if (!hobbit.path || hobbit.path.length === 0) {
            executeExploreWander(hobbit, currentTX, currentTY, currentRoom, worldMatrix, roomMatrix);
        }
        hobbit.brainTimer = 0.4 + Math.random() * 0.2;
        return;
    }

    // ------------------------------------------------------------------------
    // 🏪 OTHER VILLAGE ROLES
    // ------------------------------------------------------------------------
    if (hobbit.job === 'Trader' || hobbit.villageRole === 'QUARTERMASTER') {
        const waypoints = [
            { x: hobbit.homeX, y: hobbit.homeY - 2 },
            { x: hobbit.homeX + 2, y: hobbit.homeY - 2 },
            { x: hobbit.homeX + 1, y: hobbit.homeY - 1 }
        ];
        hobbit.patrolIndex = ((hobbit.patrolIndex || 0) + 1) % waypoints.length;
        hobbit.path = getTilePath(currentTX, currentTY, waypoints[hobbit.patrolIndex].x, waypoints[hobbit.patrolIndex].y, worldMatrix, roomMatrix, hobbit, 30);
    } 
    else if (hobbit.job === 'Usher') {
        const waypoints = [
            { x: hobbit.homeX + 2, y: hobbit.homeY - 6 },
            { x: hobbit.homeX + 1, y: hobbit.homeY - 3 },
            { x: hobbit.homeX + 2, y: hobbit.homeY - 2 }
        ];
        hobbit.patrolIndex = ((hobbit.patrolIndex || 0) + 1) % waypoints.length;
        hobbit.path = getTilePath(currentTX, currentTY, waypoints[hobbit.patrolIndex].x, waypoints[hobbit.patrolIndex].y, worldMatrix, roomMatrix, hobbit, 30);
    } 
    else if (hobbit.job === 'Farmer') {
        const waypoints = [
            { x: hobbit.homeX + 1, y: hobbit.homeY - 1 },
            { x: hobbit.homeX + 3, y: hobbit.homeY - 1 },
            { x: hobbit.homeX + 1, y: hobbit.homeY + 2 }
        ];
        hobbit.patrolIndex = ((hobbit.patrolIndex || 0) + 1) % waypoints.length;
        hobbit.path = getTilePath(currentTX, currentTY, waypoints[hobbit.patrolIndex].x, waypoints[hobbit.patrolIndex].y, worldMatrix, roomMatrix, hobbit, 30);
    } 
    else if (hobbit.villageRole === 'GUARD' || hobbit.job === 'Military') {
        const well = getHobbitVillage(hobbit);
        if (well) {
            const waypoints = [
                { x: well.x, y: well.y + 3 },
                { x: well.x + 4, y: well.y },
                { x: well.x, y: well.y - 4 },
                { x: well.x - 4, y: well.y }
            ];
            hobbit.patrolIndex = ((hobbit.patrolIndex || 0) + 1) % waypoints.length;
            hobbit.path = getTilePath(currentTX, currentTY, waypoints[hobbit.patrolIndex].x, waypoints[hobbit.patrolIndex].y, worldMatrix, roomMatrix, hobbit, 30);
        }
    }
}

// ============================================================================
// 🧭 HIGH-PERFORMANCE NAVIGATION & STEERING HELPERS
// ============================================================================

function navigateTowardPorchOrEnter(hobbit, currentTX, currentTY, currentRoom, home, insideDestination, worldMatrix, roomMatrix) {
    const atPorch = Math.hypot(currentTX - home.porchX, currentTY - home.porchY) <= 1.5;

    if (atPorch || currentRoom !== 0) {
        hobbit.path = getTilePath(currentTX, currentTY, insideDestination.x, insideDestination.y, worldMatrix, roomMatrix, hobbit, 6);
        return;
    }

    if (hobbit.detourPath && hobbit.detourPath.length > 0) {
        hobbit.path = [hobbit.detourPath.shift()];
        return;
    }

    const step = stepDirectlyToward(currentTX, currentTY, home.porchX, home.porchY, worldMatrix, roomMatrix, hobbit);

    if (!step.blocked) {
        hobbit.path = [{ x: step.x, y: step.y }];
    } else {
        const detourX = currentTX + Math.sign(home.porchX - currentTX) * 5;
        const detourY = currentTY + Math.sign(home.porchY - currentTY) * 5;
        const detour = getTilePath(currentTX, currentTY, detourX, detourY, worldMatrix, roomMatrix, hobbit, 10);

        if (detour && detour.length > 0) {
            hobbit.detourPath = detour;
            hobbit.path = [hobbit.detourPath.shift()];
        } else {
            hobbit.path = getTilePath(currentTX, currentTY, home.porchX, home.porchY, worldMatrix, roomMatrix, hobbit, 40);
        }
    }
}

function stepDirectlyToward(currX, currY, targetX, targetY, worldMatrix, roomMatrix, hobbit) {
    const dx = targetX - currX;
    const dy = targetY - currY;

    if (dx === 0 && dy === 0) {
        return { x: currX, y: currY, blocked: false };
    }

    const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
    const stepY = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;

    if (isTilePassable(currX + stepX, currY + stepY, worldMatrix, roomMatrix, hobbit, currX, currY)) {
        return { x: currX + stepX, y: currY + stepY, blocked: false };
    }

    const altX = stepX === 0 ? Math.sign(dx) : 0;
    const altY = stepY === 0 ? Math.sign(dy) : 0;
    if (altX !== 0 || altY !== 0) {
        if (isTilePassable(currX + altX, currY + altY, worldMatrix, roomMatrix, hobbit, currX, currY)) {
            return { x: currX + altX, y: currY + altY, blocked: false };
        }
    }

    return { blocked: true };
}

function findNearbyMatureCrop(currTX, currTY, maxRadius = 4) {
    for (let r = 0; r <= maxRadius; r++) {
        for (let ox = -r; ox <= r; ox++) {
            for (let oy = -r; oy <= r; oy++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
                const key = `${currTX + ox}_${currTY + oy}`;
                const plant = plants.get(key);
                if (plant && plant.growth >= 20) {
                    return plant;
                }
            }
        }
    }
    return null;
}

function executeExploreWander(hobbit, currentTX, currentTY, currentRoom, worldMatrix, roomMatrix) {
    const angles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75];
    for (let i = angles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [angles[i], angles[j]] = [angles[j], angles[i]];
    }

    const dist = 3 + Math.floor(Math.random() * 2);
    for (let angle of angles) {
        const destX = Math.floor(currentTX + Math.cos(angle) * dist);
        const destY = Math.floor(currentTY + Math.sin(angle) * dist);

        if (hobbit.recentTiles && hobbit.recentTiles.includes(`${destX}_${destY}`)) continue;

        if (isTilePassable(destX, destY, worldMatrix, roomMatrix, hobbit)) {
            const data = getTileData(destX * 16 + 8, destY * 16 + 8, worldMatrix, roomMatrix);
            const targetRoom = (data?.roomID === 9999) ? 0 : (data?.roomID || 0);

            if (targetRoom === currentRoom) {
                hobbit.path = getTilePath(currentTX, currentTY, destX, destY, worldMatrix, roomMatrix, hobbit, 6);
                if (hobbit.path && hobbit.path.length > 0) return;
            }
        }
    }
}

function getOrCreateHomeMemory(hobbit) {
    if (hobbit.homeMemory) return hobbit.homeMemory;

    const currTX = Math.floor(hobbit.x / 16);
    const currTY = Math.floor(hobbit.y / 16);

    if (hobbit.homeX !== null && hobbit.homeX !== undefined && hobbit.homeY !== null && hobbit.homeY !== undefined) {
        hobbit.homeMemory = {
            houseId: hobbit.houseId || 0,
            homeX: hobbit.homeX,
            homeY: hobbit.homeY,
            doorX: hobbit.homeX + 1,
            doorY: hobbit.homeY,
            porchX: hobbit.homeX + 1,
            porchY: hobbit.homeY + 1,
            standX: hobbit.homeX + 1,
            standY: hobbit.homeY - 1,
            chestX: hobbit.homeX,
            chestY: hobbit.homeY - 1,
            bedrollX: hobbit.homeX + 3,
            bedrollY: hobbit.homeY - 1
        };
        return hobbit.homeMemory;
    }

    let nearest = null;
    let minDist = Infinity;
    for (let [key, obj] of staticObjects) {
        if (obj.type === 'CHEST_STORAGE') {
            const cx = Math.floor(key / 10000);
            const cy = key % 10000;
            const dist = Math.hypot(cx - currTX, cy - currTY);
            if (dist < minDist) {
                minDist = dist;
                nearest = { chestX: cx, chestY: cy, houseId: obj.houseId };
            }
        }
    }

    if (nearest) {
        hobbit.homeMemory = {
            houseId: nearest.houseId,
            homeX: nearest.chestX,
            homeY: nearest.chestY + 1,
            doorX: nearest.chestX + 1,
            doorY: nearest.chestY + 1,
            porchX: nearest.chestX + 1,
            porchY: nearest.chestY + 2,
            standX: nearest.chestX + 1,
            standY: nearest.chestY,
            chestX: nearest.chestX,
            chestY: nearest.chestY,
            bedrollX: nearest.chestX + 3,
            bedrollY: nearest.chestY
        };
        hobbit.homeX = hobbit.homeMemory.homeX;
        hobbit.homeY = hobbit.homeMemory.homeY;
        hobbit.houseId = hobbit.homeMemory.houseId;
    }

    return hobbit.homeMemory;
}

function depositBackpack(hobbit, chestX, chestY) {
    const chestId = `chest_${chestX}_${chestY}`;
    let chestItems = chestCache.get(chestId);
    if (!chestItems) {
        chestItems = [];
        chestCache.set(chestId, chestItems);
    }
    const nonKeys = (hobbit.inventory || []).filter(i => !i.isKey);

    let deposited = false;
    nonKeys.forEach(item => {
        if (chestItems.length < 16) {
            let merged = false;
            if (item.maxStack > 1) {
                const existing = chestItems.find(i => i.seedType === item.seedType && i.count < item.maxStack);
                if (existing) {
                    const space = item.maxStack - existing.count;
                    if (item.count <= space) {
                        existing.count += item.count;
                        merged = true;
                    } else {
                        existing.count = item.maxStack;
                        item.count -= space;
                    }
                }
            }
            if (!merged) {
                chestItems.push(item);
            }
            hobbit.inventory = hobbit.inventory.filter(i => i !== item);
            deposited = true;
        }
    });

    if (deposited) {
        hobbit.thoughtBubble = { icon: '📦', timer: 2.0 };
        if (socket && socket.connected) {
            socket.emit('updateChest', { chestId, items: chestItems });
        }
    }
}

function harvestPlant(hobbit, gx, gy) {
    const plantKey = `${gx}_${gy}`;
    const plant = plants.get(plantKey);
    if (!plant || plant.growth < 20) return;

    // 1. Give harvested crop / plant matter
    const yieldKey = YIELD_MAP[plant.type] || 'PLANT_MATTER';
    const itemTemplate = ITEM_TYPES[yieldKey] || ITEM_TYPES.PLANT_MATTER;
    if (itemTemplate) {
        giveItemToHobbit(hobbit, createItem(itemTemplate));
    }

    // 2. Give seeds (1-2x seeds from wild flora)
    const seedKey = `${plant.type.toUpperCase()}_SEED`;
    const seedTemplate = ITEM_TYPES[seedKey];
    if (seedTemplate) {
        const seedCount = Math.floor(Math.random() * 2) + 1;
        const seedItem = createItem(seedTemplate);
        seedItem.count = seedCount;
        giveItemToHobbit(hobbit, seedItem);
    }

    deletePlant(gx, gy);

    if (socket && socket.connected) {
        socket.emit('syncTile', { gx, gy, traits: 0 });
        socket.emit('plantWithered', { gx, gy });
    }
}

function setDoorOpen(tx, ty, isOpen, worldMatrix, roomMatrix) {
    const tile = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!tile) return;

    if (isOpen) {
        if (tile.tileID === 49 || tile.tileID === 12) {
            const openTile = (tile.tileID === 49) ? 35 : 13;
            worldMatrix[tile.cx][tile.cy][(tile.ly * 100) + tile.lx] = openTile;
            if (socket && socket.connected) {
                socket.emit('syncTile', { gx: tile.gx, gy: tile.gy, traits: openTile });
            }
        }
    } else {
        if (tile.tileID === 35 || tile.tileID === 13) {
            const closedTile = (tile.tileID === 35) ? 49 : 12;
            worldMatrix[tile.cx][tile.cy][(tile.ly * 100) + tile.lx] = closedTile;
            if (socket && socket.connected) {
                socket.emit('syncTile', { gx: tile.gx, gy: tile.gy, traits: closedTile });
            }
        }
    }
}

function setDoorLock(tx, ty, isLocked) {
    const doorKey = `${tx}_${ty}`;
    doorStates.set(doorKey, { locked: isLocked });
    if (socket && socket.connected) {
        socket.emit('setDoorLock', { gx: tx, gy: ty, locked: isLocked });
    }
}