// src/physics.js
import { CONFIG } from './config.js';
import { getObjectAt, solidTiles } from './staticObjects.js'; // 👈 IMPORTED: solidTiles coordinate set
import { roomMetadata } from './cellDecorator.js';

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

export function checkCollision(x, y, worldMatrix, roomMatrix, entity) {
    let target = getTileData(x, y, worldMatrix, roomMatrix);
    const current = getTileData(entity.x + 8, entity.y + 15, worldMatrix, roomMatrix); 

    if (target.tileID === undefined) return false;

    // 🎯 THE PHYSICS GATE: Block movement if coordinate is occupied by an overlay (well or tree)
    if (solidTiles.has(`${target.gx}_${target.gy}`)) return false;

    // ==========================================
    // 🚪 DOOR & GATE LOGIC
    // ==========================================
    if (entity.floor === 1) {
        const isNearClosedDoor = (
            [49, 12, 22, 19].includes(target.tileID) || 
            [49, 12, 22, 19].includes(current.tileID)
        );
        
        if (isNearClosedDoor) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const near = getTileData(x + (dx * 8), y + (dy * 8), worldMatrix, roomMatrix);
                    const nearIdx = (near.ly * 100) + near.lx;

                    // Houses & Barns (Require Keys)
                    if (near.tileID === 49 || near.tileID === 12) {
                        const hasKey = entity.inventory.some(item => item.isKey && item.houseId === near.roomID);
                        if (hasKey) {
                            worldMatrix[near.cx][near.cy][nearIdx] = (near.tileID === 49) ? 35 : 13;
                        }
                    }
                    
                    // RANCH GATES (Open automatically)
                    if (near.tileID === 22 || near.tileID === 19) {
                        worldMatrix[near.cx][near.cy][nearIdx] = (near.tileID === 22) ? 23 : 20;
                    }
                }
            }
        }

        // Auto-close doors
        const doorCheckX = entity.x + 8;
        const doorCheckY = entity.y + 8;
        
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const near = getTileData(doorCheckX + (dx * 16), doorCheckY + (dy * 16), worldMatrix, roomMatrix);
                
                if ([35, 13, 23, 20].includes(near.tileID)) {
                    const dist = Math.sqrt(Math.pow((near.gx * 16 + 8) - doorCheckX, 2) + Math.pow((near.gy * 16 + 8) - doorCheckY, 2));
                    
                    if (dist > 24) {
                        const nearIdx = (near.ly * 100) + near.lx;
                        if (near.tileID === 35) worldMatrix[near.cx][near.cy][nearIdx] = 49;
                        else if (near.tileID === 13) worldMatrix[near.cx][near.cy][nearIdx] = 12;
                        else if (near.tileID === 23) worldMatrix[near.cx][near.cy][nearIdx] = 22;
                        else if (near.tileID === 20) worldMatrix[near.cx][near.cy][nearIdx] = 19;
                    }
                }
            }
        }

        if ([35, 13, 23, 20, 54, 55].includes(target.tileID) || [35, 13, 23, 20, 54, 55].includes(current.tileID)) return true;
    }

    // ==========================================
    // 🧱 GENERAL COLLISION LOGIC
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
                if (oy === 0) return false;  
            }
            
            if (target.roomID === current.roomID) return true;
        }
        
        const hardSolids = [40, 41, 43, 27, 46, 47]; 
        if (hardSolids.includes(target.tileID)) return false;

        if (target.roomID === current.roomID) return true;
        return false; 
    }

    // Static structures and boundaries that block movement
    const worldSolids = [
        40, 48, 50, 52, 17, 18, 19, 21, 22, 24, 27, 1, 3,
        46, 47
    ];

    if (worldSolids.includes(target.tileID)) return false;

    const cRoom = (current.roomID === 9999) ? 0 : current.roomID;
    const tRoom = (target.roomID === 9999) ? 0 : target.roomID;
    
    if (cRoom !== tRoom) return false;

    return true;
}

export function moveEntity(entity, dx, dy, worldMatrix, roomMatrix) {
    const left = 2, right = 14, top = 8, bottom = 15; 
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