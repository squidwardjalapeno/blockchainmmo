// js/renderer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { CONFIG } from './config.js';
import { hero, getLevelInfo, gameState } from './entities.js';
import { plants, PLANT_DEFS } from './plants.js';
import { getBacteriaData, bacteriaCells, BACTERIA_TYPES } from './bacteria.js';
// js/renderer.js
import { animals } from './animals.js';
import { inputState, getUIButtons } from './input.js';
// Add this line near the top of src/renderer.js:
import { ITEM_TYPES } from './items.js';


// js/renderer.js
import { globalFishCount } from './fish.js'; // Ensure this is imported
import { getObjectAt } from './staticObjects.js';
// js/renderer.js
import { roomMetadata } from './cellDecorator.js';
import { PALADIN_SKILLS } from './uiManager.js';

import { getHeroAnimationData, getPetAnimationData, getAnimalAnimationData } from './animations.js'; // 👈 Added getAnimalAnimationData


// To this:
if (typeof window !== 'undefined') {
    logStep("renderer.js");
}



export const canvas = document.getElementById("myCanvas");
export const canvas2 = document.getElementById("myCanvas2");
export const canvas3 = document.getElementById("myCanvas3");

export const ctx = canvas.getContext("2d");
export const ctx2 = canvas2.getContext("2d");
export const ctx3 = canvas3.getContext("2d");


// ADD THIS LINE
const chunkCache = new Map(); // Our new cache for pre-rendered map chunks

// --- 🆕 THE PERFORMANCE BUFFER ---
const bgBuffer = document.createElement('canvas');
const bgCtx = bgBuffer.getContext('2d');
let lastHeroTX = -1;
let lastHeroTY = -1;
let lastHeroFloor = -1;


const DAGGER_HILT = { x: 5, y: 10 };

const HERO_SOCKETS = {
    // === SOUTH (Facing Camera) ===
    'walkSouth_0': { handX: 5, handY: 11, angle: 135, behind: false },
    'walkSouth_1': { handX: 7, handY: 12, angle: 135, behind: false },
    'walkSouth_2': { handX: 4, handY: 8, angle: 135, behind: false },
    'walkSouth_3': { handX: 4, handY: 9,  angle: 135 , behind: false },
    'lungeSouth':  { handX: 4, handY: 9, angle: 135, behind: false }, // 👈 NEW


    // === SOUTHEAST ===
    'walkSouthEast_0': { handX: 6, handY: 12, angle: 45, behind: false },
    'walkSouthEast_1': { handX: 6, handY: 11, angle: 45, behind: false },
    'walkSouthEast_2': { handX: 4, handY: 10, angle: 45, behind: false },
    'walkSouthEast_3': { handX: 4, handY: 10,  angle: 45, behind: false },
    'lungeSouthEast':  { handX: 1, handY: 10, angle: 45, behind: false }, // 👈 NEW


    // === EAST ===
    'walkEast_0': { handX: 7, handY: 11, angle: 45, behind: false },
    'walkEast_1': { handX: 10, handY: 10, angle: 45, behind: false },
    'walkEast_2': { handX: 7, handY: 10, angle: 45, behind: false },
    'walkEast_3': { handX: 7, handY: 10,  angle: 45, behind: false },
    'lungeEast':  { handX: 14, handY: 8, angle: 45, behind: true }, // 👈 NEW


    // === NORTHEAST ===
    'walkNorthEast_0': { handX: 11, handY: 11, angle: 0, behind: true},
    'walkNorthEast_1': { handX: 12, handY: 11, angle: 0, behind: true},
    'walkNorthEast_2': { handX: 9, handY: 11, angle: 0, behind: true},
    'walkNorthEast_3': { handX: 9, handY: 11,  angle: 0, behind: true},
    'lungeNorthEast':  { handX: 11, handY: 6,  angle: 0, behind: true }, // 👈 NEW


    // === NORTH ===
    'walkNorth_0': { handX: 11, handY: 9, angle: 315, behind: true},
    'walkNorth_1': { handX: 11, handY: 9, angle: 315, behind: true},
    'walkNorth_2': { handX: 11, handY: 10, angle: 315, behind: true},
    'walkNorth_3': { handX: 11, handY: 11,  angle: 315, behind: true},
    'lungeNorth':  { handX: 8, handY: 6, angle: 315, behind: true }, // 👈 NEW


    // === NORTHWEST ===
    'walkNorthWest_0': { handX: 7, handY: 7, angle: 270, behind: true},
    'walkNorthWest_1': { handX: 9, handY: 8, angle: 270, behind: true},
    'walkNorthWest_2': { handX: 12, handY: 9, angle: 270, behind: true},
    'walkNorthWest_3': { handX: 11, handY: 9,  angle: 270, behind: true},
    'lungeNorthWest':  { handX: 3, handY: 7, angle: 270, behind: true }, // 👈 NEW


    // === WEST ===
    'walkWest_0': { handX: 9, handY: 12, angle: 270, behind: true},
    'walkWest_1': { handX: 6, handY: 11, angle: 270, behind: true},
    'walkWest_2': { handX: 9, handY: 11, angle: 270, behind: true },
    'walkWest_3': { handX: 9, handY: 11,  angle: 270, behind: true },
    'lungeWest':  { handX: 1, handY: 8, angle: 270, behind: true }, // 👈 NEW


    // === SOUTHWEST ===
    'walkSouthWest_0': { handX: 4, handY: 10, angle: 225, behind: false },
    'walkSouthWest_1': { handX: 5, handY: 10, angle: 225, behind: false },
    'walkSouthWest_2': { handX: 6, handY: 10, angle: 225, behind: true },
    'walkSouthWest_3': { handX: 6, handY: 11,  angle: 225, behind: true },
    'lungeSouthWest':  { handX: 3, handY: 9,  angle: 225, behind: false }, // 👈 NEW

};



// js/renderer.js

// js/renderer.js

function getCellData(k, l, worldMatrix, roomMatrix) {
    const cx = Math.floor(k / 100); 
    const cy = Math.floor(l / 100);
    const lx = ((k % 100) + 100) % 100;
    const ly = ((l % 100) + 100) % 100;

    if (!worldMatrix[cx] || !worldMatrix[cx][cy]) return { tileID: undefined, roomID: 0 };

    // 1. Calculate the flat index for the 100x100 internal grid
    // Row (ly) * Width (100) + Column (lx)
    const cellIdx = (ly * 100) + lx;

    return {
        // 2. Access the data using that single index
        tileID: worldMatrix[cx][cy][cellIdx],
        roomID: roomMatrix[cx][cy][cellIdx] || 0
    };
}


// js/renderer.js

// js/renderer.js



// In renderer.js



// Replace initRenderer in src/renderer.js
export function initRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const zoom = CONFIG.ZOOM;

    [canvas, canvas2, canvas3].forEach(c => {
        c.width = Math.floor(w / zoom);
        c.height = Math.floor(h / zoom);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
    });

    viewport.screen = [Math.floor(w / zoom), Math.floor(h / zoom)];

    [ctx, ctx2, ctx3].forEach(c => {
        c.imageSmoothingEnabled = false;
        c.webkitImageSmoothingEnabled = false;
        c.mozImageSmoothingEnabled = false;
        c.getContextAttributes().alpha = false;
    });
}

// js/renderer.js
// js/renderer.js

// In src/renderer.js -> drawMap()
// Inside src/renderer.js

