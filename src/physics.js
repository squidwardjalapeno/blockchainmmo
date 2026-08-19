// src/physics.js
import { CONFIG } from './config.js';
import { solidTiles, getObjectAt, setGateState, staticObjects } from './staticObjects.js'; 
import { roomMetadata } from './cellDecorator.js';
import { hero } from './entities.js'; 
import { socket, remotePlayers, doorStates } from './multiplayer.js'; 
import { animals } from './animals.js';
import { hobbits } from './hobbitCore.js';

// 🎯 FIX: Explicit door state close transitions (Never morphs gates to barn doors)
const DOOR_TRANSITIONS = {
    35: 49, // Opened House -> Closed House
    13: 12, // Opened Barn -> Closed Barn
};

export function isDoorUnlocked(gx, gy) {
    const state = doorStates.get(`${gx}_${gy}`);
    return state ? !state.locked : false; // Locked by default
}

function isAnyPlayerNearDoor(doorGX, doorGY) {
    const doorX = doorGX * 16 + 8;
    const doorY = doorGY * 16 + 8;

    const distLocal = Math.hypot((hero.x + 8) - doorX, (hero.y + 8) - doorY);
    if (distLocal <= 24) return true;

    let near = false;
    if (remotePlayers) {
        remotePlayers.forEach(p => {
            const distRemote = Math.hypot((p.x + 8) - doorX, (p.y + 8) - doorY);
            if (distRemote <= 24) {
                near = true;
            }
        });
    }

    return near;
}

export function getTileData(pxX, pxY, worldMatrix, roomMatrix) {
    const gx = Math.floor(pxX / 16);
    const gy = Math.floor(pxY / 16);
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    const cellIdx = (ly * 100) + lx;

    const cell = worldMatrix[cx]?.[cy];
    const room = roomMatrix[cx]?.[cy];

    return {
        tileID: cell ? cell[cellIdx] : undefined,
        roomID: room ? room[cellIdx] : 0,
        gx, gy, cx, cy, lx, ly
    };
}

// 🎯 DUAL-PASS GATE PROXIMITY EVALUATOR
export function updateProximityGates() {
    for (let [key, obj] of staticObjects) {
        if (obj.type === 'RANCH_FENCE' && obj.fenceType === 'G') {
            const gx = Math.floor(key / 10000);
            const gy = key % 10000;
            const gateX = gx * 16 + 8;
            const gateY = gy * 16 + 8;

            let someoneNear = false;
            const checkDistance = 32; // Safe 2-tile buffer

            // Check Hero Player
            if (hero && hero.hp > 0) {
                if (Math.hypot((hero.x + 8) - gateX, (hero.y + 15) - gateY) <= checkDistance) {
                    someoneNear = true;
                }
            }

            // Check Remote Players
            if (!someoneNear && remotePlayers) {
                remotePlayers.forEach(p => {
                    if (p.hp > 0 && Math.hypot((p.x + 8) - gateX, (p.y + 15) - gateY) <= checkDistance) {
                        someoneNear = true;
                    }
                });
            }

            // Check Pasture Animals
            if (!someoneNear && animals) {
                animals.forEach(a => {
                    if (a.hp > 0 && Math.hypot((a.x + 8) - gateX, (a.y + 8) - gateY) <= checkDistance) {
                        someoneNear = true;
                    }
                });
            }

            // Check Workers (Hobbits)
            if (!someoneNear && hobbits) {
                hobbits.forEach(h => {
                    if (h.hp > 0 && Math.hypot((h.x + 8) - gateX, (h.y + 15) - gateY) <= checkDistance) {
                        someoneNear = true;
                    }
                });
            }

            if (someoneNear) {
                if (!obj.open) {
                    setGateState(gx, gy, true);
                }
            } else {
                if (obj.open) {
                    setGateState(gx, gy, false);
                }
            }
        }
    }
}

// src/physics.js

