
// src/physics.js
import { CONFIG } from './config.js';
import { getObjectAt } from './staticObjects.js';
import { roomMetadata } from './cellDecorator.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("physics.js loaded");
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

// --- Inside checkCollision in src/physics.js ---
export function checkCollision(x, y, worldMatrix, roomMatrix, entity) {
    let target = getTileData(x, y, worldMatrix, roomMatrix);
    const current = getTileData(entity.x + 8, entity.y + 15, worldMatrix, roomMatrix); 

    if (target.tileID === undefined) return false;

    // ☁️ CLOUD WALL / FOG OF WAR CHECK
    // Determine which 100x100 "System" the target tile is inside
    const targetSysX = Math.floor(target.cx / 100);
    const targetSysY = Math.floor(target.cy / 100);
    const sysKey = `${targetSysX}_${targetSysY}`;

    // Read the sync'd list from multiplayer.js
    let isUnlocked = true;
    import('./multiplayer.js').then(m => {
        if (!m.globalUnlockedSystems.includes(sysKey)) isUnlocked = false;
    });

    // Javascript is synchronous enough here that the import cache will evaluate immediately
    // For absolute safety in a sync function, we can check a globally exposed variable
    if (window.unlockedSystemsCache && !window.unlockedSystemsCache.includes(sysKey)) {
        return false; // Acts like a solid wall!
    }

    // ==========================================
    // 🚪 DOOR & GATE LOGIC
    // ==========================================
    // 👇 THE FIX: Use entity.floor instead of hero.floor
    if (entity.floor === 1) {
        
        // 1. OPENING LOGIC
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
                        // 👇 THE FIX: Use entity.inventory instead of hero.inventory
                        const hasKey = entity.inventory.some(item => item.isKey && item.houseId === near.roomID);
                        if (hasKey) {
                            worldMatrix[near.cx][near.cy][nearIdx] = (near.tileID === 49) ? 35 : 13;
                        }
                    }
                    
                    // RANCH GATES (Open automatically!)
                    if (near.tileID === 22 || near.tileID === 19) {
                        worldMatrix[near.cx][near.cy][nearIdx] = (near.tileID === 22) ? 23 : 20;
                    }
                }
            }
        }

        // 2. CLOSING LOGIC
        // 👇 THE FIX: Use entity.x and entity.y instead of hero.x and hero.y
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

        // 3. ALLOW PASSAGE THROUGH OPEN DOORS & GATES
        if ([35, 13, 23, 20].includes(target.tileID) || [35, 13, 23, 20].includes(current.tileID)) return true;
    }

    // ==========================================
    // 🧱 GENERAL COLLISION LOGIC
    // ==========================================

    // 1. OBJECT BLOCKER (Furniture/Walls)
    const objAtTarget = getObjectAt(target.gx, target.gy);
    if (objAtTarget && objAtTarget.type === 'INT_WALL') return false;

    // 2. INSIDE BUILDING LOGIC
    // 👇 THE FIX: Ignore 9999, it is an outdoor zone!
    if (current.roomID !== 0 && current.roomID !== 9999) {
        const meta = roomMetadata[current.roomID];
        
        if (meta && meta.type === 'TWO_STORY') {
            const offsetY = target.gy - meta.frontY;
            const top = meta.maxOffset;

            // Floor 1 Mask
            if (hero.floor === 1) {
                if (offsetY === top) return false;      // Black Row
                if (offsetY === top + 1) return false;  // Back Wall Row
            }
            // Floor 2 Mask
            if (hero.floor === 2) {
                if (offsetY === 0) return false;        // Front door row
                if (offsetY === top) return false;      // Back Wall Row
            }

            if (target.roomID === current.roomID) return true;
        }

        if (meta && meta.type === 'LARGE_BARN') {
            const ox = target.gx - meta.frontX;
            const oy = target.gy - meta.frontY;
            const isMidCol = (ox === 2 || ox === 3);

            if (hero.floor === 1) {
                if (oy <= -6) return false; // Block top slab
            } else {
                if (!isMidCol) return false; // Block sides
                if (oy === 0) return false;  // Block front door
            }
            
            if (target.roomID === current.roomID) return true;
        }
                
        // 🛠️ BUG FIX: Removed the `y - 16` dataAbove check! 
        // This was an artificial invisible boundary to prevent a 72px tall character from overlapping the top wall.
        // Since the hero is now 16x16, this is unnecessary and was breaking top-wall collision!

        // Added more comprehensive protection against walking through specific solid walls from the inside
        const hardSolids = [40, 41, 43, 27]; 
        if (hardSolids.includes(target.tileID)) return false;

        if (target.roomID === current.roomID) return true;
        return false; 
    }

    // 3. OPEN WORLD RULES
    // 🆕 Added Ranch tiles: 18 (V-Fence), 19 (V-Gate Closed), 21 (H-Fence), 22 (H-Gate Closed), 24 (Corner)
    const worldSolids = [40, 48, 50, 52, 17, 18, 19, 21, 22, 24, 27, 1, 3];
    if (worldSolids.includes(target.tileID)) return false;

    // 4. PERIMETER GUARD (Wilderness blocks entry without a door)
    // 👇 THE FIX: Treat 9999 and 0 as the exact same thing for boundary checks
    const cRoom = (current.roomID === 9999) ? 0 : current.roomID;
    const tRoom = (target.roomID === 9999) ? 0 : target.roomID;
    
    if (cRoom !== tRoom) return false;

    return true;
}

export function moveEntity(entity, dx, dy, worldMatrix, roomMatrix) {
    // 🛡️ THE FIX: Tighter hitboxes.
    // Instead of measuring near the edges (2 to 13), we check slightly wider bounds 
    // to ensure the entity's sprite can't overlap the wall's drawing space.
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