export function drawMap(worldMatrix, roomMatrix) {
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height);

    const w = canvas.width;
    const h = canvas.height;
    
    // 1. Fetch exact viewport boundaries calculated by viewport.js
    const startX = viewport.startTile[0];
    const endX = viewport.endTile[0];
    const startY = viewport.startTile[1];
    const endY = viewport.endTile[1];

    // Calculate current coordinates for house ID lookup
    const hTX = Math.floor((hero.x + 8) / 16);
    const hTY = Math.floor((hero.y + 8) / 16);

    let hHouseId = 0;
    const hChunkR = roomMatrix[Math.floor(hTX / 100)]?.[Math.floor(hTY / 100)];
    if (hChunkR) {
        hHouseId = hChunkR[((hTY % 100 + 100) % 100 * 100) + ((hTX % 100 + 100) % 100)];
    }

    const tileImg = images.worldTilesColor;

    // ==========================================
    // 🌍 OUTDOOR MODE (Cull Map Drawing to Viewport)
    // ==========================================
    if (hHouseId === 0 || hHouseId === 9999) {
        // Draw base green background
        ctx2.fillStyle = "rgb(0, 204, 0)";
        ctx2.fillRect(0, 0, w, h);

        for (let k = startX; k <= endX; k++) {
            const wCol = worldMatrix[Math.floor(k / 100)];
            const lx = ((k % 100) + 100) % 100;
            const sX = Math.floor((k * 16) + viewport.offset[0]);

            for (let l = startY; l <= endY; l++) {
                const wChunk = wCol?.[Math.floor(l / 100)];
                if (!wChunk) continue;

                const ly = ((l % 100) + 100) % 100;
                const tID = wChunk[(ly * 100) + lx];

                // Skip drawing plain grass tiles (covered by solid background fill)
                if (tID === 63) continue; 

                const sY = Math.floor((l * 16) + viewport.offset[1]);

                // Nesting Box Layer
                if (tID === 44) {
                    ctx2.drawImage(tileImg, (63 % 8) * 16, Math.floor(63 / 8) * 16, 16, 16, sX, sY, 16, 16);
                    const tImg = images.transparentTileset;
                    if (tImg && tImg.complete) {
                        ctx2.drawImage(tImg, (1 % 10) * 16, Math.floor(1 / 10) * 16, 16, 16, sX, sY, 16, 16);
                    }
                    continue; 
                }

                // Woods Tileset 2 (IDs 300 to 499)
                if (tID >= 300 && tID < 500) {
                    const woodsImg = images.woodsTileset2;
                    if (woodsImg && woodsImg.complete) {
                        const roadBorders = [302, 303, 304, 313, 315, 331, 335, 350, 351, 353, 354, 367];
                        if (roadBorders.includes(tID)) {
                            let isBeach = false;
                            let isStone = false;
                            
                            for (let ox = -1; ox <= 1; ox++) {
                                for (let oy = -1; oy <= 1; oy++) {
                                    const nCX = Math.floor((k + ox) / 100);
                                    const nCY = Math.floor((l + oy) / 100);
                                    if (worldMatrix[nCX]?.[nCY]) {
                                        const nLX = (((k + ox) % 100) + 100) % 100;
                                        const nLY = (((l + oy) % 100) + 100) % 100;
                                        const neighborID = worldMatrix[nCX][nCY][nLY * 100 + nLX];
                                        
                                        if (neighborID === 0 || neighborID === 10 || neighborID === 11 || neighborID === 17) {
                                            isBeach = true;
                                        } else if (neighborID === 208) {
                                            isStone = true;
                                        }
                                    }
                                }
                            }

                            if (isBeach) {
                                ctx2.drawImage(tileImg, 0, 0, 16, 16, sX, sY, 16, 16);
                            } else if (isStone) {
                                const roadImg = images.mainTileset2;
                                if (roadImg && roadImg.complete) {
                                    ctx2.drawImage(roadImg, (8 % 8) * 16, Math.floor(8 / 8) * 16, 16, 16, sX, sY, 16, 16);
                                }
                            } else {
                                const dirtIdx = 337 - 300; 
                                ctx2.drawImage(woodsImg, (dirtIdx % 12) * 16, Math.floor(dirtIdx / 12) * 16, 16, 16, sX, sY, 16, 16);
                            }
                        }

                        // Split-trunk rendering
                        if (tID === 406) {
                            const drawPiece = (localId, offsetX, offsetY) => {
                                const srcX = (localId % 12) * 16;
                                const srcY = Math.floor(localId / 12) * 16;
                                ctx2.drawImage(woodsImg, srcX, srcY, 16, 16, sX + offsetX, sY + offsetY, 16, 16);
                            };
                            drawPiece(106, 0, 0);
                            drawPiece(107, 16, 0);
                            continue;
                        }
                        if (tID === 407) continue;

                        const localIdx = tID - 300; 
                        const srcX = (localIdx % 12) * 16;
                        const srcY = Math.floor(localIdx / 12) * 16;
                        ctx2.drawImage(woodsImg, srcX, srcY, 16, 16, sX, sY, 16, 16);
                    }
                    continue;
                }
                
                // Directional Road Sheet (200 to 208)
                if (tID >= 200 && tID <= 208) {
                    const roadImg = images.mainTileset2;
                    if (roadImg && roadImg.complete) {
                        const localIdx = tID - 200;
                        const srcX = (localIdx % 8) * 16;
                        const srcY = Math.floor(localIdx / 8) * 16;
                        ctx2.drawImage(roadImg, srcX, srcY, 16, 16, sX, sY, 16, 16);
                    }
                } else {
                    // Standard Tiles (worldTilesColor - 8 tiles wide)
                    ctx2.drawImage(tileImg, (tID % 8) * 16, Math.floor(tID / 8) * 16, 16, 16, sX, sY, 16, 16);
                }
            }
        }
    } 
    // ==========================================
    // 🏠 INDOOR MODE (Cull Indoor Drawing to Viewport)
    // ==========================================
    else {
        ctx2.fillStyle = "#2d232e"; // Dark background boundary
        ctx2.fillRect(0, 0, w, h);

        for (let k = startX; k <= endX; k++) {
            const cx = Math.floor(k / 100);
            const lx = ((k % 100) + 100) % 100;
            const sX = Math.floor((k * 16) + viewport.offset[0]); 
            
            const wCol = worldMatrix[cx];
            const rCol = roomMatrix[cx];

            for (let l = startY; l <= endY; l++) {
                const cy = Math.floor(l / 100);
                const wChunk = wCol?.[cy];
                if (!wChunk) continue;

                const ly = ((l % 100) + 100) % 100;
                const idx = (ly * 100) + lx;
                const rID = rCol?.[cy]?.[idx] || 0;

                if (rID === hHouseId) {
                    const sY = Math.floor((l * 16) + viewport.offset[1]); 
                    const meta = roomMetadata[rID];
                    let base = 42; // Standard interior floor

                    // Barn Layout rules
                    if (meta && meta.type === 'LARGE_BARN') {
                        const ox = k - meta.frontX; 
                        const oy = l - meta.frontY;
                        if (hero.floor === 1) { 
                            if (oy <= -6) base = 27; else if (oy === -5) base = 41; 
                        } else { 
                            if ((ox !== 2 && ox !== 3) || oy === 0 || oy === -1) base = 27; else if (oy === -7) base = 41; 
                        }
                    } 
                    // Multilevel stairs rules
                    else if (meta && meta.type === 'TWO_STORY') {
                        const oy = l - meta.frontY;
                        if (hero.floor === 1) { 
                            if (oy === meta.maxOffset) base = 27; else if (oy === meta.maxOffset + 1) base = 41; 
                        } else { 
                            if (oy === 0) base = 27; else if (oy === meta.maxOffset) base = 41; 
                        }
                    } 
                    else {
                        if (ly > 0 && rCol[cy][idx - 100] !== rID) base = 41; 
                    }
                    
                    // Draw base interior floor/wall tile
                    ctx2.drawImage(tileImg, (base % 8) * 16, Math.floor(base / 8) * 16, 16, 16, sX, sY, 16, 16);

                    // Place static object overlays
                    const obj = getObjectAt(k, l);
                    if (obj) {
                        const transMap = {
                            'CHEST_STORAGE': 2, 'HAY_TABLE': 3, 'HAY_STORAGE': 4,
                            'STORE_COUNTER': 5, 'TEMPLE_ALTAR': 6, 'STAIRS_TOGGLE': 7,
                            'KITCHEN': 8, 'MAP_TABLE': 9, 'ARMORY': 10,
                            'MILITARY_STORAGE': 10, 'FOOD_STORAGE': 11
                        };
                        const oldMap = { 'SMELTER': 53, 'BEDROLL': 61, 'INT_WALL': 41, 'ANVIL': 54 }; 

                        if (transMap[obj.type] !== undefined) {
                            const tImg = images.transparentTileset;
                            const tid = transMap[obj.type];
                            if (tImg && tImg.complete) {
                                ctx2.drawImage(tImg, (tid % 10) * 16, Math.floor(tid / 10) * 16, 16, 16, sX, sY, 16, 16);
                            }
                        } else if (oldMap[obj.type] !== undefined) {
                            const oid = oldMap[obj.type];
                            ctx2.drawImage(tileImg, (oid % 8) * 16, Math.floor(oid / 8) * 16, 16, 16, sX, sY, 16, 16);
                        }
                        else if (obj.type === 'CRAFTING_TABLE') {
                            const kImg = images.keyTileset;
                            if (kImg && kImg.complete) {
                                ctx2.drawImage(kImg, (100 % 16) * 16, Math.floor(100 / 16) * 16, 16, 16, sX, sY, 16, 16);
                            }
                        }
                    }
                }
            }
        }
    }
}