export function checkCollision(x, y, worldMatrix, roomMatrix, entity) {
    let target = getTileData(x, y, worldMatrix, roomMatrix);
    const current = getTileData(entity.x + 8, entity.y + 15, worldMatrix, roomMatrix); 

    if (target.tileID === undefined) return false;

    // 🎯 FIX: Renamed variable to gateObj to prevent duplicate declaration crash
    const tx = Math.floor(x / 16);
    const ty = Math.floor(y / 16);
    const gateObj = getObjectAt(tx, ty); 
    if (gateObj && gateObj.type === 'RANCH_FENCE' && gateObj.fenceType === 'G') {
        if (!gateObj.open) {
            setGateState(tx, ty, true);
        }
    }

    if (solidTiles.has(`${target.gx}_${target.gy}`)) return false;

    const tX = target.gx;
    const tY = target.gy;

    for (let ox = -1; ox <= 0; ox++) {
        const anchorX = tX + ox;
        const obj = getObjectAt(anchorX, tY);
        
        if (obj && obj.type === 'FOREST_TREE') {
            const treeMinX = (anchorX * 16) + 8;  
            const treeMaxX = (anchorX * 16) + 24; 

            if (x >= treeMinX && x <= treeMaxX) {
                return false; 
            }
        }
    }

    // ==========================================
    // DOOR LAYER (Synchronized)
    // ==========================================
    if (entity.floor === 1) {
        const isNearClosedDoor = (
            [49, 12].includes(target.tileID) || 
            [49, 12].includes(current.tileID)
        );
        
        if (isNearClosedDoor) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const near = getTileData(x + (dx * 8), y + (dy * 8), worldMatrix, roomMatrix);
                    const nearIdx = (near.ly * 100) + near.lx;

                    // Houses & Barns (Require Keys OR Unlocked status)
                    if (near.tileID === 49 || near.tileID === 12) {
                        const hasKey = entity.inventory && entity.inventory.some(item => item.isKey && item.houseId === near.roomID);
                        const unlocked = isDoorUnlocked(near.gx, near.gy);
                        
                        if (hasKey || unlocked) {
                            const newTile = (near.tileID === 49) ? 35 : 13;
                            worldMatrix[near.cx][near.cy][nearIdx] = newTile;
                            
                            if (socket && socket.connected) {
                                socket.emit('syncTile', { gx: near.gx, gy: near.gy, traits: newTile });
                            }
                        }
                    }
                }
            }

            target = getTileData(x, y, worldMatrix, roomMatrix);
        }

        const doorCheckX = entity.x + 8;
        const doorCheckY = entity.y + 8;
        
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const near = getTileData(doorCheckX + (dx * 16), doorCheckY + (dy * 16), worldMatrix, roomMatrix);
                
                if ([35, 13].includes(near.tileID)) {
                    const dist = Math.sqrt(Math.pow((near.gx * 16 + 8) - doorCheckX, 2) + Math.pow((near.gy * 16 + 8) - doorCheckY, 2));
                    
                    if (dist > 24) {
                        if (isAnyPlayerNearDoor(near.gx, near.gy)) {
                            continue;
                        }

                        const nearIdx = (near.ly * 100) + near.lx;
                        const closedTile = DOOR_TRANSITIONS[near.tileID];
                        
                        if (closedTile !== undefined) {
                            worldMatrix[near.cx][near.cy][nearIdx] = closedTile;

                            if (socket && socket.connected) {
                                socket.emit('syncTile', { gx: near.gx, gy: near.gy, traits: closedTile });
                            }
                        }
                    }
                }
            }
        }

        if ([35, 13, 54, 55].includes(target.tileID) || [35, 13, 54, 55].includes(current.tileID)) return true;
    }

    // ==========================================
    // GENERAL COLLISION LAYER
    // ==========================================
    const objAtTarget = getObjectAt(target.gx, target.gy);
    if (objAtTarget && objAtTarget.type === 'INT_WALL') return false;

    if (current.roomID !== 0 && current.roomID !== 9999) {
        const meta = roomMetadata[current.roomID];
        
        if (meta && meta.type === 'TWO_STORY') {
            const offsetY = target.gy - meta.frontY;
            const top = meta.maxOffset;

            if (entity.floor === 1) {
                if (offsetY === top) return false;      
                if (offsetY === top + 1) return false;  
            }
            if (entity.floor === 2) {
                if (offsetY === 0) return false;        
                if (offsetY === top) return false;      
            }

            if (target.roomID === current.roomID) return true;
        }

        if (meta && meta.type === 'LARGE_BARN') {
            const ox = target.gx - meta.frontX;
            const oy = target.gy - meta.frontY;
            const isMidCol = (ox === 2 || ox === 3);

            if (entity.floor === 1) {
                if (oy <= -6) return false; 
            } else {
                if (!isMidCol) return false; 
                if (oy === 0 || oy === -1) return false;  
            }
            
            if (target.roomID === current.roomID) return true;
        }
        
        const hardSolids = [40, 41, 43, 27, 46, 47]; 
        if (hardSolids.includes(target.tileID)) return false;

        if (target.roomID === current.roomID) return true;
        return false; 
    }

    const worldSolids = [
        40, 48, 50, 52, 17, 27, 1, 3,
        46, 47
    ];

    if (worldSolids.includes(target.tileID)) return false;

    const cRoom = (current.roomID === 9999) ? 0 : current.roomID;
    const tRoom = (target.roomID === 9999) ? 0 : target.roomID;
    
    if (cRoom !== tRoom) {
        const openDoors = [35, 13];
        
        const hasKeyCurrent = entity.inventory && entity.inventory.some(item => item.isKey && item.houseId === current.roomID);
        const hasKeyTarget = entity.inventory && entity.inventory.some(item => item.isKey && item.houseId === target.roomID);
        const isCurrentUnlocked = isDoorUnlocked(current.gx, current.gy);
        const isTargetUnlocked = isDoorUnlocked(target.gx, target.gy);

        const allowedDoors = [...openDoors];
        if (hasKeyCurrent || isCurrentUnlocked) {
            allowedDoors.push(49); allowedDoors.push(12);
        }
        if (hasKeyTarget || isTargetUnlocked) {
            allowedDoors.push(49); allowedDoors.push(12);
        }

        if (!allowedDoors.includes(target.tileID) && !allowedDoors.includes(current.tileID)) {
            return false;
        }
    }

    return true;
}

