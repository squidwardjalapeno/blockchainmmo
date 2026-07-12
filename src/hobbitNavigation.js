// src/hobbitNavigation.js
import { solidTiles, getObjectAt } from './staticObjects.js';
import { getTileData } from './physics.js';
import { findPath } from './pathfinding.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("hobbitNavigation.js loaded");
}

/**
 * Validates if a target coordinate is passable for hobbits, checking
 * static obstacles, wall groupings, and room boundaries.
 */
export function isWalkableForHobbit(tx, ty, worldMatrix, roomMatrix, hobbit = null, fromX = null, fromY = null) {
    if (solidTiles.has(`${tx}_${ty}`)) return false;

    const obj = getObjectAt(tx, ty);
    if (obj && obj.type === 'FOREST_TREE') return false;
    
    const leftObj = getObjectAt(tx - 1, ty);
    if (leftObj && leftObj.type === 'FOREST_TREE') return false;

    const data = getTileData(tx * 16 + 8, ty * 16 + 8, worldMatrix, roomMatrix);
    if (!data || data.tileID === undefined) return false;

    const absoluteWalls = [40, 50, 52, 1, 3, 5, 41, 43, 27, 46, 47, 17, 18, 19, 21, 24, 11, 48];
    if (absoluteWalls.includes(data.tileID)) return false;

    // Doorway and room transitions logic
    if (fromX !== null && fromY !== null) {
        const fromData = getTileData(fromX * 16 + 8, fromY * 16 + 8, worldMatrix, roomMatrix);
        const cRoom = (fromData.roomID === 9999) ? 0 : fromData.roomID;
        const tRoom = (data.roomID === 9999) ? 0 : data.roomID;
        
        if (cRoom !== tRoom) {
            const doors = [35, 13, 23, 20, 49, 12, 22, 19];
            if (!doors.includes(data.tileID) && !doors.includes(fromData.tileID)) {
                return false; 
            }
        }
    }

    return true;
}

/**
 * Assigns a single-step random path to a nearby walkable tile.
 */
export function assignRandomWalk(hobbit, currTX, currTY, worldMatrix, roomMatrix) {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const valid = dirs.filter(d => isWalkableForHobbit(currTX + d[0], currTY + d[1], worldMatrix, roomMatrix, hobbit));
    if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        hobbit.path = [{ x: currTX + pick[0], y: currTY + pick[1] }];
    }
}

/**
 * Leverages the unified BFS engine to find a route to exact destination coordinates.
 */
export function findPathToCoords(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit = null, maxDepth = 80) {
    const isWalkableFn = (tx, ty, fromX, fromY) => {
        return isWalkableForHobbit(tx, ty, worldMatrix, roomMatrix, hobbit, fromX, fromY);
    };

    const isTargetFn = (tx, ty) => {
        return tx === targetTX && ty === targetTY; 
    };

    return findPath(startTX, startTY, isWalkableFn, isTargetFn, maxDepth); 
}

/**
 * A modified pathfinding algorithm suited for longer ranges, returning the closest
 * partial path if a complete solution cannot be resolved within search bounds.
 */
export function findPathToFarTarget(startTX, startTY, targetTX, targetTY, worldMatrix, roomMatrix, hobbit, maxSearch = 300) {
    const queue = [{ x: startTX, y: startTY, path: [] }];
    const visited = new Set([`${startTX}_${startTY}`]);
    
    let bestNode = null;
    let bestDist = Math.hypot(targetTX - startTX, targetTY - startTY);
    let iterations = 0;
    
    while (queue.length > 0 && iterations++ < maxSearch) {
        const curr = queue.shift();
        
        const dist = Math.hypot(targetTX - curr.x, targetTY - curr.y);
        if (dist < bestDist) {
            bestDist = dist;
            bestNode = curr;
        }
        
        if (curr.x === targetTX && curr.y === targetTY) {
            return curr.path;
        }
        
        const neighbors = [
            { x: curr.x, y: curr.y - 1 },
            { x: curr.x, y: curr.y + 1 },
            { x: curr.x - 1, y: curr.y },
            { x: curr.x + 1, y: curr.y }
        ];
        
        for (let n of neighbors) {
            const key = `${n.x}_${n.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                if (isWalkableForHobbit(n.x, n.y, worldMatrix, roomMatrix, hobbit, curr.x, curr.y)) {
                    queue.push({
                        x: n.x,
                        y: n.y,
                        path: [...curr.path, { x: n.x, y: n.y }]
                    });
                }
            }
        }
    }
    
    return bestNode ? bestNode.path : null;
}

/**
 * High-performance localized road-steering engine that guides entities toward roads
 * while introducing weight penalties for backtracking over recently visited coordinates.
 */
export function findNextRoadStep(currX, currY, targetX, targetY, worldMatrix, roomMatrix, hobbit) {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    let bestStep = null;
    let minDistance = Infinity;

    if (!hobbit.visitedHistory) {
        hobbit.visitedHistory = [];
    }

    for (let d of dirs) {
        const nx = currX + d[0];
        const ny = currY + d[1];
        if (!isWalkableForHobbit(nx, ny, worldMatrix, roomMatrix, hobbit)) continue;

        const tileData = getTileData(nx * 16 + 8, ny * 16 + 8, worldMatrix, roomMatrix);
        const isRoad = tileData && (tileData.tileID === 337 || tileData.tileID === 208);

        const dist = Math.hypot(targetX - nx, targetY - ny);
        let perceivedDist = dist;
        
        if (isRoad) {
            perceivedDist -= 15; // Road prioritization weight
        }

        const historyIdx = hobbit.visitedHistory.indexOf(`${nx}_${ny}`);
        if (historyIdx !== -1) {
            const recencyFactor = historyIdx + 1; 
            perceivedDist += recencyFactor * 12; // Repetition penalty
        }

        if (perceivedDist < minDistance) {
            minDistance = perceivedDist;
            bestStep = { x: nx, y: ny, isRoad: isRoad };
        }
    }
    return bestStep;
}

/**
 * Simplistic linear vector step generator to approximate routes for off-screen entities
 * where real-time physics can be bypassed.
 */
export function findOffScreenPath(startTX, startTY, targetTX, targetTY) {
    const path = [];
    let curX = startTX;
    let curY = startTY;
    const maxSteps = 40; 

    for (let i = 0; i < maxSteps; i++) {
        if (curX === targetTX && curY === targetTY) break;

        const dx = targetTX - curX;
        const dy = targetTY - curY;

        if (Math.abs(dx) >= Math.abs(dy)) {
            curX += Math.sign(dx);
        } else {
            curY += Math.sign(dy);
        }

        path.push({ x: curX, y: curY });
    }
    return path.length > 0 ? path : null;
}