export function drawPlants(roomMatrix) {
    // 1. Check if the hero is currently inside a building
    const hTX = Math.floor((hero.x + 8) / 16);
    const hTY = Math.floor((hero.y + 14) / 16);
    const rCol = roomMatrix[Math.floor(hTX / 100)]?.[Math.floor(hTY / 100)];
    const heroHouseId = rCol ? rCol[((hTY % 100 + 100) % 100 * 100) + ((hTX % 100 + 100) % 100)] : 0;

    if (heroHouseId !== 0 && heroHouseId !== 9999) return;

    plants.forEach((plant) => {
        const screenX = Math.floor(viewport.offset[0] + (plant.gx * 16));
        const screenY = Math.floor(viewport.offset[1] + (plant.gy * 16));

        if (screenX < -16 || screenX > window.innerWidth || screenY < -16 || screenY > window.innerHeight) return;

        const def = PLANT_DEFS[plant.type];
        
        // 👇 DYNAMIC TILESET LOOKUP
        const tilesetName = def.tileset || 'cropTileset';
        const img = images[tilesetName];
        if (!img || !img.complete) return;

        const stagesArray = def.stages;
        const maxStage = stagesArray.length - 1;
        const stageIdx = Math.min(maxStage, Math.floor(plant.growth / (100 / stagesArray.length)));
        const plantSpriteID = stagesArray[stageIdx];

        ctx2.drawImage(
            img,
            (plantSpriteID % CONFIG.CROP_SHEET_WIDTH_TILES) * 16, 
            Math.floor(plantSpriteID / CONFIG.CROP_SHEET_WIDTH_TILES) * 16, 
            16, 16,
            screenX, screenY,
            16, 16
        );
    });
}

// Add this smart cache helper right above drawDroppedItems:
const renderCache = {};

function getRenderData(typeID) {
    if (renderCache[typeID]) return renderCache[typeID];

    // 1. Find the seedType string associated with this ID
    const seedTypeStr = Object.keys(BACTERIA_TYPES).find(key => 
        BACTERIA_TYPES[key] === typeID && !['organic_drop', 'organic_plant', 'grass'].includes(key)
    );

    if (seedTypeStr) {
        // 2. Find the matching template in items.js
        const template = Object.values(ITEM_TYPES).find(t => t.seedType === seedTypeStr);
        if (template) {
            const tilesetStr = template.tileset || "cropTileset";
            const img = images[tilesetStr];
            
            let w = CONFIG.CROP_SHEET_WIDTH_TILES;
            if (tilesetStr === "gardenTileset") w = CONFIG.GARDEN_SHEET_WIDTH_TILES;
            else if (tilesetStr === "worldTilesColor") w = 8;
            else if (tilesetStr === "transparentTileset") w = 10; // 👈 ADD THIS LINE
            else if (tilesetStr === "foodTileset") w = 10; // 👈 ADD THIS LINE
            // 👇 ADD THESE TWO LINES
            else if (tilesetStr === "keyTileset") w = 16;
            else if (tilesetStr === "weaponTileset") w = 16;


            
            renderCache[typeID] = { 
                spriteID: template.spriteID, 
                img, 
                sheetWidth: w, 
                drawSize: template.drawSize || 16 // 👈 Cache the size
            };
            return renderCache[typeID];
        }
    }
    return null;
}

export function drawDroppedItems() {
    const cropImg = images.cropTileset;
    const worldImg = images.worldTilesColor;
    if (!cropImg || !worldImg) return;

    // 1. Get screen dimensions
    const w = canvas.width;
    const h = canvas.height;
    
    // 2. Calculate the exact bounds of the camera in World Pixels
    const cameraLeft = hero.x + 8 - (w / 2);
    const cameraRight = hero.x + 8 + (w / 2);
    const cameraTop = hero.y + 8 - (h / 2);
    const cameraBottom = hero.y + 8 + (h / 2);

    // 3. Convert those pixel bounds into Tile Coordinates (adding a 1-tile buffer)
    const startTX = Math.floor(cameraLeft / 16) - 1;
    const endTX = Math.floor(cameraRight / 16) + 1;
    const startTY = Math.floor(cameraTop / 16) - 1;
    const endTY = Math.floor(cameraBottom / 16) + 1;

    // 4. ONLY loop over the exact grid of tiles currently visible on the monitor
    for (let ty = startTY; ty <= endTY; ty++) {
        for (let tx = startTX; tx <= endTX; tx++) {
            
            // Figure out which chunk this specific tile belongs to
            const cx = Math.floor(tx / 100);
            const cy = Math.floor(ty / 100);
            
            // We must import bacteriaCells at the top of renderer.js if you haven't!
            const cellKey = `${cx}_${cy}`;
            const data = bacteriaCells.get(cellKey);
            
            // If the chunk doesn't exist or has no dropped items, skip it!
            if (!data) continue; 

            // Find the local index inside that chunk's 10,000 array
            const lx = ((tx % 100) + 100) % 100;
            const ly = ((ty % 100) + 100) % 100;
            const idx = (ly * 100) + lx;
            
            const traits = data[idx];
            if (traits === 0) continue; // Nothing on the ground here

            const hTraits = traits & 0xFF; // Used for Health (or Count, for Eggs)
            const v = (traits >> 8) & 0xFF;
            const typeID = (traits >> 20) & 0xFF;

            if (typeID === 2 || typeID === 0) continue; // Skip plants and empty space

            const screenX = Math.floor(viewport.offset[0] + (tx * 16));
            const screenY = Math.floor(viewport.offset[1] + (ty * 16));

            let spriteID = 0;
            let imgToUse = null;
            let sheetWidth = 8;
            let drawSize = 16;

            // Is this ANY type of fish?
            const isFish = typeID === 1 || (typeID >= 40 && typeID <= 48);

            // If the fish is dead (h=0), draw the rotting/bones sprite from cropTileset
            if (isFish && hTraits <= 0) {
                imgToUse = images.cropTileset;
                sheetWidth = CONFIG.CROP_SHEET_WIDTH_TILES;
                spriteID = (v > 10) ? 58 : 59; 
                drawSize = 16;
            } 
            else {
                // Otherwise use the smart lookup for all items
                const rData = getRenderData(typeID);
                if (!rData || !rData.img || !rData.img.complete) continue; 
                
                imgToUse = rData.img;
                spriteID = rData.spriteID;
                sheetWidth = rData.sheetWidth;
                drawSize = rData.drawSize || 16;
            }

            // Calculate the offset to keep smaller items (4x4, 8x8) centered inside the 16x16 tile
            const offset = Math.floor((16 - drawSize) / 2);

            // 🥚 VISUAL EGG CLUTCH LOGIC
            if (typeID === 16) { 
                const eggCount = Math.min(8, hTraits); // Limit visual eggs to 8
                for (let i = 0; i < eggCount; i++) {
                    // Draw a cute little grid of 4x4 eggs scattered on the tile
                    const ex = (i % 3) * 4;
                    const ey = Math.floor(i / 3) * 4;
                    ctx2.drawImage(
                        imgToUse, 
                        (spriteID % sheetWidth) * 16, Math.floor(spriteID / sheetWidth) * 16, 
                        16, 16, 
                        screenX + 2 + ex, screenY + 2 + ey, 
                        4, 4 // Draw eggs as 4x4
                    );
                }
            } 
            // STANDARD DROPPED ITEM LOGIC
            else {
                ctx2.drawImage(
                    imgToUse, 
                    (spriteID % sheetWidth) * 16, Math.floor(spriteID / sheetWidth) * 16, 
                    16, 16, 
                    screenX + offset, screenY + offset, // Apply centering offset
                    drawSize, drawSize                  // Apply custom scaled size
                );
            }
        }
    }
}




function getHouseStart(gx, gy, houseId, roomMatrix) {
    let startX = gx;
    for (let i = 0; i < 5; i++) {
        const nextX = startX - 1;
        const cx = Math.floor(nextX / 100), cy = Math.floor(gy / 100);
        const lx = ((nextX % 100) + 100) % 100, ly = ((gy % 100) + 100) % 100;
        
        // THE FIX: Use the flat index math
        const cellIdx = (ly * 100) + lx; 
        
        if (roomMatrix[cx]?.[cy]?.[cellIdx] === houseId) {
            startX = nextX;
        } else {
            break;
        }
    }
    return startX;
}

// Helper to find the southern boundary of a house
function getHouseBottom(gx, gy, houseId, roomMatrix) {
    let bottomY = gy;
    // Scan down a few tiles to find where this roomID ends
    for (let i = 0; i < 10; i++) {
        const next = getCellData(gx, bottomY + 1, worldMatrix, roomMatrix);
        if (next.roomID === houseId) bottomY++;
        else break;
    }
    return bottomY;
}


// js/renderer.js

// js/renderer.js
// js/renderer.js

// --- Replace drawHero() in src/renderer.js ---

