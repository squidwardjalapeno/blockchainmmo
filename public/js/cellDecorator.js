
// js/cellDecorator.js
import { applyShorelineRules } from './terrainRules.js';
import { CONFIG } from './config.js'
import { createGrass, plants } from './plants.js';

let nextHouseId = 1;

// js/cellDecorator.js

/**
 * Safely writes a tile ID and room ID to any coordinate in the 10,000x10,000 world
 */
// js/cellDecorator.js

function setGlobalTile(gx, gy, tileID, roomID, worldMatrix, roomMatrix) {
    const cx = Math.floor(gx / 100);
    const cy = Math.floor(gy / 100);
    const lx = ((gx % 100) + 100) % 100;
    const ly = ((gy % 100) + 100) % 100;

    // Safety check: ensure the cell and row exist before writing
    if (worldMatrix[cx]?.[cy]?.[lx]) {
        worldMatrix[cx][cy][lx][ly] = tileID;
        roomMatrix[cx][cy][lx][ly] = roomID;
    }
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

function drawHouse(gx, gy, worldMatrix, roomMatrix) {
    const currentId = nextHouseId++;
    console.log(`Building house at ${gx}, ${gy}`); 

    // 1. FILL THE HOUSE FOOTPRINT (4 wide x 3 deep)
    // This ensures every tile (even hidden ones) has the House ID
    for (let i = 0; i < 4; i++) {
        for (let j = -2; j <= 0; j++) {
            // Write a default floor (42) and the House ID (currentId)
            setGlobalTile(gx + i, gy + j, 42, currentId, worldMatrix, roomMatrix);

            // --- 🌿 CLEAR THE GRASS ENTITIES HERE ---
            // This removes the plant from the Map so the renderer stops drawing it
            plants.delete(`${gx + i}_${gy + j}`); 
        }
    }

    // 2. OVERWRITE WITH THE EXTERIOR SHELL
    // Now we "paint" the roof and walls on top of that ID-filled space
    for (let i = 0; i < 4; i++) {
        // Row j = -2: The Roof (hides the back wall)
        setGlobalTile(gx + i, gy - 2, 40, currentId, worldMatrix, roomMatrix);

        // Row j = -1: The Exterior Wall
        setGlobalTile(gx + i, gy - 1, 48, currentId, worldMatrix, roomMatrix);

        // Row j = 0: Foundations & Door
        let foundTile = 50; 
        if (i === 1) foundTile = 49; // Door
        if (i === 2) foundTile = 52; // Special Foundation
        
        setGlobalTile(gx + i, gy, foundTile, currentId, worldMatrix, roomMatrix);
    }
}









/**
 * Stamps a cluster of houses and a central well
 */
// js/cellDecorator.js

// js/cellDecorator.js

// Order: (gx, gy, worldMatrix, roomMatrix) 
// (Changed from your previous version to match drawHouse)
export function drawVillage(gvx, gvy, worldMatrix, roomMatrix, fertilityMatrix) {
    // 1. Well (ID 51, Room 0)
    setGlobalTile(gvx, gvy, 30, 0, worldMatrix, roomMatrix); 
    setGlobalTile(gvx + 1, gvy, 31, 0, worldMatrix, roomMatrix); 
    setGlobalTile(gvx + 1, gvy + 1, 39, 0, worldMatrix, roomMatrix); 
    setGlobalTile(gvx, gvy + 1, 38, 0, worldMatrix, roomMatrix); 

     // 2. THE 2-TILE ROADS (Branching from each side)
    // North Road (Starts above the well)
    drawSimpleRoad(gvx, gvy - 1, 0, -1, 120, worldMatrix, roomMatrix, fertilityMatrix);
    // South Road (Starts below the well)
    drawSimpleRoad(gvx, gvy + 2, 0, 1, 120, worldMatrix, roomMatrix, fertilityMatrix);
    // West Road (Starts left of the well)
    drawSimpleRoad(gvx - 1, gvy, -1, 0, 120, worldMatrix, roomMatrix, fertilityMatrix);
    // East Road (Starts right of the well)
    drawSimpleRoad(gvx + 2, gvy, 1, 0, 120, worldMatrix, roomMatrix, fertilityMatrix);

    // 2. Houses
    const houseCount = Math.floor(Math.random() * 4) + 5; 
    for (let i = 0; i < houseCount; i++) {
        const offsetX = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 25) + 15);
        const offsetY = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 25) + 15);
        
        // Now calling drawHouse is perfectly consistent
        drawHouse(gvx + offsetX, gvy + offsetY, worldMatrix, roomMatrix);
    }
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
export function drawTown(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix) {
    console.log(`🏰 Founding a Fortified Town at [${gtx}, ${gty}]`);

    // 1. DIMENSIONS (A town is roughly 50x50 tiles)
    const townWidth = Math.floor(Math.random() * 10) + 45; 
    const townHeight = Math.floor(Math.random() * 10) + 45;
    const halfW = Math.floor(townWidth / 2);
    const halfH = Math.floor(townHeight / 2);

    // 2. DRAW THE FORTIFIED WALLS (Tile 11)
    for (let x = -halfW; x <= halfW; x++) {
        for (let y = -halfH; y <= halfH; y++) {
            // Only draw on the perimeter
            const isEdgeX = (x === -halfW || x === halfW);
            const isEdgeY = (y === -halfH || y === halfH);

            if (isEdgeX || isEdgeY) {
                // Leave a gap for a "Gate" at the center of each wall
                if (Math.abs(x) > 2 && Math.abs(y) > 2) {
                    setGlobalTile(gtx + x, gty + y, 11, 0, worldMatrix, roomMatrix);
                } else {
                    // Draw a road tile (6) in the gate gaps
                    setGlobalTile(gtx + x, gty + y, 6, 0, worldMatrix, roomMatrix);
                }
            }
        }
    }

    // 3. THE CENTRAL HUB (Well and Square)
    setGlobalTile(gtx, gty, 30, 0, worldMatrix, roomMatrix); // Well
    setGlobalTile(gtx + 1, gty, 31, 0, worldMatrix, roomMatrix); 
    setGlobalTile(gtx, gty + 1, 38, 0, worldMatrix, roomMatrix); 
    setGlobalTile(gtx + 1, gty + 1, 39, 0, worldMatrix, roomMatrix); 

    // 4. POPULATE HOUSES (14 - 28)
    const houseGoal = Math.floor(Math.random() * 14) + 14;
    let placed = 0;
    let attempts = 0;

    while (placed < houseGoal && attempts < 100) {
        // Pick a spot inside the walls (with a 6-tile margin so they don't touch walls)
        const rx = Math.floor(Math.random() * (townWidth - 12)) - (halfW - 6);
        const ry = Math.floor(Math.random() * (townHeight - 12)) - (halfH - 6);

        // Simple distance check from well to keep the center clear
        if (Math.abs(rx) > 4 || Math.abs(ry) > 4) {
            drawHouse(gtx + rx, gty + ry, worldMatrix, roomMatrix);
            placed++;
        }
        attempts++;
    }

    // 5. SPAWN SUBURBS (3 Villages within 4-6 Cells)
    //drawTownSuburbs(gtx, gty, worldMatrix, roomMatrix, fertilityMatrix);
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

/**
 * Stamps a massive 3-layer fortress (100x100 tiles)
 */
export function drawCastle(gcx, gcy, worldMatrix, roomMatrix, fertilityMatrix) {
    console.log("🏰 constructing a Triple-Layer Fortress...");

    // 1. OUTER WALL (100x100) - Fills the entire cell
    drawFortifiedRing(gcx, gcy, 100, 100, worldMatrix, roomMatrix);

    // 2. INNER WALL (50x50) - The middle defense layer
    drawFortifiedRing(gcx, gcy, 50, 50, worldMatrix, roomMatrix);

    // 3. THE KEEP (20x20) - The final sanctuary
    drawFortifiedRing(gcx, gcy, 20, 20, worldMatrix, roomMatrix);

    // 4. ADD THE WELL (Center of the Keep)
    setGlobalTile(gcx, gcy, 30, 0, worldMatrix, roomMatrix);
    setGlobalTile(gcx + 1, gcy, 31, 0, worldMatrix, roomMatrix);
    setGlobalTile(gcx, gcy + 1, 38, 0, worldMatrix, roomMatrix);
    setGlobalTile(gcx + 1, gcy + 1, 39, 0, worldMatrix, roomMatrix);

    // 5. CASTLE INTERIORS
    // Scatter a few "Barracks" (Houses) in the Outer and Inner Wards
    for (let i = 0; i < 8; i++) {
        // Outer Ward houses
        const ox = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 15) + 30);
        const oy = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 15) + 30);
        drawHouse(gcx + ox, gcy + oy, worldMatrix, roomMatrix);
    }
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