export function moveEntity(entity, dx, dy, worldMatrix, roomMatrix) {
    const left = entity.hitboxLeft !== undefined ? entity.hitboxLeft : 2;
    const right = entity.hitboxRight !== undefined ? entity.hitboxRight : 14;
    const top = entity.hitboxTop !== undefined ? entity.hitboxTop : 8;
    const bottom = entity.hitboxBottom !== undefined ? entity.hitboxBottom : 15;
    
    let movedX = false;
    let movedY = false;

    if (dx !== 0) {
        const nextX = entity.x + dx;
        const sideToCheck = (dx < 0) ? nextX + left : nextX + right;
        
        if (checkCollision(sideToCheck, entity.y + top, worldMatrix, roomMatrix, entity) && 
            checkCollision(sideToCheck, entity.y + bottom, worldMatrix, roomMatrix, entity)) {
            entity.x = nextX;
            movedX = true;
        }
    }

    if (dy !== 0) {
        const nextY = entity.y + dy;
        const sideToCheck = (dy < 0) ? nextY + top : nextY + bottom;
        
        if (checkCollision(entity.x + left, sideToCheck, worldMatrix, roomMatrix, entity) && 
            checkCollision(entity.x + right, sideToCheck, worldMatrix, roomMatrix, entity)) {
            entity.y = nextY;
            movedY = true;
        }
    }

    return movedX || movedY;
}