// In src/renderer.js -> drawHero()
export function drawHero() {
    const animData = getHeroAnimationData(hero, images);

    if (animData.img && animData.img.complete) {

        // 👇 THE FIX: Add these two lines back so the bobber and weapon know where the center of the screen is!
        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);

        // 👇 THE FIX: Add these two lines back!
        const hX = Math.floor(hero.x + 8);
        const hY = Math.floor(hero.y + 8);
        
        const scale = (hero.buffs && hero.buffs.isAscended) ? 1.12 : 1.0;
        const destW = 16 * scale; 
        const destH = 16 * scale; 

        // 👇 THE UNIFIED MATH: (Pos + Offset) floored together
        let drawX = Math.floor(hero.x + viewport.offset[0]) - Math.floor((destW - 16) / 2);
        let drawY = Math.floor(hero.y + viewport.offset[1]) - Math.floor((destH - 16) / 2);

        // 1. STATE CHECKS
        // The attack timer is set to -1.7 when an attack lands. It counts UP to 0.
        // So the first 0.2 seconds of the cooldown is between -1.7 and -1.5!
        const isImpact = (hero.attackTimer < 0 && hero.attackTimer < -1.5);
        const isWindingUp = hero.isWindingUp;

        // --- ⚔️ PVP SHAKE & LUNGE ---
        if (isWindingUp) {
            drawX += (Math.random() * 2 - 1);
            drawY += (Math.random() * 2 - 1);
        } else if (isImpact) {
            const lunge = 4;
            if (hero.dir.includes('North')) drawY -= lunge;
            if (hero.dir.includes('South')) drawY += lunge;
            if (hero.dir.includes('West'))  drawX -= lunge;
            if (hero.dir.includes('East'))  drawX += lunge;
        }

        // --- 🎣 FISHING ---
        // (Keep your existing fishing logic here)
        if (hero.isFishing && !isWindingUp) {
            ctx2.strokeStyle = "#4B2C20"; 
            ctx2.lineWidth = 2;
            const startX = drawX + 8;
            const startY = drawY + 8;
            let rodEX = startX, rodEY = startY;
            const rodLen = 12;
            if (hero.dir.includes('North')) rodEY -= rodLen;
            if (hero.dir.includes('South')) rodEY += rodLen;
            if (hero.dir.includes('West'))  rodEX -= rodLen;
            if (hero.dir.includes('East'))  rodEX += rodLen;
            ctx2.beginPath(); ctx2.moveTo(startX, startY); ctx2.lineTo(rodEX, rodEY); ctx2.stroke();
            const bobberSX = centerX + (hero.bobberX - hX);
            const bobberSY = centerY + (hero.bobberY - hY);
            ctx2.strokeStyle = "#FFFFFF"; ctx2.lineWidth = 0.5;
            ctx2.beginPath(); ctx2.moveTo(rodEX, rodEY); ctx2.lineTo(bobberSX, bobberSY); ctx2.stroke();
        }

        // --- 🛡️ DRAW DIVINE BUBBLE ---
        if (hero.buffs && hero.buffs.divineBubble) {
            ctx2.strokeStyle = "rgba(255, 215, 0, 0.8)"; // Bright Gold
            ctx2.fillStyle = "rgba(255, 215, 0, 0.2)";   // Transparent Gold
            ctx2.lineWidth = 2;
            
            ctx2.beginPath();
            // Draw a circle surrounding the 16x16 hero
            ctx2.arc(drawX + 8, drawY + 8, 14, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
        }

        // --- 🛡️ DRAW DIVINE BUBBLE ---
        if (hero.buffs && hero.buffs.divineBubble) {
            // ... your existing bubble code ...
        }

        // --- 👼 DRAW HEAVEN'S HALO ---
        if (hero.buffs && hero.buffs.isInvincible) {
            // 1. Full Body Glow (Super Star effect)
            ctx2.shadowColor = "rgba(255, 255, 255, 0.9)";
            ctx2.shadowBlur = 15;

            // 2. The Floating Halo
            const haloY = drawY - 6 + (Math.sin(Date.now() / 150) * 2); // Bobs up and down
            
            ctx2.strokeStyle = "rgba(255, 215, 0, 1.0)"; // Solid Gold
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            // Draw a squished ellipse to look like a halo in 2.5D space
            ctx2.ellipse(drawX + 8, haloY, 6, 2, 0, 0, Math.PI * 2);
            ctx2.stroke();
            
            // Add a white inner core to the halo
            ctx2.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx2.lineWidth = 1;
            ctx2.beginPath();
            ctx2.ellipse(drawX + 8, haloY, 5, 1, 0, 0, Math.PI * 2);
            ctx2.stroke();

            // Turn off shadow for the rest of the rendering
            ctx2.shadowBlur = 0; 
        }

        // --- 🛡️ DRAW FLEETING BULWARK ---
        if (hero.bulwarkTimer > 0) {
            ctx2.strokeStyle = "rgba(100, 200, 255, 0.8)"; // Magic Shield Blue
            ctx2.lineWidth = 2;
            
            // Draw 3 spinning arcs around the hero's feet
            const angleOffset = Date.now() / 200; 
            
            for (let i = 0; i < 3; i++) {
                ctx2.beginPath();
                // 14px radius, spread evenly at 120 degrees (2.09 radians)
                ctx2.arc(drawX + 8, drawY + 12, 14, angleOffset + (i * 2.09), angleOffset + (i * 2.09) + 1.0);
                ctx2.stroke();
            }
        }

        // --- 🤖 DRAW LOCAL ZENITH GUARDIAN ---
        if (hero.pet && hero.pet.active) {
            const petScreenX = (centerX + (hero.pet.x - hX)) | 0;
            const petScreenY = (centerY + (hero.pet.y - hY)) | 0; 
            
            const petAnim = getPetAnimationData(hero.pet, images);

            if (petAnim.img && petAnim.img.complete) {
                // 🌟 Draw the massive 24x24 Guardian
                // Offset by -12 to center the 24x24 sprite on the coordinates
                ctx2.drawImage(
                    petAnim.img,
                    petAnim.srcX, petAnim.srcY, petAnim.srcW, petAnim.srcH,
                    petScreenX - 12, petScreenY - 12, 24, 24
                );
            }

            // Draw a tiny health bar above it
            const petHpPct = hero.pet.hp / (hero.maxHp * 1.8);
            ctx2.fillStyle = "black";
            ctx2.fillRect(petScreenX - 12, petScreenY - 16, 24, 2);
            ctx2.fillStyle = "lime";
            ctx2.fillRect(petScreenX - 12, petScreenY - 16, 24 * Math.max(0, petHpPct), 2);
        }

        // ==========================================
        // 🗡️ WEAPON PAPERDOLL & VFX
        // ==========================================
        const wpn = hero.equipment ? hero.equipment.mainHand : null;
        
        let isWeaponBehind = false;
        let socket = null;

        if (wpn) {
            // 👇 THE FIX: Choose the Lunge socket if we are attacking!
            let socketKey = `walk${hero.dir}_${hero.frame}`;
            if (isImpact) {
                socketKey = `lunge${hero.dir}`;
            }
            
            socket = HERO_SOCKETS[socketKey] || HERO_SOCKETS[`walk${hero.dir}_0`];
            
            if (socket) {
                isWeaponBehind = socket.behind;
            }
        }

        // C. Draw Item in Hand
        const drawWeapon = () => {
            if (!wpn || !socket) return;
            
            // 1. Smart Tileset Resolution
            const tilesetStr = wpn.tileset || "cropTileset";
            const wImg = images[tilesetStr];
            if (!wImg || !wImg.complete) return;
            
            // 2. Smart Sheet Width Resolution
            let sheetWidth = 16; 
            if (tilesetStr === "cropTileset" || tilesetStr === "cropTileset2") sheetWidth = CONFIG.CROP_SHEET_WIDTH_TILES || 12;
            else if (tilesetStr === "worldTilesColor") sheetWidth = 8;
            else if (tilesetStr === "transparentTileset" || tilesetStr === "foodTileset") sheetWidth = 10;
            else if (tilesetStr === "gardenTileset") sheetWidth = CONFIG.GARDEN_SHEET_WIDTH_TILES || 16;
            
            ctx2.save();
            
            // 3. Move canvas origin to the exact pixel of the hand
            let finalHandX = drawX + socket.handX;
            let finalHandY = drawY + socket.handY;

            ctx2.translate(finalHandX, finalHandY);
            
            // 4. Rotate to the exact angle defined by the socket
            ctx2.rotate(socket.angle * Math.PI / 180);

            // 5. 📏 DYNAMIC SCALING based on drawSize property!
            const drawSize = wpn.drawSize || 16;  // Default to full 16x16 size if undefined
            const scale = drawSize / 16.0;        // 8 -> 0.50, 4 -> 0.25, 16 -> 1.0
            ctx2.scale(scale, scale);

            // Only add the glowing weapon VFX if it's actually a weapon
            if (hero.buffs && hero.buffs.fluxShotEmpowered && wpn.isWeapon) {
                ctx2.shadowColor = "rgba(0, 255, 255, 0.8)";
                ctx2.shadowBlur = 8;
            }
            
            // 6. Dynamic Hilt Pivot
            // Uses the custom hilt from items.js, or falls back to the center (8, 8)
            const hiltX = wpn.hilt ? wpn.hilt.x : (wpn.isWeapon ? 5 : 8);
            const hiltY = wpn.hilt ? wpn.hilt.y : (wpn.isWeapon ? 10 : 8);

            // 7. Draw the item
            ctx2.drawImage(
                wImg,
                (wpn.spriteID % sheetWidth) * 16, Math.floor(wpn.spriteID / sheetWidth) * 16, 
                16, 16,
                -hiltX, -hiltY, 
                16, 16
            );
            ctx2.restore();
        };

        // D. Draw Weapon BEHIND hero
        if (isWeaponBehind) drawWeapon();
        
        // E. Draw Hero
        ctx2.drawImage(
            animData.img, animData.srcX, animData.srcY, animData.srcW, animData.srcH,
            drawX, drawY, 16, 16
        );

        // F. Draw Weapon IN FRONT of hero
        if (!isWeaponBehind) drawWeapon();

        // G. Draw "Swoosh" VFX on Impact
        if (isImpact) {
            ctx2.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            
            const swooshX = drawX + 8;
            const swooshY = drawY + 8;
            const r = 10; 

            if (hero.dir.includes('North')) ctx2.arc(swooshX, swooshY - 6, r, Math.PI, 0);
            if (hero.dir.includes('South')) ctx2.arc(swooshX, swooshY + 6, r, 0, Math.PI);
            if (hero.dir.includes('East'))  ctx2.arc(swooshX + 6, swooshY, r, -Math.PI/2, Math.PI/2);
            if (hero.dir.includes('West'))  ctx2.arc(swooshX - 6, swooshY, r, Math.PI/2, -Math.PI/2);
            
            ctx2.stroke();
        }
    }
}