/**
 * Main function to turn a 1-100 map into a Tile-ID map
 */
// js/cellDecorator.js

export function populateWorld(worldMap) {
    nextHouseId = 1;
    const size = worldMap.length;

    // --- STEP 1: INITIALIZE EMPTY 4D MATRICES ---
    let worldMatrix = new Array(size);
    let roomMatrix = new Array(size);
    let fertilityMatrix = new Array(size); // 👈 New layer

    for (let k = 0; k < size; k++) {
        worldMatrix[k] = new Array(size);
        roomMatrix[k] = new Array(size);
        fertilityMatrix[k] = new Array(size); // 👈 New layer

        for (let l = 0; l < size; l++) {
            // World and Room use nested arrays
            worldMatrix[k][l] = Array.from({ length: 100 }, () => new Array(100).fill(17));
            roomMatrix[k][l] = Array.from({ length: 100 }, () => new Array(100).fill(0));
            
            // Fertility also using nested arrays for consistency with your lx/ly math
            fertilityMatrix[k][l] = Array.from({ length: 100 }, () => new Array(100).fill(0)); 
        }
    }

    // --- STEP 2: PASS 1 - FILL ALL TERRAIN FIRST ---
    for (let k = 0; k < size; k++) {
        for (let l = 0; l < size; l++) {
            if (worldMap[k][l] >= 67) {
                for (let ix = 0; ix < 100; ix++) {
                    for (let iy = 0; iy < 100; iy++) {
                        //worldMatrix[k][l][ix][iy] = (Math.random() > 0.2) ? 63 : 6;
                        worldMatrix[k][l][ix][iy] = 63;
                        // 5% chance to start with a plant sprout
            if (Math.random() > 0.95) {
                //createGrass((k * 100) + ix, (l * 100) + iy);
            }
                    }
                }
            }
        }
    }

    // --- STEP 3: PASS 2 - PLACE STRUCTURES ON TOP OF FINISHED TERRAIN ---
    for (let k = 0; k < size; k++) {
        for (let l = 0; l < size; l++) {
            if (worldMap[k][l] >= 67) {
                
                // js/cellDecorator.js -> populateWorld()
// Check every single tile in this 100x100 cell
            for (let ix = 0; ix < 100; ix++) {
                for (let iy = 0; iy < 100; iy++) {
                    
                    // 1 in 200 chance as requested
                    if (Math.floor(Math.random() * 20000) === 7) {
                        const gx = (k * 100) + ix;
                        const gy = (l * 100) + iy;
                        
                        // Spawn the house
                        //drawHouse(gx, gy, worldMatrix, roomMatrix);
                    }
                }
            }

                // Roll for Villages
                
                if (Math.floor(Math.random() * 12) === 7) {
                    console.log(`🏘️ Spawning village at Cell [${k}, ${l}]`);
                    //drawVillage((k * 100) + 50, (l * 100) + 50, worldMatrix, roomMatrix);
                }

                if (Math.floor(Math.random() * 12) === 3) {
                // Pick a random spot inside the 100x100 cell
                const rx = Math.floor(Math.random() * 80) + 10;
                const ry = Math.floor(Math.random() * 80) + 10;

                console.log(`🏘️ Spawning miningArea at Cell [${k}, ${l}, [${rx}, [${ry}]`);
                
                //drawMiningArea((k * 100) + rx, (l * 100) + ry, worldMatrix, roomMatrix, fertilityMatrix);
                }

                // Inside your cell-by-cell loop in populateWorld
if (Math.floor(Math.random() * 24) === 7) { // 1 in 100 cells is a Town Hub
    const tx = (k * 100) + 50;
    const ty = (l * 100) + 50;
    //drawTown(tx, ty, worldMatrix, roomMatrix, fertilityMatrix);
}

if (Math.floor(Math.random() * 24) === 7) { // 1 in 100 cells is a Town Hub
    const tx = (k * 100) + 50;
    const ty = (l * 100) + 50;
    //drawCastle(tx, ty, worldMatrix, roomMatrix, fertilityMatrix);
}
   
                    
            }
        }
    }

    // --- STEP 4: RETURN ALL THREE ---
    return { worldMatrix, roomMatrix, fertilityMatrix }; // 👈 Don't forget to return it!
}




