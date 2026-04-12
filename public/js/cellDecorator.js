
// js/cellDecorator.js
import { applyShorelineRules } from './terrainRules.js';
import { CONFIG } from './config.js'
import { createGrass, plants } from './plants.js';
import { seededRandom } from "./mapGenerator.js";


let nextHouseId = 1;

// js/cellDecorator.js

/**
 * Safely writes a tile ID and room ID to any coordinate in the 10,000x10,000 world
 */
// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

export function setGlobalTile(gx, gy, tileID, roomID, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);

    if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) return;

    // If the cell is null, let decorateCell handle the wake-up and village-stamping!
    if (worldMatrix[cx][cy] === null) {
        decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }

    // Now safely draw the road/tile
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    worldMatrix[cx][cy][(ly * 100) + lx] = tileID;
    roomMatrix[cx][cy][(ly * 100) + lx] = roomID;
}











// js/cellDecorator.js
const cellMemory = new Map();

function getInbound(i, j) {
    // 1. Get the cell ABOVE us (North neighbor)
    const top = cellMemory.get(`${i}_${j-1}`) || { outN: 16, outS: 16, outW: 16, outE: 16 };
    
    // 2. Get the cell to our LEFT (West neighbor)
    const left = cellMemory.get(`${i-1}_${j}`) || { outN: 16, outS: 16, outW: 16, outE: 16 };

    return {
        // Vertical Shores (East/West) - These flow from the TOP neighbor
        inWest:  top.outW ?? 16, // Our West shore starts where Top's West shore ended
        inEast:  top.outE ?? 16, // Our East shore starts where Top's East shore ended

        // Horizontal Shores (North/South) - These flow from the LEFT neighbor
        inNorth: left.outN ?? 16, // Our North shore starts where Left's North shore ended
        inSouth: left.outS ?? 16  // Our South shore starts where Left's South shore ended
    };
}
/**
 * Utility to place a single 4x3 house at a specific coordinate
 */
// js/cellDecorator.js

// js/cellDecorator.js