// Paste at the bottom of src/renderer.js

// In src/renderer.js -> drawRemotePlayers()
export function drawRemotePlayers(ctx2, remotePlayersData) {
    remotePlayersData.forEach(p => {
        // 👇 THE UNIFIED MATH
        let sx = Math.floor(p.x + viewport.offset[0]);
        let sy = Math.floor(p.y + viewport.offset[1]);

        if (sx < -32 || sx > canvas2.width + 32 || sy < -32 || sy > canvas2.height + 32) return;
        
        // ... (Keep the rest the same)
        
        if (p.isOffline) ctx2.globalAlpha = 0.5; 
        
        const imgKey = `heroWalk${p.dir || 'South'}`;
        const img = images[imgKey] || images.heroWalkSouth;
        
        if (!img || !img.complete) return;

        // ==========================================
        // 1. VISUAL EFFECTS (Behind Hero)
        // ==========================================
        if (p.bulwarkTimer && p.bulwarkTimer > 0) {
            ctx2.strokeStyle = "rgba(100, 200, 255, 0.8)"; 
            ctx2.lineWidth = 2;
            const angleOffset = Date.now() / 200; 
            for (let i = 0; i < 3; i++) {
                ctx2.beginPath();
                ctx2.arc(sx + 8, sy + 12, 14, angleOffset + (i * 2.09), angleOffset + (i * 2.09) + 1.0);
                ctx2.stroke();
            }
        }

        if (p.ccFlags && !p.ccFlags.canMove && !p.ccFlags.canCastNonMovement) {
            ctx2.strokeStyle = "rgba(0, 255, 255, 0.8)"; 
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.ellipse(sx + 8, sy + 14, 8, 4, 0, 0, Math.PI * 2);
            ctx2.stroke();
        }

        if (p.isInvincible) {
            ctx2.shadowColor = "rgba(255, 255, 255, 0.9)";
            ctx2.shadowBlur = 15;
            const haloY = sy - 6 + (Math.sin(Date.now() / 150) * 2); 
            
            ctx2.strokeStyle = "rgba(255, 215, 0, 1.0)"; 
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.ellipse(sx + 8, haloY, 6, 2, 0, 0, Math.PI * 2);
            ctx2.stroke();
            
            ctx2.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx2.lineWidth = 1;
            ctx2.beginPath();
            ctx2.ellipse(sx + 8, haloY, 5, 1, 0, 0, Math.PI * 2);
            ctx2.stroke();
        }

        // ==========================================
        // 2. DRAW HERO SPRITE
        // ==========================================
        ctx2.drawImage(img, (p.animFrame || 0) * 16, 0, 16, 16, sx, sy, 16, 16);
        ctx2.shadowBlur = 0;
        ctx2.globalAlpha = 1.0; 

        // ==========================================
        // 3. VISUAL EFFECTS (In Front of Hero)
        // ==========================================
        if (p.cc && p.cc.hasResonance) {
            ctx2.fillStyle = "#FF1493"; 
            ctx2.beginPath();
            ctx2.moveTo(sx + 8, sy - 14);
            ctx2.lineTo(sx + 10, sy - 12);
            ctx2.lineTo(sx + 8, sy - 10);
            ctx2.lineTo(sx + 6, sy - 12);
            ctx2.fill();
        }

        // ==========================================
        // 4. UI: NAMEPLATE & HEALTH BARS
        // ==========================================
        ctx2.fillStyle = p.isOffline ? "#888888" : "white"; 
        ctx2.font = "8px Arial";
        ctx2.textAlign = "center";
        const displayName = p.isOffline ? "SLEEPING" : p.id.substring(0, 4);
        ctx2.fillText(displayName, sx + 8, sy - 8); 
        
        const barW = 16, barH = 2;
        ctx2.fillStyle = "black";
        ctx2.fillRect(sx, sy - 4, barW, barH);
        
        if (p.shield && p.shield > 0) {
            ctx2.fillStyle = "rgba(100, 150, 255, 0.8)"; 
            const shieldRatio = Math.min(1.0, p.shield / (p.maxHp || 100)); 
            ctx2.fillRect(sx, sy - 2, barW * shieldRatio, barH);
        }

        ctx2.fillStyle = "#FF0000"; 
        ctx2.fillRect(sx, sy - 4, barW * (p.hp / (p.maxHp || 100)), barH);

        // ==========================================
        // 5. 🤖 DRAW REMOTE ZENITH GUARDIANS
        // ==========================================
        if (p.pet && p.pet.active) {
            const petSx = Math.floor(centerX + (p.pet.x - camX));
            const petSy = Math.floor(centerY + (p.pet.y - camY));
            const petAnim = getPetAnimationData(p.pet, images);

            if (petAnim.img && petAnim.img.complete) {
                ctx2.drawImage(
                    petAnim.img, petAnim.srcX, petAnim.srcY, petAnim.srcW, petAnim.srcH,
                    petSx - 12, petSy - 12, 24, 24
                );
            }

            const petHpPct = p.pet.hp / (p.maxHp * 1.8);
            ctx2.fillStyle = "black";
            ctx2.fillRect(petSx - 12, petSy - 16, 24, 2);
            ctx2.fillStyle = "lime";
            ctx2.fillRect(petSx - 12, petSy - 16, 24 * Math.max(0, petHpPct), 2);
        }
    });
}



export function drawAnimals() {
    const w = canvas.width | 0;
    const h = canvas.height | 0;
    const centerX = (w >> 1) | 0;
    const centerY = (h >> 1) | 0;
    const hX = (hero.x + 8) | 0;
    const hY = (hero.y + 8) | 0;

    animals.forEach(chicken => {
        // 👇 THE UNIFIED MATH
        const screenX = Math.floor(chicken.x + viewport.offset[0]);
        const screenY = Math.floor(chicken.y + viewport.offset[1]);
        
        // Cull if way off screen
        if (screenX < -32 || screenX > w + 32 || screenY < -32 || screenY > h + 32) return;

        const animData = getAnimalAnimationData(chicken, images);

        if (animData.img && animData.img.complete) {
            // Draw the chicken (Offset by -8 so it's centered on the coordinate)
            ctx2.drawImage(
                animData.img,
                animData.srcX, animData.srcY, animData.srcW, animData.srcH,
                screenX, screenY, 16, 16
            );
        }

        // Optional: Draw a tiny hunger bar so you can see when they are about to graze!
        const hungerPct = (100 - chicken.hunger) / 100;
        ctx2.fillStyle = "black";
        ctx2.fillRect(screenX + 2, screenY - 4, 12, 2);
        ctx2.fillStyle = "orange";
        ctx2.fillRect(screenX + 2, screenY - 4, 12 * Math.max(0, hungerPct), 2);
    });
}


// Inside js/renderer.js

// Inside renderer.js
// js/renderer.js

