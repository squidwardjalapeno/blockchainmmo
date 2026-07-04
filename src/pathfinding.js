// src/pathfinding.js

if (typeof window !== 'undefined') {
    logStep("pathfinding.js loaded");
}

/**
 * Generalized BFS Pathfinding Helper
 * @param {number} startX - Starting grid X
 * @param {number} startY - Starting grid Y
 * @param {function} isWalkableFn - Callback: (tx, ty, fromX, fromY) => boolean
 * @param {function} isTargetFn - Callback: (tx, ty) => boolean
 * @param {number} maxDepth - Maximum search depth limit
 * @returns {Array<{x: number, y: number}>|null} - Array of path nodes, or null if no path found
 */
export function findPath(startX, startY, isWalkableFn, isTargetFn, maxDepth = 80) {
    const queue = [{ x: startX, y: startY, path: [] }];
    const visited = new Set([`${startX}_${startY}`]);

    while (queue.length > 0) {
        const curr = queue.shift();

        // Check if we have arrived at a valid target tile
        if (curr.path.length > 0 && isTargetFn(curr.x, curr.y)) {
            return curr.path;
        }

        if (curr.path.length >= maxDepth) continue;

        const neighbors = [
            { x: curr.x, y: curr.y - 1 }, // North
            { x: curr.x, y: curr.y + 1 }, // South
            { x: curr.x - 1, y: curr.y }, // West
            { x: curr.x + 1, y: curr.y }  // East
        ];

        for (let n of neighbors) {
            const key = `${n.x}_${n.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                if (isWalkableFn(n.x, n.y, curr.x, curr.y)) {
                    queue.push({
                        x: n.x,
                        y: n.y,
                        path: [...curr.path, { x: n.x, y: n.y }]
                    });
                }
            }
        }
    }

    return null; // Path not found
}