// 1. Updated Signature to include fertilityMatrix and worldMap
export function drawHouse(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const currentId = nextHouseId++;
    // console.log(`Building house at ${gx}, ${gy}`); 

    // 1. FILL THE HOUSE FOOTPRINT (4 wide x 3 deep)
    for (let i = 0; i < 4; i++) {
        for (let j = -2; j <= 0; j++) {
            // 🛡️ PASS ALL 8 ARGUMENTS
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    // 2. OVERWRITE WITH THE EXTERIOR SHELL
    for (let i = 0; i < 4; i++) {
        // Row j = -2: The Roof
        setGlobalTile(gx + i, gy - 2, 40, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Row j = -1: The Exterior Wall
        setGlobalTile(gx + i, gy - 1, 48, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

        // Row j = 0: Foundations & Door
        let foundTile = 50; 
        if (i === 1) foundTile = 49; 
        if (i === 2) foundTile = 52; 
        
        setGlobalTile(gx + i, gy, foundTile, currentId, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }
}










/**
 * Stamps a cluster of houses and a central well
 */
// js/cellDecorator.js

// js/cellDecorator.js

export function drawVillage(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // 1. STAMP THE CENTRAL WELL (The "Town Square")
    // Note: We use Tile 30-39 for the well
    setGlobalTile(gvx, gvy, 30, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gvx + 1, gvy, 31, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gvx + 1, gvy + 1, 39, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gvx, gvy + 1, 38, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 2. SEARCH FOR ROADS & DRAW HOUSES
    const houseGoal = Math.floor(Math.random() * 5) + 6; // 6 to 10 houses
    let placed = 0;
    let attempts = 0;

    // Inside drawVillage (gvx, gvy, ...)
while (placed < houseGoal && attempts < 2000) {
    attempts++;

    const rx = Math.floor(Math.random() * 60) - 30; // Slightly wider search
    const ry = Math.floor(Math.random() * 60) - 30;
    const targetX = gvx + rx;
    const targetY = gvy + ry;

    // 1. "BOX AUTOMATA" - PROXIMITY CHECK (Find the road)
    let nearRoad = false;
    for (let ox = -4; ox <= 4; ox++) {
        for (let oy = -4; oy <= 4; oy++) {
            if (getTileID(targetX + ox, targetY + oy, worldMatrix) === 6) {
                nearRoad = true;
                break; 
            }
        }
        if (nearRoad) break;
    }

    if (!nearRoad) continue;

    // 2. 🏠 "FOOTPRINT CHECK" - COLLISION CHECK (Is there a house here?)
    // Your houses are 4x3. We check a slightly larger 6x5 area 
    // to give houses a "yard" so they don't touch walls.
    let spaceBlocked = false;
    for (let fx = -1; fx < 5; fx++) { // House width (4) + 1 tile buffer
        for (let fy = -3; fy < 2; fy++) { // House height (3) + 1 tile buffer
            // Check the Room Matrix (0 = Empty Ground)
            if (getRoomID(targetX + fx, targetY + fy, roomMatrix) !== 0) {
                spaceBlocked = true;
                break;
            }
            // Optional: Also ensure we don't build ON the road (Tile 6)
            if (getTileID(targetX + fx, targetY + fy, worldMatrix) === 6) {
                spaceBlocked = true;
                break;
            }
        }
        if (spaceBlocked) break;
    }

    // 3. FINAL PLACEMENT
    if (nearRoad && !spaceBlocked) {
        drawHouse(targetX, targetY, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        placed++;
        // Skip some attempts to naturally space out the next house
        attempts += 10; 
    }
}

    
    console.log(`🏘️ Village complete: Placed ${placed} houses near roads.`);
}

// Helper to read the tile from the matrices
function getTileID(gx, gy, worldMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    if (!worldMatrix[cx] || !worldMatrix[cx][cy]) return 0;
    
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    return worldMatrix[cx][cy][(ly * 100) + lx];
}

function getRoomID(gx, gy, roomMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    if (!roomMatrix[cx] || roomMatrix[cx][cy] === null) return 0;

    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;
    return roomMatrix[cx][cy][(ly * 100) + lx];
}





/**
 * Spawns "Suburban" houses in the surrounding area
 */
function drawSuburbs(cellMatrix) {
    const extraHouses = Math.floor(Math.random() * 2) + 3; // 3 to 4 houses
    for (let i = 0; i < extraHouses; i++) {
        const rx = Math.floor(Math.random() * 80) + 10;
        const ry = Math.floor(Math.random() * 80) + 10;
        drawHouse(cellMatrix, rx, ry);
    }
}

// js/cellDecorator.js

/**
 * Stamps a massive fortified town and its surrounding suburbs
 */
export function drawTown(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    console.log(`🏰 Founding a Fortified Town at [${gtx}, ${gty}]`);

    // 1. DIMENSIONS
    const townWidth = Math.floor(Math.random() * 10) + 95; 
    const townHeight = Math.floor(Math.random() * 10) + 95;
    const halfW = Math.floor(townWidth / 2);
    const halfH = Math.floor(townHeight / 2);

    // 2. DRAW THE FORTIFIED WALLS (Tile 11)
    for (let x = -halfW; x <= halfW; x++) {
        for (let y = -halfH; y <= halfH; y++) {
            const isEdgeX = (x === -halfW || x === halfW);
            const isEdgeY = (y === -halfH || y === halfH);

            if (isEdgeX || isEdgeY) {
                // Gap for Gate
                let tileID = (Math.abs(x) > 2 && Math.abs(y) > 2) ? 11 : 6;
                
                // 🛡️ FIX: Added fertilityMatrix and worldMap
                setGlobalTile(gtx + x, gty + y, tileID, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            }
        }
    }

    // 3. THE CENTRAL HUB
    // 🛡️ FIX: Added fertilityMatrix and worldMap to all 4 well tiles
    setGlobalTile(gtx, gty, 30, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gtx + 1, gty, 31, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gtx, gty + 1, 38, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    setGlobalTile(gtx + 1, gty + 1, 39, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 4. POPULATE HOUSES
    const houseGoal = Math.floor(Math.random() * 14) + 14;
    let placed = 0;
    let attempts = 0;

    while (placed < houseGoal && attempts < 200) { // Increased attempts for larger town
        const rx = Math.floor(Math.random() * (townWidth - 12)) - (halfW - 6);
        const ry = Math.floor(Math.random() * (townHeight - 12)) - (halfH - 6);

        if (Math.abs(rx) > 4 || Math.abs(ry) > 4) {
            // 🛡️ FIX: Added fertilityMatrix and worldMap
            drawHouse(gtx + rx, gty + ry, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
            placed++;
        }
        attempts++;
    }
}


/**
 * Spawns 3 smaller villages around the main town
 */
function drawTownSuburbs(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix) {
    for (let i = 0; i < 3; i++) {
        // 100 tiles = 1 Cell. 4-6 cells = 400-600 tiles.
        const dist = (Math.floor(Math.random() * 2) + 4) * 100;
        const angle = (Math.PI * 2 / 3) * i; // Distribute them in a triangle
        
        const subX = Math.floor(gtx + Math.cos(angle) * dist);
        const subY = Math.floor(gty + Math.sin(angle) * dist);

        // Reuse your existing village logic!
        drawVillage(subX, subY, worldMatrix, roomMatrix, fertilityMatrix);
        console.log(` 🛖 Town Suburb ${i+1} spawned at [${subX}, ${subY}]`);
    }
}

// js/cellDecorator.js

// js/cellDecorator.js
export function drawCastle(gcx, gcy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    // gcx/gcy = (cx * 100) + 100. This is the "Crosshair" of the 4 cells.

    // 1. THE 4-CELL WELL (SPLIT)
    // Top-Left Tile (In Cell TL)
    setGlobalTile(gcx - 1, gcy - 1, 30, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Top-Right Tile (In Cell TR)
    setGlobalTile(gcx,     gcy - 1, 31, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Bottom-Left Tile (In Cell BL)
    setGlobalTile(gcx - 1, gcy,     38, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Bottom-Right Tile (In Cell BR)
    setGlobalTile(gcx,     gcy,     39, 0, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 2. MASSIVE FORTIFICATIONS (Centered on the well)
    // Outer Wall (200x200 footprint)
    drawFortifiedRing(gcx, gcy, 198, 198, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // Inner Ward (100x100)
    drawFortifiedRing(gcx, gcy, 100, 100, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // The Keep (40x40)
    drawFortifiedRing(gcx, gcy, 40, 40, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
}


/**
 * Helper to draw a square wall with a gate
 */
function drawFortifiedRing(centerX, centerY, width, height, worldMatrix, roomMatrix) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    for (let x = -halfW; x < halfW; x++) {
        for (let y = -halfH; y < halfH; y++) {
            const isEdgeX = (x === -halfW || x === halfW - 1);
            const isEdgeY = (y === -halfH || y === halfH - 1);

            if (isEdgeX || isEdgeY) {
                const gx = centerX + x;
                const gy = centerY + y;

                // Create a 2-tile "Gate" at the South of every wall
                const isGate = (y === halfH - 1 && (x === 0 || x === -1));

                if (isGate) {
                    setGlobalTile(gx, gy, 6, 0, worldMatrix, roomMatrix); // Road
                } else {
                    setGlobalTile(gx, gy, 11, 0, worldMatrix, roomMatrix); // Wall
                }
            }
        }
    }
}



/**
 * Logic for a 2-tile wide path
 */
function drawSimpleRoad(gx, gy, dx, dy, length, worldMatrix, roomMatrix, fertilityMatrix) {
    let curX = gx;
    let curY = gy;

    for (let i = 0; i < length; i++) {

        // 1. FIRST: Calculate the coordinates (This defines cx, cy, lx, ly)
        const cx = Math.floor(curX / 100);
        const cy = Math.floor(curY / 100);
        const lx = ((curX % 100) + 100) % 100;
        const ly = ((curY % 100) + 100) % 100;

        // 2. 🛡️ THE WATER STOPPER (The Fix)
        // We check the specific tile [lx][ly] inside the cell [cx][cy]
        const currentTile = worldMatrix[cx]?.[cy]?.[lx]?.[ly];
        
        // If we hit Water (17) or Undefined (Edge of World), STOP the road immediately
        if (currentTile === 17 || currentTile === undefined) {
            console.log("🌊 Road hit water/edge at:", curX, curY);
            break; 
        }
        // Paint 2 tiles (The road width)
        // If moving vertically (dy), we paint 2 tiles horizontally
        // If moving horizontally (dx), we paint 2 tiles vertically
        for (let j = 0; j < 2; j++) {
            const rx = (dy !== 0) ? curX + j : curX;
            const ry = (dx !== 0) ? curY + j : curY;
            
            // Tile 42 is our "Path" tile
            setGlobalTile(rx, ry, 6, 0, worldMatrix, roomMatrix, fertilityMatrix);
        }

        // --- 🎲 PROCEDURAL "WOBBLE" ---
        // 10% chance to turn 90 degrees (Elbow)
        if (Math.random() < 0.10) {
            const oldDx = dx;
            dx = dy;
            dy = oldDx;
        }

        curX += dx;
        curY += dy;
        
        
    }
}

function drawInterCellRoad(startX, startY, endX, endY, worldMatrix, roomMatrix, fertilityMatrix, worldMap, tileID = 6, thickness = 2) {
    let curX = startX;
    let curY = startY;
    let steps = 0;
    const maxSteps = 20000; // Increased for single-pixel stepping

    const isCastleRoad = (tileID === 8 || thickness >= 6);

    // 🛡️ THE FIX: Exact target matching
    while ((curX !== endX || curY !== endY) && steps < maxSteps) {
        steps++;

        // 1. MANHATTAN STEPPING (The "Diagonal Fix")
        // We only move ONE axis at a time. This ensures the brush 
        // footprint is always exactly 'thickness' wide.
        if (Math.abs(curX - endX) > Math.abs(curY - endY)) {
            if (curX < endX) curX++;
            else curX--;
        } else {
            if (curY < endY) curY++;
            else curY--;
        }

        // 2. 🛑 REMOVED Math.random() WOBBLE
        // For the 2-tile, 4-tile, and 6-tile roads to overlap perfectly,
        // they MUST follow the exact same deterministic path.
        // (Wobble can be re-added later using seededRandom(curX + curY))

        // 3. DYNAMIC THICKNESS & BRIDGE LOGIC
        const offset = Math.floor(thickness / 2);

        for (let ox = -offset; ox < (thickness - offset); ox++) {
            for (let oy = -offset; oy < (thickness - offset); oy++) {
                const targetX = curX + ox;
                const targetY = curY + oy;

                // --- 🌉 THE BRIDGE CHECK ---
                const cx = Math.floor(targetX / 100);
                const cy = Math.floor(targetY / 100);
                const lx = ((targetX % 100) + 100) % 100;
                const ly = ((targetY % 100) + 100) % 100;
                
                const globalIdx = (cy * 100 + ly) * CONFIG.MAP_SIZE + (cx * 100 + lx);
                const terrainHeight = worldMap[globalIdx];

                let finalTile = tileID;
                if (terrainHeight < CONFIG.LAND_THRESHOLD) {
                    finalTile = isCastleRoad ? 13 : 12; 
                }

                setGlobalTile(
                    targetX, targetY, finalTile, 0, 
                    worldMatrix, roomMatrix, fertilityMatrix, worldMap
                );
            }
        }
    }
}





export function drawOreDeposit(gx, gy, worldMatrix, roomMatrix, fertilityMatrix) {
    // A 2x2 cluster using Tile 30 (Ore)
    // We set roomID to 0 because ores aren't "inside" anything
    for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
            setGlobalTile(gx + x, gy + y, 29, 0, worldMatrix, roomMatrix, fertilityMatrix);
        }
    }
}

// js/cellDecorator.js

export function drawMiningArea(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix) {
    const depositCount = Math.floor(Math.random() * 2) + 3; // 3 to 4 clusters
    
    for (let i = 0; i < depositCount; i++) {
        // Scatter the 2x2 deposits within 8 tiles of each other
        const offsetX = Math.floor(Math.random() * 16) - 8;
        const offsetY = Math.floor(Math.random() * 16) - 8;
        
        drawOreDeposit(gvx + offsetX, gvy + offsetY, worldMatrix, roomMatrix, fertilityMatrix);

        

        
    }

    setGlobalTile(gvx, gvy, 62, 0, worldMatrix, roomMatrix, fertilityMatrix);
}



function paintSide(cellMatrix, startVal, side) {
    
    let beachLength = startVal;
    for (let i = 0; i <= 100; i++) {
        // Your "outOf2" logic
        let outOf2 = Math.floor(Math.random() * 2) + 1;
        if (outOf2 == 1 && beachLength < CONFIG.WOBBLE_MAX) beachLength++;
        if (outOf2 == 2 && beachLength > 0)  beachLength--;

        for (let j = 0; j <= beachLength; j++) {
            if (side === "NORTH") cellMatrix[i][j] = 0;           // Horizontal Top
            if (side === "SOUTH") cellMatrix[i][100 - j] = 0;     // Horizontal Bottom
            if (side === "WEST")  cellMatrix[j][i] = 0;           // Vertical Left
            if (side === "EAST")  cellMatrix[100 - j][i] = 0;     // Vertical Right
        }
    }
    return beachLength; // Passes to the neighbor on the OTHER side
}

function paintCorner(matrix, startH, startV, cornerType) {
    let hLen = startH; // Horizontal start
    let vLen = startV; // Vertical start

    // We only scan 16 pixels because corners are small "caps"
    for (let i = 0; i <= 16; i++) {
        let outOf2 = Math.floor(Math.random() * 2) + 1;
        
        // Wobble both lengths
        if (outOf2 == 1) { hLen++; vLen++; }
        if (outOf2 == 2) { hLen--; vLen--; }

        // Paint the Horizontal Part of the corner
        for (let j = 0; j <= hLen; j++) {
            if (cornerType === "NW") matrix[i][j] = 0; 
            if (cornerType === "NE") matrix[100 - i][j] = 0;
            if (cornerType === "SW") matrix[i][100 - j] = 0;
            if (cornerType === "SE") matrix[100 - i][100 - j] = 0;
        }

        // Paint the Vertical Part of the corner
        for (let j = 0; j <= vLen; j++) {
            if (cornerType === "NW") matrix[j][i] = 0;
            if (cornerType === "NE") matrix[j][100 - i] = 0;
            if (cornerType === "SW") matrix[100 - j][i] = 0;
            if (cornerType === "SE") matrix[100 - j][100 - i] = 0;
        }
    }
    return { hEnd: hLen, vEnd: vLen };
}

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

// js/cellDecorator.js

export function decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {

    console.log("--- WAKE UP CHECK ---");
    console.log("cx:", cx, "cy:", cy);
    console.log("worldMatrix exists:", !!worldMatrix);
    console.log("roomMatrix exists:", !!roomMatrix);
    console.log("fertilityMatrix exists:", !!fertilityMatrix);
    console.log("worldMap exists:", !!worldMap);
    
    if (!fertilityMatrix) {
        console.error("❌ ERROR: fertilityMatrix was NOT passed to decorateCell!");
        return; 
    }

    if (cx > CONFIG.MAP_SIZE || cy > CONFIG.MAP_SIZE) {
        console.error(`🚨 BOUNDARY ERROR: cx=${cx}, cy=${cy}. This should not happen!`);
        console.trace(); // This shows exactly which function called decorateCell with 1304
        return; 
    }
    const blueprintIdx = (cy * CONFIG.MAP_SIZE) + cx;
    const cellType = worldMap[blueprintIdx];
    const isLand = cellType >= CONFIG.LAND_THRESHOLD || cellType >= 100;

    // 1. THE WAKE-UP (Only runs the VERY FIRST time a cell is touched)
    if (worldMatrix[cx][cy] === null) {
        // Initialize all 3 buffers with base terrain (Grass: 63, Water: 17)
        worldMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 63 : 17);
        roomMatrix[cx][cy] = new Uint16Array(10000).fill(0);
        fertilityMatrix[cx][cy] = new Uint8Array(10000).fill(isLand ? 10 : 0);

        
    }
}









/**
 * Main function to turn a 1-100 map into a Tile-ID map
 */
// js/cellDecorator.js

// js/worldPopulator.js

export function populateWorld(worldMap) {
    nextHouseId = 1;
    const size = CONFIG.MAP_SIZE; // 100

    // 1. Create the skeleton (Already in your code)
    let worldMatrix = Array.from({ length: size }, () => new Array(size).fill(null));
    let roomMatrix = Array.from({ length: size }, () => new Array(size).fill(null));
    let fertilityMatrix = Array.from({ length: size }, () => new Array(size).fill(null));

    // 2. PRE-SCAN: Decide where Villages and Castles go
    for (let i = 0; i < worldMap.length; i++) {
        const isLand = worldMap[i] >= CONFIG.LAND_THRESHOLD;

        if (isLand) {
            // Use your seededRandom() here so the locations stay the same for the same seed!
            const roll = seededRandom(); 
            console.log("🗺️ TEST");
            if (roll > 0.99995177469) {
              //  worldMap[i] = 103; // Mark as CASTLE
            }
            else if (roll > 0.99942129629) {
               // worldMap[i] = 102; // Mark as TOWN
            } else if (roll > 0.99305555555) {
               // worldMap[i] = 101; // Mark as VILLAGE
            }
        }
    }

    console.log("🗺️ World Blueprint planned. Villages are marked on the map!");
    return { worldMatrix, roomMatrix, fertilityMatrix, worldMap };
}

// js/worldPopulator.js

export function linkVillages(worldMap, worldMatrix, roomMatrix, fertilityMatrix) {
    const size = CONFIG.MAP_SIZE;
    const adjacencyList = new Map(); // 🆕 Track who is connected to whom

    // 1. COLLECT ALL NODES (Towns and Villages)
    const settlements = [];
    for (let i = 0; i < worldMap.length; i++) {
        if (worldMap[i] === 102 || worldMap[i] === 101 || worldMap[i] === 103) {
            settlements.push({ 
                id: i, 
                type: worldMap[i], 
                x: i % size, 
                y: Math.floor(i / size) 
            });
        }
    }

    // 2. UNIFIED SMART ROAD PASS
    for (let i = 0; i < settlements.length; i++) {
        const A = settlements[i];

        for (let j = i + 1; j < settlements.length; j++) {
            const B = settlements[j];

            // Distance Check
            const dxAB = A.x - B.x;
            const dyAB = A.y - B.y;
            const distSqAB = (dxAB * dxAB) + (dyAB * dyAB);

            // --- 🆕 DYNAMIC RANGE RULES ---
            let maxRangeSq = 64; // Default Village (8 cells)
            if (A.type === 103 || B.type === 103) maxRangeSq = 2500; // 🏰 Castle (50 cells)
            else if (A.type === 102 && B.type === 102) maxRangeSq = 400; // 🏘️ Town (20 cells)

            if (distSqAB > 0 && distSqAB <= maxRangeSq) {
                let redundant = false;

                // CIRCULAR CHECK (The RNG Rule)
                for (let k = 0; k < settlements.length; k++) {
                    if (k === i || k === j) continue;
                    const C = settlements[k];

                    const dxAC = A.x - C.x;
                    const dyAC = A.y - C.y;
                    const distSqAC = (dxAC * dxAC) + (dyAC * dyAC);

                    const dxBC = B.x - C.x;
                    const dyBC = B.y - C.y;
                    const distSqBC = (dxBC * dxBC) + (dyBC * dyBC);

                    // If C is closer to both ends than they are to each other, skip direct road
                    if (distSqAC < distSqAB && distSqBC < distSqAB) {
                        redundant = true;
                        break;
                    }
                }

                // Circular Check (Keep your existing k-loop here...)
                // [Insert your existing for (let k = 0...) loop here]

               if (!redundant) {
    // 1. ADD TO THE NETWORK (The "Phone Book")
    // This allows BFS to find the path later even if direct roads were deleted
    if (!adjacencyList.has(A.id)) adjacencyList.set(A.id, []);
    if (!adjacencyList.has(B.id)) adjacencyList.set(B.id, []);
    adjacencyList.get(A.id).push(B);
    adjacencyList.get(B.id).push(A);

    // 2. DRAW THE BASE DIRT ROAD
    // We default everything to 2-tile wide dirt (Tile 6) for now
    const startOff = (A.type === 103) ? 100 : 50;
    const endOff   = (B.type === 103) ? 100 : 50;

    drawInterCellRoad(
        A.x * 100 + startOff, A.y * 100 + startOff, 
        B.x * 100 + endOff,   B.y * 100 + endOff, 
        worldMatrix, roomMatrix, fertilityMatrix, worldMap, 
        6, 2 // 🛖 Default Village Style
    );
}

            }
        }
    }

// --- STEP 2: THE PRESTIGE PASS (Cascaded) ---

// 1. ROYAL ROADS (Castle to Castle)
const castles = settlements.filter(s => s.type === 103);
castles.forEach(start => {
    castles.forEach(end => {
        if (start.id === end.id) return;
        // Search every connection in the network for Castle-to-Castle paths
        promotePath(start, end, adjacencyList, 8, 6, 2500, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    });
});

// 2. TOWN HIGHWAYS (Town to Town OR Town to Castle)
const hubs = settlements.filter(s => s.type >= 102); // Towns (102) and Castles (103)
hubs.forEach(start => {
    hubs.forEach(end => {
        if (start.id === end.id) return;
        // Only promote if it's a Town-involved route (we already did Castle-to-Castle)
        if (start.type === 102 || end.type === 102) {
            promotePath(start, end, adjacencyList, 7, 4, 900, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        }
    });
});




    // 3. FINAL STAMPING PASS
    for (let i = 0; i < settlements.length; i++) {
        const S = settlements[i];
        const gx = S.x * 100 + (S.type === 103 ? 100 : 50);
        const gy = S.y * 100 + (S.type === 103 ? 100 : 50);

        if (S.type === 101) drawVillage(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        else if (S.type === 102) drawTown(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        else if (S.type === 103) drawCastle(gx, gy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    }
}


function findNearestInBlueprint(startX, startY, targetType, maxRange, worldMap, size, selfIdx = -1) {
    let nearest = null;
    let minDist = maxRange + 1;

    for (let i = 0; i < worldMap.length; i++) {
        if (i === selfIdx) continue;
        if (worldMap[i] === targetType) {
            const tx = i % size;
            const ty = Math.floor(i / size);
            const dist = Math.abs(startX - tx) + Math.abs(startY - ty);
            
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: tx, y: ty };
            }
        }
    }
    return nearest;
}

function findPathInNetwork(start, target, adj) {
    let queue = [[start]];
    let visited = new Set([start.id]);

    while (queue.length > 0) {
        let path = queue.shift();
        let node = path[path.length - 1];

        if (node.id === target.id) return path;

        for (let neighbor of (adj.get(node.id) || [])) {
            if (!visited.has(neighbor.id)) {
                visited.add(neighbor.id);
                queue.push([...path, neighbor]);
            }
        }
    }
    return []; // No path found
}

// Add worldMatrix, roomMatrix, fertilityMatrix, worldMap to the end
function promotePath(startNode, endNode, adj, tileID, thickness, maxRangeSq, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const dx = startNode.x - endNode.x;
    const dy = startNode.y - endNode.y;
    if ((dx * dx + dy * dy) > maxRangeSq) return;

    let path = findPathInNetwork(startNode, endNode, adj);
    if (path && path.length > 1) {
        for (let i = 0; i < path.length - 1; i++) {
            const [segA, segB] = [path[i], path[i+1]].sort((a, b) => a.id - b.id);

            const sOff = (segA.type === 103) ? 100 : 50;
            const eOff = (segB.type === 103) ? 100 : 50;

            // Now these variables will be defined!
            drawInterCellRoad(
                segA.x * 100 + sOff, segA.y * 100 + sOff, 
                segB.x * 100 + eOff, segB.y * 100 + eOff, 
                worldMatrix, roomMatrix, fertilityMatrix, worldMap, 
                tileID, thickness
            );
        }
    }
}






const decoratedCells = new Set(); 

export function ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap) {
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);

    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const cx = heroCX + ox;
            const cy = heroCY + oy;

            if (cx < 0 || cx >= CONFIG.MAP_SIZE || cy < 0 || cy >= CONFIG.MAP_SIZE) continue;

            const cellKey = `${cx}_${cy}`;
            if (!decoratedCells.has(cellKey)) {
                // SIMPLIFIED: Just call decorateCell. 
                // It will wake up the memory AND draw structures in one go.
                decorateCell(cx, cy, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
                decoratedCells.add(cellKey);
            }
        }
    }
}