export function drawBobber() {
    if (!hero.isFishing) return;

    const img = images.feather;
    if (img && img.complete) {
        const bob = Math.sin(Date.now() / 200) * 2;
        const shake = hero.hasBite ? (Math.random() * 4 - 2) : 0;

        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);

        const screenX = centerX + (hero.bobberX - (hero.x + 8));
        const screenY = centerY + (hero.bobberY - (hero.y + 14));

        ctx2.drawImage(
            img, 
            0, 0, img.width, img.height, 
            Math.floor(screenX + shake - 4), // 👈 Centered for 8px (-4)
            Math.floor(screenY + bob - 4),   // 👈 Centered for 8px (-4)
            8, 8                             // 👈 New Size: 8x8
        );
    }
}

export const mapCanvas = document.createElement('canvas');
const MAP_SCALE = 1; // 👈 Reverted to 1 pixel per chunk
mapCanvas.width = CONFIG.MAP_SIZE * MAP_SCALE;  // 900x900
mapCanvas.height = CONFIG.MAP_SIZE * MAP_SCALE;
let mapCtx = mapCanvas.getContext('2d');

export function preRenderMinimap(worldMap) {
    const size = CONFIG.MAP_SIZE;
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height); 
    
    // --- PASS 1: DRAW BASE MAP ---
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const val = worldMap[y * size + x];
        
            if (val === 103) mapCtx.fillStyle = "#1b0218"; // Castle
            else if (val === 102) mapCtx.fillStyle = "#a32192"; // Town
            else if (val === 101) mapCtx.fillStyle = "#e74c3c"; // Village
            else if (val === 106) mapCtx.fillStyle = "#723d01"; // 🏔️ MOUNTAIN (Snowy Ice White)
            else if (val === 105) mapCtx.fillStyle = "#f1c40f"; // 🏜️ DESERT (Sandy Yellow)
            else if (val === 104 || val === 12) mapCtx.fillStyle = "#1e6b30"; // 🌲 FORESTS (Dark Green)
            else if (val >= CONFIG.LAND_THRESHOLD) mapCtx.fillStyle = "#2ecc71"; // Grass
            else if (val === 11) mapCtx.fillStyle = "#00FFFF"; // LAKES (Cyan)
            else mapCtx.fillStyle = "#3498db"; // OCEAN

            mapCtx.fillRect(x, y, 1, 1);
        }
    }

    // --- PASS 2: DRAW RIVER LINES ---
    // ... (keep the rest of the file untouched)

    // --- PASS 2: DRAW RIVER LINES ---
    // ... (keep the rest of the file untouched)

    // --- PASS 2: DRAW RIVER LINES ---
    if (window.geography && window.geography.lakes && window.geography.lakes.length >= 2) {
        const lakes = window.geography.lakes;
        const lakeCenters = [];

        for (let i = 0; i < lakes.length; i++) {
            let sumX = 0, sumY = 0;
            for (let idx of lakes[i]) {
                sumX += idx % size;
                sumY += Math.floor(idx / size);
            }
            lakeCenters.push({
                x: Math.floor(sumX / lakes[i].length),
                y: Math.floor(sumY / lakes[i].length)
            });
        }

        mapCtx.strokeStyle = "rgba(255, 255, 255, 0.9)"; // White
        mapCtx.lineWidth = 1; // 1 pixel wide

        for (let i = 0; i < lakeCenters.length; i++) {
            const lakeA = lakeCenters[i];
            let closestLake = null;
            let shortestDist = Infinity;

            for (let j = 0; j < lakeCenters.length; j++) {
                if (i === j) continue;
                const dist = Math.abs(lakeA.x - lakeCenters[j].x) + Math.abs(lakeA.y - lakeCenters[j].y);
                if (dist < shortestDist) {
                    shortestDist = dist;
                    closestLake = lakeCenters[j];
                }
            }

            if (closestLake) {
                mapCtx.beginPath();
                // Draw from the exact center of the 1x1 block
                const cx1 = (lakeA.x * MAP_SCALE) + (MAP_SCALE / 2);
                const cy1 = (lakeA.y * MAP_SCALE) + (MAP_SCALE / 2);
                const cx2 = (closestLake.x * MAP_SCALE) + (MAP_SCALE / 2);
                const cy2 = (closestLake.y * MAP_SCALE) + (MAP_SCALE / 2);
                
                mapCtx.moveTo(cx1, cy1);
                mapCtx.lineTo(cx2, cy2);
                mapCtx.stroke();
            }
        }
    }

    console.log("🗺️ Global Minimap baked to buffer!");
}




// js/renderer.js

export function drawHealthBar(ctx, entity, color = "#00FF00") {
    const barW = 16;
    const barH = 2;
    
    // Support both Hero (hp/maxHp) and Animals (hunger/100)
    let percent = 0;
    if (entity.hp !== undefined) {
        percent = entity.hp / (entity.maxHp || 100);
    } else if (entity.hunger !== undefined) {
        percent = (100 - entity.hunger) / 100;
    }

    const screenX = viewport.offset[0] + entity.x + 8 - (barW / 2);
    const screenY = viewport.offset[1] + entity.y - 4; // 👈 Changed from -14 to -4

    // Background
    ctx.fillStyle = "black";
    ctx.fillRect(screenX, screenY, barW, barH);
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, barW * Math.max(0, percent), barH);
}

export function drawEnergyBar(ctx, entity, color = "#FFD700") {
    if (entity.energy === undefined) return; // Ignore entities without stamina

    const barW = 16;
    const barH = 2;
    const percent = entity.energy / (entity.maxEnergy || 100);

    const screenX = viewport.offset[0] + entity.x + 8 - (barW / 2);
    const screenY = viewport.offset[1] + entity.y - 1; // 👈 Changed from -11 to -1

    // Background
    ctx.fillStyle = "black";
    ctx.fillRect(screenX, screenY, barW, barH);
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, barW * Math.max(0, percent), barH);
}

export function drawTargetCircle(ctx, target) {
    if (!target || target.hp <= 0) return; 

    const screenX = viewport.offset[0] + target.x + 8;
    const screenY = viewport.offset[1] + target.y + 8; 

    const pulse = Math.sin(Date.now() / 150) * 2;
    const radius = 12 + pulse;

    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 🌟 FIX: Don't draw the HP bar if we are targeting a rock!
    if (!target.isOre) {
        drawHealthBar(ctx, target, "#FF4444"); 
    }
}

// --- Add this to src/renderer.js ---

export function drawHeroRange(ctx, hero) {
    // Show the circle if the player is holding the button OR actively attacking
    if (!inputState.mainBtn && !hero.isAttacking) return;

    const screenX = viewport.offset[0] + hero.x + 8;
    const screenY = viewport.offset[1] + hero.y + 8;
    
    // Grab the hero's attack range (defaults to 32 pixels / 2 tiles if undefined)
    const range = hero.attackRange || 32; 

    ctx.beginPath();
    ctx.arc(screenX, screenY, range, 0, Math.PI * 2);
    
    if (hero.target) {
        // HAS TARGET: Faded Blue Circle
        ctx.fillStyle = "rgba(0, 150, 255, 0.15)";
        ctx.strokeStyle = "rgba(0, 150, 255, 0.5)";
    } else {
        // NO TARGET: Faded Red Circle
        ctx.fillStyle = "rgba(255, 0, 0, 0.15)";
        ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
    }
    
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
}


export function drawJoystick(ctxUI) {
    if (inputState.inputType === 'keyboard' || !inputState.leftJoystick.active) return;

    const { startX, startY, currX, currY } = inputState.leftJoystick;

    // Use ctx3 (the UI layer)
    ctxUI.save();
    
    // 🛡️ THE WII U FIX: Only call setLineDash if the browser actually supports it!
    if (ctxUI.setLineDash) {
        ctxUI.setLineDash([]); 
    }
    
    // Outer Ring
    ctxUI.beginPath();
    ctxUI.arc(startX, startY, 50, 0, Math.PI * 2);
    ctxUI.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctxUI.lineWidth = 4;
    ctxUI.stroke();

    // Inner Stick
    ctxUI.beginPath();
    ctxUI.arc(currX, currY, 25, 0, Math.PI * 2);
    ctxUI.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctxUI.fill();
    
    ctxUI.restore();
}

// --- Add/Replace these functions in src/renderer.js ---
export function drawProjectiles(ctx, serverProjectilesData) {

    // 1. Draw Server-Controlled Projectiles (Flare)
    serverProjectilesData.forEach(p => {
        const screenX = viewport.offset[0] + p.x; 
        const screenY = viewport.offset[1] + p.y;
        
        if (p.type === 'flare') {
            // Bright white core, orange outline
            ctx.fillStyle = "#FFFFFF"; 
            ctx.beginPath(); ctx.arc(screenX, screenY, p.radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#FF8C00"; ctx.lineWidth = 2; ctx.stroke();
            
            // Add a tiny motion trail
            ctx.strokeStyle = "rgba(255, 140, 0, 0.5)";
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX - (p.dx * 15), screenY - (p.dy * 15));
            ctx.stroke();
        }

        else if (p.type === 'zephyr') {
            // A swirling gust of green/white wind
            ctx.fillStyle = "rgba(150, 255, 150, 0.8)"; 
            ctx.beginPath(); ctx.arc(screenX, screenY, 8, 0, Math.PI * 2); ctx.fill();
            
            // Draw a wind trail
            ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            // Swirl the trail slightly using sine waves
            ctx.lineTo(screenX - (p.dx * 10) + Math.sin(Date.now()/50)*5, screenY - (p.dy * 10) + Math.cos(Date.now()/50)*5);
            ctx.stroke();
        }

        // ... inside drawProjectiles() -> serverProjectiles.forEach ...
        else if (p.type === 'vanguard') {
            // A dazzling pink/purple crystal
            ctx.fillStyle = "rgba(255, 0, 255, 0.9)"; // Magenta
            
            ctx.save();
            ctx.translate(screenX, screenY);
            // Rotate the crystal based on its velocity
            ctx.rotate(Math.atan2(p.dy, p.dx));
            
            // Draw a diamond shape
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(0, 4);
            ctx.lineTo(-8, 0);
            ctx.lineTo(0, -4);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    });
    // Draw Projectiles
    hero.projectiles.forEach(p => {
        const screenX = viewport.offset[0] + p.x; 
        const screenY = viewport.offset[1] + p.y;
        
        // Lion's Breath (Golden Fireball)
        ctx.fillStyle = "#FFD700"; 
        ctx.beginPath(); ctx.arc(screenX, screenY, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#FFA500"; ctx.lineWidth = 2; ctx.stroke();
    });

    // Draw AoE Zones
    hero.aoeZones.forEach(z => {
        const screenX = viewport.offset[0] + z.x; 
        const screenY = viewport.offset[1] + z.y;

        if (z.type === 'radiantNova') {
            // Draw a charging laser from the sky
            const chargePercent = 1.0 - (z.life / 0.6); // Goes from 0 to 1
            
            // Outer warning ring
            ctx.strokeStyle = "rgba(255, 0, 255, 0.5)"; // Magenta warning
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(screenX, screenY, z.radius, 0, Math.PI * 2); ctx.stroke();

            // Inner charging beam
            ctx.fillStyle = `rgba(255, 255, 255, ${chargePercent})`; // Gets brighter
            ctx.beginPath(); ctx.arc(screenX, screenY, z.radius * chargePercent, 0, Math.PI * 2); ctx.fill();
        } 

        // 👇 UPDATED: Ring of Penance Visual
        else if (z.type === 'ringOfPenanceVis') {
            ctx.fillStyle = "rgba(255, 215, 0, 0.3)"; // Hallowed Gold
            ctx.strokeStyle = "rgba(255, 255, 0, 0.8)"; // Bright Yellow
            ctx.lineWidth = 3;
            ctx.beginPath(); 
            ctx.arc(screenX, screenY, z.radius, 0, Math.PI * 2); 
            ctx.fill(); 
            ctx.stroke();
        }

        // 👇 NEW: Consecration Visuals
        else if (z.type === 'consecration') {
            // A glowing, holy white/gold ring on the ground
            ctx.fillStyle = "rgba(255, 255, 200, 0.2)"; // Soft holy white
            ctx.strokeStyle = "rgba(255, 215, 0, 0.6)"; // Gold trim
            ctx.lineWidth = 2;
            
            ctx.beginPath(); 
            ctx.arc(screenX, screenY, z.radius, 0, Math.PI * 2); 
            ctx.fill(); 
            ctx.stroke();

            // Add a subtle pulsing effect based on the tick timer
            if (z.tickTimer > 0.8) {
                ctx.fillStyle = "rgba(255, 215, 0, 0.4)"; // Bright flash on tick!
                ctx.fill();
            }
        }

        else {
        
        // Scorched Holy Ground
        ctx.fillStyle = "rgba(255, 215, 0, 0.2)"; // Soft gold
        ctx.strokeStyle = "rgba(255, 140, 0, 0.5)"; // Orange rim
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(screenX, screenY, z.radius, 0, Math.PI * 2); 
        ctx.fill(); ctx.stroke();

        }
    });
}

export function drawWorkingIndicator(ctx, workingObj) {
    if (!workingObj) return;

    // Convert tile coordinates to screen coordinates
    const screenX = viewport.offset[0] + (workingObj.tx * 16) + 8;
    const screenY = viewport.offset[1] + (workingObj.ty * 16) + 8; 

    // Make it pulse to show it's active
    const pulse = Math.sin(Date.now() / 100) * 2;
    const radius = 12 + pulse;

    ctx.strokeStyle = "rgba(255, 50, 50, 0.9)"; 
    ctx.fillStyle = "rgba(255, 50, 50, 0.3)";
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

// js/renderer.js

// src/renderer.js

export function drawHUDButton(ctx, x, y, radius, label, icon, isPressed, cooldown = 0, reqLevel = 0, currentLevel = 0) {
    const isLocked = currentLevel < reqLevel;
    const size = radius * 2;
    const rectX = x - radius;
    const rectY = y - radius;

    // 1. Solid Outer Border (No transparent arcs)
    ctx.fillStyle = "#000000"; 
    ctx.fillRect(rectX, rectY, size, size);

    // 2. Main Button Body
    ctx.fillStyle = isLocked ? "#333333" : (isPressed ? "#ffffff" : (cooldown > 0 ? "#555555" : "var(--bg-panel)"));
    ctx.fillRect(rectX + 2, rectY + 2, size - 4, size - 4);

    // 3. Simple Retro Highlight (Top/Left edges)
    if (!isPressed && !isLocked && cooldown === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.fillRect(rectX + 2, rectY + 2, size - 4, 2); // Top edge
        ctx.fillRect(rectX + 2, rectY + 2, 2, size - 4); // Left edge
    }

    // 4. Text / Icon Content
    ctx.fillStyle = isLocked ? "#888" : "#000"; 
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    
    if (isLocked) {
        ctx.font = '5px "Press Start 2P"';
        ctx.fillText("LVL", x, y - 4);
        ctx.fillText(`${reqLevel}`, x, y + 4);
    } else if (cooldown > 0) {
        ctx.font = '10px "Press Start 2P"'; 
        ctx.fillStyle = "#fff";
        ctx.fillText(Math.ceil(cooldown), x, y);
    } else {
        if (icon) { 
            ctx.font = `${radius}px Arial`; 
            ctx.fillText(icon, x, y + 1); 
        } else { 
            ctx.font = '6px "Press Start 2P"'; 
            ctx.fillText(label, x, y); 
        }
    }
}

// In src/renderer.js

export function drawAbilityButtons(ctxUI) {
    // 🛑 KEYBOARD CHECK: Stop drawing here if on PC to keep screen clean!
    if (inputState.inputType === 'keyboard') return;

    // --- 📱 TOUCH ONLY UI BELOW ---
    const btns = getUIButtons();
    const currentLevel = getLevelInfo(hero.xp).level;
    const reqLevels = [1, 25, 50, 75]; 

    const getSkillIcon = (index) => {
        if (!hero.skills || !hero.skills[index]) return null;
        const skillId = hero.skills[index];
        if (skillId === 'p2') return hero.p2_stance === 'blast' ? '💥' : '🛡️';
        if (skillId === 'p4') return (hero.buffs && hero.buffs.isAscended) ? '🔥' : '🌟';
        if (skillId === 'p16' && hero.pet && hero.pet.active) return '🤖';
        const skillData = PALADIN_SKILLS.find(s => s.id === skillId);
        return skillData ? skillData.icon : null;
    };

    const cd = hero.cooldowns || [0, 0, 0, 0];

    // 🔄 Always draw the SWAP button
    drawHUDButton(ctxUI, btns.SWAP.x, btns.SWAP.y, btns.SWAP.r, "SWAP", "🔄", false, 0, 0, 0);

    if (inputState.uiMode === 'combat') {
        // ⚔️ COMBAT MODE
        drawHUDButton(ctxUI, btns.SKILL1.x, btns.SKILL1.y, btns.SKILL1.r, "S1", getSkillIcon(0), inputState.skill1, cd[0], reqLevels[0], currentLevel);
        drawHUDButton(ctxUI, btns.SKILL2.x, btns.SKILL2.y, btns.SKILL2.r, "S2", getSkillIcon(1), inputState.skill2, cd[1], reqLevels[1], currentLevel);
        drawHUDButton(ctxUI, btns.SKILL3.x, btns.SKILL3.y, btns.SKILL3.r, "S3", getSkillIcon(2), inputState.skill3, cd[2], reqLevels[2], currentLevel);
        drawHUDButton(ctxUI, btns.SKILL4.x, btns.SKILL4.y, btns.SKILL4.r, "ULT", getSkillIcon(3), inputState.skill4, cd[3], reqLevels[3], currentLevel);
        drawHUDButton(ctxUI, btns.MAIN.x, btns.MAIN.y, btns.MAIN.r, "ATK", "🗡️", inputState.mainBtn, 0, 0, currentLevel);
    } else {
        // 🎒 NORMAL MODE (2x3 Grid)
        drawHUDButton(ctxUI, btns.INV.x, btns.INV.y, btns.INV.r, "INV", "🎒", false, 0, 0, 0);
        drawHUDButton(ctxUI, btns.WORK.x, btns.WORK.y, btns.WORK.r, "WORK", "🔨", inputState.keyF, 0, 0, 0);
        drawHUDButton(ctxUI, btns.DROP.x, btns.DROP.y, btns.DROP.r, "DROP", "⏬", inputState.drop, 0, 0, 0);
        drawHUDButton(ctxUI, btns.EAT.x, btns.EAT.y, btns.EAT.r, "EAT", "🍗", inputState.keyC, 0, 0, 0); 
        drawHUDButton(ctxUI, btns.PLANT.x, btns.PLANT.y, btns.PLANT.r, "PLANT", "🌱", inputState.keyV, 0, 0, 0);
        drawHUDButton(ctxUI, btns.INTERACT.x, btns.INTERACT.y, btns.INTERACT.r, "USE", "🖐️", inputState.interact, 0, 0, 0);
    }
}

// Replace drawXPStatus to scale it down and reposition it:
export function drawXPStatus(ctxUI) {
    const info = getLevelInfo(hero.xp);
    const availablePoints = info.points - (hero.spentPoints || 0);

    const x = 10; // 👈 Slightly padded from the left edge
    const y = Math.floor(canvas3.height / 2); // 👈 Center of the screen vertically

    // 1. Progress Bar Background
    const barW = 80;
    const barH = 8;
    ctxUI.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctxUI.fillRect(x, y, barW, barH);

    // 2. XP Fill (Blue for Lv0, Gold for Lv1+)
    const progress = Math.min(1, hero.xp / info.nextXp);
    ctxUI.fillStyle = (info.level > 0) ? "#FFD700" : "#3498db";
    ctxUI.fillRect(x, y, barW * progress, barH);

    // 3. Level Text
    ctxUI.fillStyle = "white";
    ctxUI.font = CONFIG.FONT_STYLE;
    ctxUI.textAlign = "left";
    ctxUI.fillText(`LVL ${info.level} - ${Math.floor(hero.xp)} XP`, x, y - 4);

    // 4. STAT UPGRADE MENU (Visible when points exist)
    if (availablePoints > 0) {
        const menuY = y + 15;
        ctxUI.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctxUI.fillRect(x, menuY, 75, 75);
        ctxUI.strokeStyle = "#FFD700";
        ctxUI.lineWidth = 1;
        ctxUI.strokeRect(x, menuY, 75, 75);

        ctxUI.fillStyle = "#FFD700";
        ctxUI.fillText(`UPGRADES (${availablePoints})`, x + 5, menuY + 10);
        
        ctxUI.fillStyle = "white";
        const stats = ["1:+10 HP", "2:+1 ATK", "3:+1 DEF", "4:+1 MAG", "5:+1 MR", "6:+10 SPD"];
        stats.forEach((text, i) => ctxUI.fillText(text, x + 5, menuY + 22 + (i * 10)));
    }
}

// --- Add to src/renderer.js ---

export function drawAimIndicator(ctxUI) {
    if (!inputState.aim.active) return;

    const btns = getUIButtons();
    const cancel = btns.CANCEL;

    // 1. Draw the Cancel Button
    ctxUI.beginPath();
    ctxUI.arc(cancel.x, cancel.y, cancel.r, 0, Math.PI * 2);
    ctxUI.fillStyle = inputState.aim.cancel ? "rgba(255, 0, 0, 0.8)" : "rgba(255, 0, 0, 0.4)";
    ctxUI.fill();
    ctxUI.strokeStyle = "white";
    ctxUI.lineWidth = 2;
    ctxUI.stroke();
    ctxUI.fillStyle = "white";
    ctxUI.font = '20px Arial';
    ctxUI.textAlign = "center";
    ctxUI.textBaseline = "middle";
    ctxUI.fillText("X", cancel.x, cancel.y);

    // 2. Draw the Faded Blue Projectile Line (if we have a vector)
    if (inputState.aim.dx !== 0 || inputState.aim.dy !== 0) {
        const screenX = viewport.offset[0] + hero.x + 8;
        const screenY = viewport.offset[1] + hero.y + 8;
        
        // 🌟 If aiming Radiant Nova, draw a targeted circle on the ground
        const skillId = hero.skills[inputState.aim.index];
        // 🌟 Ground-Targeted AoE (Radiant Nova, Consecration, Zenith Guardian)
        if (skillId === 'p5' || skillId === 'p14' || skillId === 'p16') { // 👈 Added p16 here!
            const mag = inputState.aim.mag || 1.0;
            
            let range = 200;
            let radius = 32;
            let color = "0, 150, 255"; // Default Blue

            if (skillId === 'p14') { range = 150; radius = 48; color = "255, 215, 0"; } // Consecration (Gold)
            
            // 👇 NEW: Zenith Guardian Reticle (Massive Gold Impact Zone)
            if (skillId === 'p16') { range = 250; radius = 64; color = "255, 140, 0"; } // Deep Orange/Gold
            
            const targetX = screenX + (inputState.aim.dx * range * mag);
            const targetY = screenY + (inputState.aim.dy * range * mag);

            ctxUI.beginPath();
            ctxUI.arc(targetX, targetY, radius, 0, Math.PI * 2); 
            ctxUI.fillStyle = `rgba(${color}, 0.2)`; 
            ctxUI.fill();
            ctxUI.strokeStyle = `rgba(${color}, 0.8)`;
            ctxUI.lineWidth = 2;
            ctxUI.stroke();
        }  
        else {
            // Normal Projectile Aim Line
            ctxUI.beginPath();
            ctxUI.moveTo(screenX, screenY);
            ctxUI.lineTo(screenX + (inputState.aim.dx * 100), screenY + (inputState.aim.dy * 100));
            ctxUI.strokeStyle = "rgba(0, 150, 255, 0.5)"; 
            ctxUI.lineWidth = 10;
            ctxUI.lineCap = "round";
            ctxUI.stroke();
        }        
    }
}

export function drawCanopy(worldMatrix) {
    const w = canvas.width, h = canvas.height;
    const hTX = Math.floor((hero.x + 8) / 16);
    const hTY = Math.floor((hero.y + 8) / 16);
    // Expand the bounding box slightly so leaves don't pop out at the edges
    const halfX = Math.ceil((w / 16) / 2) + 2; 
    const halfY = Math.ceil((h / 16) / 2) + 4; 

    const woodsImg = images.woodsTileset2;
    if (!woodsImg || !woodsImg.complete) return;

    for (let k = hTX - halfX; k <= hTX + halfX; k++) {
        const cx = Math.floor(k / 100);
        const lx = ((k % 100) + 100) % 100;
        const wCol = worldMatrix[cx];

        for (let l = hTY - halfY; l <= hTY + halfY; l++) {
            const cy = Math.floor(l / 100);
            const wChunk = wCol?.[cy];
            if (!wChunk) continue;

            const ly = ((l % 100) + 100) % 100;
            const tID = wChunk[(ly * 100) + lx];

            if (tID === 406) {
                const sX = (k * 16) + viewport.offset[0];
                const sY = (l * 16) + viewport.offset[1];

                const drawPiece = (localId, offsetX, offsetY) => {
                    const srcX = (localId % 12) * 16;
                    const srcY = Math.floor(localId / 12) * 16;
                    ctx2.drawImage(woodsImg, srcX, srcY, 16, 16, sX + offsetX, sY + offsetY, 16, 16);
                };

                // Draw Top Leaves (78, 79) shifted up 32 pixels
                drawPiece(78, 0, -32);
                drawPiece(79, 16, -32);
                
                // Draw Middle Leaves (88, 89) shifted up 16 pixels
                drawPiece(88, 0, -16);
                drawPiece(89, 16, -16);
            }
        }
    }
}


// In renderer.js
export function clearAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // Clears BASE MAP layer
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height); // Clears ENTITY layer
    ctx3.clearRect(0, 0, canvas3.width, canvas3.height); // Clears UI layer
}