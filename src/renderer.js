// src/renderer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { CONFIG } from './config.js';
import { hero, getLevelInfo, gameState } from './entities.js';
import { plants, PLANT_DEFS } from './plants.js';
import { getBacteriaData, bacteriaCells, BACTERIA_TYPES } from './bacteria.js';
import { animals } from './animals.js';
import { inputState, getUIButtons } from './input.js';
import { ITEM_TYPES } from './items.js';
import { globalFishCount } from './fish.js';
import { getObjectAt } from './staticObjects.js';
import { roomMetadata } from './cellDecorator.js';
import { PALADIN_SKILLS } from './uiManager.js';
import { getHeroAnimationData, getPetAnimationData, getAnimalAnimationData } from './animations.js';

if (typeof window !== 'undefined') {
    logStep("renderer.js loaded");
}

// 🎮 CONSOLIDATED CANVAS DECLARATIONS (Unused Canvas 1 Removed)
export const canvas2 = document.getElementById("myCanvas2");
export const canvas3 = document.getElementById("myCanvas3");

export const ctx2 = canvas2.getContext("2d");
export const ctx3 = canvas3.getContext("2d");

// 🌲 Flat-list array for ultra-fast, single-pass canopy rendering
let visibleTrees = []; 

// Sockets layout mapping for hold-item offsets
const HERO_SOCKETS = {
    'walkSouth_0': { handX: 5, handY: 11, angle: 135, behind: false },
    'walkSouth_1': { handX: 7, handY: 12, angle: 135, behind: false },
    'walkSouth_2': { handX: 4, handY: 8,  angle: 135, behind: false },
    'walkSouth_3': { handX: 4, handY: 9,  angle: 135, behind: false },
    'lungeSouth':  { handX: 4, handY: 9,  angle: 135, behind: false },

    'walkSouthEast_0': { handX: 6, handY: 12, angle: 45, behind: false },
    'walkSouthEast_1': { handX: 6, handY: 11, angle: 45, behind: false },
    'walkSouthEast_2': { handX: 4, handY: 10, angle: 45, behind: false },
    'walkSouthEast_3': { handX: 4, handY: 10, angle: 45, behind: false },
    'lungeSouthEast':  { handX: 1, handY: 10, angle: 45, behind: false },

    'walkEast_0': { handX: 7, handY: 11, angle: 45, behind: false },
    'walkEast_1': { handX: 10, handY: 10, angle: 45, behind: false },
    'walkEast_2': { handX: 7, handY: 10, angle: 45, behind: false },
    'walkEast_3': { handX: 7, handY: 10, angle: 45, behind: false },
    'lungeEast':  { handX: 14, handY: 8,  angle: 45, behind: true },

    'walkNorthEast_0': { handX: 11, handY: 11, angle: 0, behind: true },
    'walkNorthEast_1': { handX: 12, handY: 11, angle: 0, behind: true },
    'walkNorthEast_2': { handX: 9, handY: 11,  angle: 0, behind: true },
    'walkNorthEast_3': { handX: 9, handY: 11,  angle: 0, behind: true },
    'lungeNorthEast':  { handX: 11, handY: 6,  angle: 0, behind: true },

    'walkNorth_0': { handX: 11, handY: 9,  angle: 315, behind: true },
    'walkNorth_1': { handX: 11, handY: 9,  angle: 315, behind: true },
    'walkNorth_2': { handX: 11, handY: 10, angle: 315, behind: true },
    'walkNorth_3': { handX: 11, handY: 11, angle: 315, behind: true },
    'lungeNorth':  { handX: 8,  handY: 6,  angle: 315, behind: true },

    'walkNorthWest_0': { handX: 7, handY: 7, angle: 270, behind: true },
    'walkNorthWest_1': { handX: 9, handY: 8, angle: 270, behind: true },
    'walkNorthWest_2': { handX: 12, handY: 9, angle: 270, behind: true },
    'walkNorthWest_3': { handX: 11, handY: 9, angle: 270, behind: true },
    'lungeNorthWest':  { handX: 3,  handY: 7, angle: 270, behind: true },

    'walkWest_0': { handX: 9, handY: 12, angle: 270, behind: true },
    'walkWest_1': { handX: 6, handY: 11, angle: 270, behind: true },
    'walkWest_2': { handX: 9, handY: 11, angle: 270, behind: true },
    'walkWest_3': { handX: 9, handY: 11, angle: 270, behind: true },
    'lungeWest':  { handX: 1, handY: 8,  angle: 270, behind: true },

    'walkSouthWest_0': { handX: 4, handY: 10, angle: 225, behind: false },
    'walkSouthWest_1': { handX: 5, handY: 10, angle: 225, behind: false },
    'walkSouthWest_2': { handX: 6, handY: 10, angle: 225, behind: true },
    'walkSouthWest_3': { handX: 6, handY: 11, angle: 225, behind: true },
    'lungeSouthWest':  { handX: 3, handY: 9,  angle: 225, behind: false },
};

export function initRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const zoom = CONFIG.ZOOM;

    [canvas2, canvas3].forEach(c => {
        c.width = Math.floor(w / zoom);
        c.height = Math.floor(h / zoom);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
    });

    viewport.screen = [Math.floor(w / zoom), Math.floor(h / zoom)];

    [ctx2, ctx3].forEach(c => {
        c.imageSmoothingEnabled = false;
        c.webkitImageSmoothingEnabled = false;
        c.mozImageSmoothingEnabled = false;
    });
}

export function clearAll() {
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height); // Game World
    ctx3.clearRect(0, 0, canvas3.width, canvas3.height); // UI/HUD Overlay
}

export function drawMap(worldMatrix, roomMatrix) {
    const w = canvas2.width;
    const h = canvas2.height;
    
    const startX = viewport.startTile[0];
    const endX = viewport.endTile[0];
    const startY = viewport.startTile[1];
    const endY = viewport.endTile[1];

    const hTX = Math.floor((hero.x + 8) / 16);
    const hTY = Math.floor((hero.y + 8) / 16);

    let hHouseId = 0;
    const hChunkR = roomMatrix[Math.floor(hTX / 100)]?.[Math.floor(hTY / 100)];
    if (hChunkR) {
        hHouseId = hChunkR[((hTY % 100 + 100) % 100 * 100) + ((hTX % 100 + 100) % 100)];
    }

    const tileImg = images.worldTilesColor;

    // Reset the visible trees collector for the active viewport frame
    visibleTrees = [];

    // ==========================================
    // 🌍 OUTDOOR MODE
    // ==========================================
    if (hHouseId === 0 || hHouseId === 9999) {
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

                if (tID === 63) continue; // Walkable grass skipped (handled by flat background color)

                const sY = Math.floor((l * 16) + viewport.offset[1]);

                if (tID === 44) {
                    ctx2.drawImage(tileImg, (63 % 8) * 16, Math.floor(63 / 8) * 16, 16, 16, sX, sY, 16, 16);
                    const tImg = images.transparentTileset;
                    if (tImg && tImg.complete) {
                        ctx2.drawImage(tImg, (1 % 10) * 16, Math.floor(1 / 10) * 16, 16, 16, sX, sY, 16, 16);
                    }
                    continue; 
                }

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

                        

                        const localIdx = tID - 300; 
                        const srcX = (localIdx % 12) * 16;
                        const srcY = Math.floor(localIdx / 12) * 16;
                        ctx2.drawImage(woodsImg, srcX, srcY, 16, 16, sX, sY, 16, 16);
                    }
                    continue;
                }

                if (tID >= 200 && tID <= 208) {
                    const roadImg = images.mainTileset2;
                    if (roadImg && roadImg.complete) {
                        const localIdx = tID - 200;
                        const srcX = (localIdx % 8) * 16;
                        const srcY = Math.floor(localIdx / 8) * 16;
                        ctx2.drawImage(roadImg, srcX, srcY, 16, 16, sX, sY, 16, 16);
                    }
                } else {
                    ctx2.drawImage(tileImg, (tID % 8) * 16, Math.floor(tID / 8) * 16, 16, 16, sX, sY, 16, 16);
                }
            }
        }
    } 
    // ==========================================
    // 🏠 INDOOR MODE
    // ==========================================
    else {
        ctx2.fillStyle = "#2d232e"; 
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
                    let base = 42; 

                    if (meta && meta.type === 'LARGE_BARN') {
                        const ox = k - meta.frontX; 
                        const oy = l - meta.frontY;
                        if (hero.floor === 1) { 
                            if (oy <= -6) base = 27; else if (oy === -5) base = 41; 
                        } else { 
                            if ((ox !== 2 && ox !== 3) || oy === 0 || oy === -1) base = 27; else if (oy === -7) base = 41; 
                        }
                    } 
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
                    
                    ctx2.drawImage(tileImg, (base % 8) * 16, Math.floor(base / 8) * 16, 16, 16, sX, sY, 16, 16);

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

// Add this function to src/renderer.js:

export function drawStaticObjects() {
    const startX = viewport.startTile[0];
    const endX = viewport.endTile[0];
    const startY = viewport.startTile[1];
    const endY = viewport.endTile[1];

    // Reset the visible trees array
    visibleTrees = [];

    for (let k = startX; k <= endX; k++) {
        const sX = Math.floor((k * 16) + viewport.offset[0]);
        for (let l = startY; l <= endY; l++) {
            const obj = getObjectAt(k, l);
            if (!obj) continue;

            const sY = Math.floor((l * 16) + viewport.offset[1]);

            if (obj.type === 'WELL_OBJECT') {
                const tImg = images.worldTilesColor;
                if (tImg && tImg.complete) {
                    // Draw 2x2 well segments smoothly over the completed ground
                    ctx2.drawImage(tImg, (38 % 8) * 16, Math.floor(38 / 8) * 16, 16, 16, sX, sY, 16, 16);          // Bottom-Left
                    ctx2.drawImage(tImg, (39 % 8) * 16, Math.floor(39 / 8) * 16, 16, 16, sX + 16, sY, 16, 16);     // Bottom-Right
                    ctx2.drawImage(tImg, (30 % 8) * 16, Math.floor(30 / 8) * 16, 16, 16, sX, sY - 16, 16, 16);      // Top-Left
                    ctx2.drawImage(tImg, (31 % 8) * 16, Math.floor(31 / 8) * 16, 16, 16, sX + 16, sY - 16, 16, 16); // Top-Right
                }
            }
            else if (obj.type === 'FOREST_TREE') {
                const woodsImg = images.woodsTileset2;
                if (woodsImg && woodsImg.complete) {
                    ctx2.drawImage(woodsImg, (106 % 12) * 16, Math.floor(106 / 12) * 16, 16, 16, sX, sY, 16, 16);
                    ctx2.drawImage(woodsImg, (107 % 12) * 16, Math.floor(107 / 12) * 16, 16, 16, sX + 16, sY, 16, 16);
                    visibleTrees.push({ sX, sY });

                    // 🎯 DEBUG: Draw Tree Hitbox (Red)
                    ctx2.strokeStyle = "rgba(255, 0, 0, 0.8)";
                    ctx2.lineWidth = 1;
                    ctx2.strokeRect(sX + 8, sY, 16, 16); // Centered 16px trunk box
                }
            }
        }
    }
}

export function drawPlants(roomMatrix) {
    const hTX = Math.floor((hero.x + 8) / 16);
    const hTY = Math.floor((hero.y + 14) / 16);
    const rCol = roomMatrix[Math.floor(hTX / 100)]?.[Math.floor(hTY / 100)];
    const heroHouseId = rCol ? rCol[((hTY % 100 + 100) % 100 * 100) + ((hTX % 100 + 100) % 100)] : 0;

    if (heroHouseId !== 0 && heroHouseId !== 9999) return;

    plants.forEach((plant) => {
        const screenX = Math.floor(viewport.offset[0] + (plant.gx * 16));
        const screenY = Math.floor(viewport.offset[1] + (plant.gy * 16));

        if (screenX < -16 || screenX > canvas2.width || screenY < -16 || screenY > canvas2.height) return;

        const def = PLANT_DEFS[plant.type];
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

const renderCache = {};

function getRenderData(typeID) {
    if (renderCache[typeID]) return renderCache[typeID];

    const seedTypeStr = Object.keys(BACTERIA_TYPES).find(key => 
        BACTERIA_TYPES[key] === typeID && !['organic_drop', 'organic_plant', 'grass'].includes(key)
    );

    if (seedTypeStr) {
        const template = Object.values(ITEM_TYPES).find(t => t.seedType === seedTypeStr);
        if (template) {
            const tilesetStr = template.tileset || "cropTileset";
            const img = images[tilesetStr];
            
            let w = CONFIG.CROP_SHEET_WIDTH_TILES;
            if (tilesetStr === "gardenTileset") w = CONFIG.GARDEN_SHEET_WIDTH_TILES;
            else if (tilesetStr === "worldTilesColor") w = 8;
            else if (tilesetStr === "transparentTileset") w = 10; 
            else if (tilesetStr === "foodTileset") w = 10; 
            else if (tilesetStr === "keyTileset") w = 16;
            else if (tilesetStr === "weaponTileset") w = 16;

            renderCache[typeID] = { 
                spriteID: template.spriteID, 
                img, 
                sheetWidth: w, 
                drawSize: template.drawSize || 16 
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

    const w = canvas2.width;
    const h = canvas2.height;
    
    const cameraLeft = hero.x + 8 - (w / 2);
    const cameraRight = hero.x + 8 + (w / 2);
    const cameraTop = hero.y + 8 - (h / 2);
    const cameraBottom = hero.y + 8 + (h / 2);

    const startTX = Math.floor(cameraLeft / 16) - 1;
    const endTX = Math.floor(cameraRight / 16) + 1;
    const startTY = Math.floor(cameraTop / 16) - 1;
    const endTY = Math.floor(cameraBottom / 16) + 1;

    for (let ty = startTY; ty <= endTY; ty++) {
        for (let tx = startTX; tx <= endTX; tx++) {
            const cx = Math.floor(tx / 100);
            const cy = Math.floor(ty / 100);
            
            const cellKey = `${cx}_${cy}`;
            const data = bacteriaCells.get(cellKey);
            if (!data) continue; 

            const lx = ((tx % 100) + 100) % 100;
            const ly = ((ty % 100) + 100) % 100;
            const idx = (ly * 100) + lx;
            
            const traits = data[idx];
            if (traits === 0) continue; 

            const hTraits = traits & 0xFF; 
            const v = (traits >> 8) & 0xFF;
            const typeID = (traits >> 20) & 0xFF;

            if (typeID === 2 || typeID === 0) continue; 

            const screenX = Math.floor(viewport.offset[0] + (tx * 16));
            const screenY = Math.floor(viewport.offset[1] + (ty * 16));

            let spriteID = 0;
            let imgToUse = null;
            let sheetWidth = 8;
            let drawSize = 16;

            const isFish = typeID === 1 || (typeID >= 40 && typeID <= 48);

            if (isFish && hTraits <= 0) {
                imgToUse = images.cropTileset;
                sheetWidth = CONFIG.CROP_SHEET_WIDTH_TILES;
                spriteID = (v > 10) ? 58 : 59; 
                drawSize = 16;
            } 
            else {
                const rData = getRenderData(typeID);
                if (!rData || !rData.img || !rData.img.complete) continue; 
                
                imgToUse = rData.img;
                spriteID = rData.spriteID;
                sheetWidth = rData.sheetWidth;
                drawSize = rData.drawSize || 16;
            }

            const offset = Math.floor((16 - drawSize) / 2);

            if (typeID === 16) { 
                const eggCount = Math.min(8, hTraits); 
                for (let i = 0; i < eggCount; i++) {
                    const ex = (i % 3) * 4;
                    const ey = Math.floor(i / 3) * 4;
                    ctx2.drawImage(
                        imgToUse, 
                        (spriteID % sheetWidth) * 16, Math.floor(spriteID / sheetWidth) * 16, 
                        16, 16, 
                        screenX + 2 + ex, screenY + 2 + ey, 
                        4, 4 
                    );
                }
            } 
            else {
                ctx2.drawImage(
                    imgToUse, 
                    (spriteID % sheetWidth) * 16, Math.floor(spriteID / sheetWidth) * 16, 
                    16, 16, 
                    screenX + offset, screenY + offset, 
                    drawSize, drawSize 
                );
            }
        }
    }
}

export function drawAnimals() {
    const w = canvas2.width | 0;
    const h = canvas2.height | 0;

    animals.forEach(chicken => {
        const screenX = Math.floor(chicken.x + viewport.offset[0]);
        const screenY = Math.floor(chicken.y + viewport.offset[1]);
        
        if (screenX < -32 || screenX > w + 32 || screenY < -32 || screenY > h + 32) return;

        const animData = getAnimalAnimationData(chicken, images);

        if (animData.img && animData.img.complete) {
            ctx2.drawImage(
                animData.img,
                animData.srcX, animData.srcY, animData.srcW, animData.srcH,
                screenX, screenY, 16, 16
            );
        }

        const hungerPct = (100 - chicken.hunger) / 100;
        ctx2.fillStyle = "black";
        ctx2.fillRect(screenX + 2, screenY - 4, 12, 2);
        ctx2.fillStyle = "orange";
        ctx2.fillRect(screenX + 2, screenY - 4, 12 * Math.max(0, hungerPct), 2);
    });
}

export function drawHero() {
    const animData = getHeroAnimationData(hero, images);

    if (animData.img && animData.img.complete) {
        const centerX = Math.floor(canvas2.width / 2);
        const centerY = Math.floor(canvas2.height / 2);

        const hX = Math.floor(hero.x + 8);
        const hY = Math.floor(hero.y + 8);
        
        const scale = (hero.buffs && hero.buffs.isAscended) ? 1.12 : 1.0;
        const destW = 16 * scale; 
        const destH = 16 * scale; 

        let drawX = Math.floor(hero.x + viewport.offset[0]) - Math.floor((destW - 16) / 2);
        let drawY = Math.floor(hero.y + viewport.offset[1]) - Math.floor((destH - 16) / 2);

        const isImpact = (hero.attackTimer < 0 && hero.attackTimer < -1.5);
        const isWindingUp = hero.isWindingUp;

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

        if (hero.buffs && hero.buffs.divineBubble) {
            ctx2.strokeStyle = "rgba(255, 215, 0, 0.8)"; 
            ctx2.fillStyle = "rgba(255, 215, 0, 0.2)";   
            ctx2.lineWidth = 2;
            
            ctx2.beginPath();
            ctx2.arc(drawX + 8, drawY + 8, 14, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
        }

        if (hero.buffs && hero.buffs.isInvincible) {
            ctx2.shadowColor = "rgba(255, 255, 255, 0.9)";
            ctx2.shadowBlur = 15;

            const haloY = drawY - 6 + (Math.sin(Date.now() / 150) * 2); 
            
            ctx2.strokeStyle = "rgba(255, 215, 0, 1.0)"; 
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.ellipse(drawX + 8, haloY, 6, 2, 0, 0, Math.PI * 2);
            ctx2.stroke();
            
            ctx2.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx2.lineWidth = 1;
            ctx2.beginPath();
            ctx2.ellipse(drawX + 8, haloY, 5, 1, 0, 0, Math.PI * 2);
            ctx2.stroke();

            ctx2.shadowBlur = 0; 
        }

        if (hero.bulwarkTimer > 0) {
            ctx2.strokeStyle = "rgba(100, 200, 255, 0.8)"; 
            ctx2.lineWidth = 2;
            const angleOffset = Date.now() / 200; 
            
            for (let i = 0; i < 3; i++) {
                ctx2.beginPath();
                ctx2.arc(drawX + 8, drawY + 12, 14, angleOffset + (i * 2.09), angleOffset + (i * 2.09) + 1.0);
                ctx2.stroke();
            }
        }

        if (hero.pet && hero.pet.active) {
            const petScreenX = (centerX + (hero.pet.x - hX)) | 0;
            const petScreenY = (centerY + (hero.pet.y - hY)) | 0; 
            const petAnim = getPetAnimationData(hero.pet, images);

            if (petAnim.img && petAnim.img.complete) {
                ctx2.drawImage(
                    petAnim.img,
                    petAnim.srcX, petAnim.srcY, petAnim.srcW, petAnim.srcH,
                    petScreenX - 12, petScreenY - 12, 24, 24
                );
            }

            const petHpPct = hero.pet.hp / (hero.maxHp * 1.8);
            ctx2.fillStyle = "black";
            ctx2.fillRect(petScreenX - 12, petScreenY - 16, 24, 2);
            ctx2.fillStyle = "lime";
            ctx2.fillRect(petScreenX - 12, petScreenY - 16, 24 * Math.max(0, petHpPct), 2);
        }

        const wpn = hero.equipment ? hero.equipment.mainHand : null;
        let isWeaponBehind = false;
        let socket = null;

        if (wpn) {
            let socketKey = `walk${hero.dir}_${hero.frame}`;
            if (isImpact) {
                socketKey = `lunge${hero.dir}`;
            }
            socket = HERO_SOCKETS[socketKey] || HERO_SOCKETS[`walk${hero.dir}_0`];
            if (socket) {
                isWeaponBehind = socket.behind;
            }
        }

        const drawWeapon = () => {
            if (!wpn || !socket) return;
            
            const tilesetStr = wpn.tileset || "cropTileset";
            const wImg = images[tilesetStr];
            if (!wImg || !wImg.complete) return;
            
            let sheetWidth = 16; 
            if (tilesetStr === "cropTileset" || tilesetStr === "cropTileset2") sheetWidth = CONFIG.CROP_SHEET_WIDTH_TILES || 12;
            else if (tilesetStr === "worldTilesColor") sheetWidth = 8;
            else if (tilesetStr === "transparentTileset" || tilesetStr === "foodTileset") sheetWidth = 10;
            else if (tilesetStr === "gardenTileset") sheetWidth = CONFIG.GARDEN_SHEET_WIDTH_TILES || 16;
            
            ctx2.save();
            let finalHandX = drawX + socket.handX;
            let finalHandY = drawY + socket.handY;

            ctx2.translate(finalHandX, finalHandY);
            ctx2.rotate(socket.angle * Math.PI / 180);

            const drawSize = wpn.drawSize || 16;  
            const scale = drawSize / 16.0;        
            ctx2.scale(scale, scale);

            if (hero.buffs && hero.buffs.fluxShotEmpowered && wpn.isWeapon) {
                ctx2.shadowColor = "rgba(0, 255, 255, 0.8)";
                ctx2.shadowBlur = 8;
            }
            
            const hiltX = wpn.hilt ? wpn.hilt.x : (wpn.isWeapon ? 5 : 8);
            const hiltY = wpn.hilt ? wpn.hilt.y : (wpn.isWeapon ? 10 : 8);

            ctx2.drawImage(
                wImg,
                (wpn.spriteID % sheetWidth) * 16, Math.floor(wpn.spriteID / sheetWidth) * 16, 
                16, 16,
                -hiltX, -hiltY, 
                16, 16
            );
            ctx2.restore();
        };

        if (isWeaponBehind) drawWeapon();
        
        ctx2.drawImage(
            animData.img, animData.srcX, animData.srcY, animData.srcW, animData.srcH,
            drawX, drawY, 16, 16
        );

        if (!isWeaponBehind) drawWeapon();

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

        // 🎯 DEBUG: Draw Player Hitbox (Green)
        ctx2.strokeStyle = "rgba(0, 255, 0, 0.8)";
        ctx2.lineWidth = 1;
        ctx2.strokeRect(drawX + 2, drawY + 8, 12, 7); // Matches player's pxMin/pxMax and pyMin/pyMax
    }
}

export function drawRemotePlayers(ctx2, remotePlayersData) {
    remotePlayersData.forEach(p => {
        let sx = Math.floor(p.x + viewport.offset[0]);
        let sy = Math.floor(p.y + viewport.offset[1]);

        if (sx < -32 || sx > canvas2.width + 32 || sy < -32 || sy > canvas2.height + 32) return;
        
        if (p.isOffline) ctx2.globalAlpha = 0.5; 
        
        const imgKey = `heroWalk${p.dir || 'South'}`;
        const img = images[imgKey] || images.heroWalkSouth;
        if (!img || !img.complete) return;

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

        ctx2.drawImage(img, (p.animFrame || 0) * 16, 0, 16, 16, sx, sy, 16, 16);
        ctx2.shadowBlur = 0;
        ctx2.globalAlpha = 1.0; 

        if (p.cc && p.cc.hasResonance) {
            ctx2.fillStyle = "#FF1493"; 
            ctx2.beginPath();
            ctx2.moveTo(sx + 8, sy - 14);
            ctx2.lineTo(sx + 10, sy - 12);
            ctx2.lineTo(sx + 8, sy - 10);
            ctx2.lineTo(sx + 6, sy - 12);
            ctx2.fill();
        }

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

        if (p.pet && p.pet.active) {
            const petSx = Math.floor(p.pet.x + viewport.offset[0]);
            const petSy = Math.floor(p.pet.y + viewport.offset[1]);
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

export function drawBobber() {
    if (!hero.isFishing) return;

    const img = images.feather;
    if (img && img.complete) {
        const bob = Math.sin(Date.now() / 200) * 2;
        const shake = hero.hasBite ? (Math.random() * 4 - 2) : 0;

        const centerX = Math.floor(canvas2.width / 2);
        const centerY = Math.floor(canvas2.height / 2);

        const screenX = centerX + (hero.bobberX - (hero.x + 8));
        const screenY = centerY + (hero.bobberY - (hero.y + 14));

        ctx2.drawImage(
            img, 
            0, 0, img.width, img.height, 
            Math.floor(screenX + shake - 4), 
            Math.floor(screenY + bob - 4),   
            8, 8                             
        );
    }
}

export function drawCanopy(worldMatrix) {
    const woodsImg = images.woodsTileset2;
    if (!woodsImg || !woodsImg.complete) return;

    // Fast O(N) flat rendering for visible canopies (replaces double screen loops)
    visibleTrees.forEach(tree => {
        const drawPiece = (localId, offsetX, offsetY) => {
            const srcX = (localId % 12) * 16;
            const srcY = Math.floor(localId / 12) * 16;
            ctx2.drawImage(woodsImg, srcX, srcY, 16, 16, tree.sX + offsetX, tree.sY + offsetY, 16, 16);
        };

        drawPiece(78, 0, -32);
        drawPiece(79, 16, -32);
        drawPiece(88, 0, -16);
        drawPiece(89, 16, -16);
    });
}

export function drawProjectiles(ctx2, serverProjectilesData) {
    serverProjectilesData.forEach(p => {
        const screenX = viewport.offset[0] + p.x; 
        const screenY = viewport.offset[1] + p.y;
        
        if (p.type === 'flare') {
            ctx2.fillStyle = "#FFFFFF"; 
            ctx2.beginPath(); ctx2.arc(screenX, screenY, p.radius, 0, Math.PI * 2); ctx2.fill();
            ctx2.strokeStyle = "#FF8C00"; ctx2.lineWidth = 2; ctx2.stroke();
            
            ctx2.strokeStyle = "rgba(255, 140, 0, 0.5)";
            ctx2.beginPath();
            ctx2.moveTo(screenX, screenY);
            ctx2.lineTo(screenX - (p.dx * 15), screenY - (p.dy * 15));
            ctx2.stroke();
        }
        else if (p.type === 'zephyr') {
            ctx2.fillStyle = "rgba(150, 255, 150, 0.8)"; 
            ctx2.beginPath(); ctx2.arc(screenX, screenY, 8, 0, Math.PI * 2); ctx2.fill();
            
            ctx2.strokeStyle = "rgba(255, 255, 255, 0.6)";
            ctx2.lineWidth = 3;
            ctx2.beginPath();
            ctx2.moveTo(screenX, screenY);
            ctx2.lineTo(screenX - (p.dx * 10) + Math.sin(Date.now()/50)*5, screenY - (p.dy * 10) + Math.cos(Date.now()/50)*5);
            ctx2.stroke();
        }
        else if (p.type === 'vanguard') {
            ctx2.fillStyle = "rgba(255, 0, 255, 0.9)"; 
            ctx2.save();
            ctx2.translate(screenX, screenY);
            ctx2.rotate(Math.atan2(p.dy, p.dx));
            
            ctx2.beginPath();
            ctx2.moveTo(8, 0);
            ctx2.lineTo(0, 4);
            ctx2.lineTo(-8, 0);
            ctx2.lineTo(0, -4);
            ctx2.closePath();
            ctx2.fill();
            ctx2.restore();
        }
    });

    hero.projectiles.forEach(p => {
        const screenX = viewport.offset[0] + p.x; 
        const screenY = viewport.offset[1] + p.y;
        
        ctx2.fillStyle = "#FFD700"; 
        ctx2.beginPath(); ctx2.arc(screenX, screenY, 6, 0, Math.PI * 2); ctx2.fill();
        ctx2.strokeStyle = "#FFA500"; ctx2.lineWidth = 2; ctx2.stroke();
    });

    hero.aoeZones.forEach(z => {
        const screenX = viewport.offset[0] + z.x; 
        const screenY = viewport.offset[1] + z.y;

        if (z.type === 'radiantNova') {
            const chargePercent = 1.0 - (z.life / 0.6); 
            ctx2.strokeStyle = "rgba(255, 0, 255, 0.5)"; 
            ctx2.lineWidth = 2;
            ctx2.beginPath(); ctx2.arc(screenX, screenY, z.radius, 0, Math.PI * 2); ctx2.stroke();

            ctx2.fillStyle = `rgba(255, 255, 255, ${chargePercent})`; 
            ctx2.beginPath(); ctx2.arc(screenX, screenY, z.radius * chargePercent, 0, Math.PI * 2); ctx2.fill();
        } 
        else if (z.type === 'ringOfPenanceVis') {
            ctx2.fillStyle = "rgba(255, 215, 0, 0.3)"; 
            ctx2.strokeStyle = "rgba(255, 255, 0, 0.8)"; 
            ctx2.lineWidth = 3;
            ctx2.beginPath(); 
            ctx2.arc(screenX, screenY, z.radius, 0, Math.PI * 2); 
            ctx2.fill(); 
            ctx2.stroke();
        }
        else if (z.type === 'consecration') {
            ctx2.fillStyle = "rgba(255, 255, 200, 0.2)"; 
            ctx2.strokeStyle = "rgba(255, 215, 0, 0.6)"; 
            ctx2.lineWidth = 2;
            
            ctx2.beginPath(); 
            ctx2.arc(screenX, screenY, z.radius, 0, Math.PI * 2); 
            ctx2.fill(); 
            ctx2.stroke();

            if (z.tickTimer > 0.8) {
                ctx2.fillStyle = "rgba(255, 215, 0, 0.4)"; 
                ctx2.fill();
            }
        }
        else {
            ctx2.fillStyle = "rgba(255, 215, 0, 0.2)"; 
            ctx2.strokeStyle = "rgba(255, 140, 0, 0.5)"; 
            ctx2.lineWidth = 2;
            ctx2.beginPath(); ctx2.arc(screenX, screenY, z.radius, 0, Math.PI * 2); 
            ctx2.fill(); ctx2.stroke();
        }
    });
}

export function drawTargetCircle(ctx2, target) {
    if (!target || target.hp <= 0) return; 

    const screenX = viewport.offset[0] + target.x + 8;
    const screenY = viewport.offset[1] + target.y + 8; 

    const pulse = Math.sin(Date.now() / 150) * 2;
    const radius = 12 + pulse;

    ctx2.strokeStyle = "rgba(255, 0, 0, 0.8)"; 
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx2.stroke();
    
    if (!target.isOre) {
        drawHealthBar(ctx2, target, "#FF4444"); 
    }
}

export function drawWorkingIndicator(ctx2, workingObj) {
    if (!workingObj) return;

    const screenX = viewport.offset[0] + (workingObj.tx * 16) + 8;
    const screenY = viewport.offset[1] + (workingObj.ty * 16) + 8; 

    const pulse = Math.sin(Date.now() / 100) * 2;
    const radius = 12 + pulse;

    ctx2.strokeStyle = "rgba(255, 50, 50, 0.9)"; 
    ctx2.fillStyle = "rgba(255, 50, 50, 0.3)";
    ctx2.lineWidth = 2;
    
    ctx2.beginPath();
    ctx2.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.stroke();
}

export function drawHeroRange(ctx2, hero) {
    if (!inputState.mainBtn && !hero.isAttacking) return;

    const screenX = viewport.offset[0] + hero.x + 8;
    const screenY = viewport.offset[1] + hero.y + 8;
    const range = hero.attackRange || 32; 

    ctx2.beginPath();
    ctx2.arc(screenX, screenY, range, 0, Math.PI * 2);
    
    if (hero.target) {
        ctx2.fillStyle = "rgba(0, 150, 255, 0.15)";
        ctx2.strokeStyle = "rgba(0, 150, 255, 0.5)";
    } else {
        ctx2.fillStyle = "rgba(255, 0, 0, 0.15)";
        ctx2.strokeStyle = "rgba(255, 0, 0, 0.5)";
    }
    
    ctx2.fill();
    ctx2.lineWidth = 1;
    ctx2.stroke();
}

export function drawHealthBar(ctx, entity, color = "#00FF00") {
    const barW = 16;
    const barH = 2;
    
    let percent = 0;
    if (entity.hp !== undefined) {
        percent = entity.hp / (entity.maxHp || 100);
    } else if (entity.hunger !== undefined) {
        percent = (100 - entity.hunger) / 100;
    }

    const screenX = viewport.offset[0] + entity.x + 8 - (barW / 2);
    const screenY = viewport.offset[1] + entity.y - 4; 

    ctx.fillStyle = "black";
    ctx.fillRect(screenX, screenY, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, barW * Math.max(0, percent), barH);
}

export function drawEnergyBar(ctx, entity, color = "#FFD700") {
    if (entity.energy === undefined) return; 

    const barW = 16;
    const barH = 2;
    const percent = entity.energy / (entity.maxEnergy || 100);

    const screenX = viewport.offset[0] + entity.x + 8 - (barW / 2);
    const screenY = viewport.offset[1] + entity.y - 1; 

    ctx.fillStyle = "black";
    ctx.fillRect(screenX, screenY, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, barW * Math.max(0, percent), barH);
}

export function drawJoystick(ctxUI) {
    if (inputState.inputType === 'keyboard' || !inputState.leftJoystick.active) return;

    const { startX, startY, currX, currY } = inputState.leftJoystick;

    ctxUI.save();
    
    if (ctxUI.setLineDash) {
        ctxUI.setLineDash([]); 
    }
    
    ctxUI.beginPath();
    ctxUI.arc(startX, startY, 50, 0, Math.PI * 2);
    ctxUI.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctxUI.lineWidth = 4;
    ctxUI.stroke();

    ctxUI.beginPath();
    ctxUI.arc(currX, currY, 25, 0, Math.PI * 2);
    ctxUI.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctxUI.fill();
    
    ctxUI.restore();
}

export function drawHUDButton(ctx, x, y, radius, label, icon, isPressed, cooldown = 0, reqLevel = 0, currentLevel = 0) {
    const isLocked = currentLevel < reqLevel;
    const size = radius * 2;
    const rectX = x - radius;
    const rectY = y - radius;

    ctx.fillStyle = "#000000"; 
    ctx.fillRect(rectX, rectY, size, size);

    ctx.fillStyle = isLocked ? "#333333" : (isPressed ? "#ffffff" : (cooldown > 0 ? "#555555" : "var(--bg-panel)"));
    ctx.fillRect(rectX + 2, rectY + 2, size - 4, size - 4);

    if (!isPressed && !isLocked && cooldown === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.fillRect(rectX + 2, rectY + 2, size - 4, 2); 
        ctx.fillRect(rectX + 2, rectY + 2, 2, size - 4); 
    }

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

export function drawAbilityButtons(ctxUI) {
    if (inputState.inputType === 'keyboard') return;

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

    drawHUDButton(ctxUI, btns.SWAP.x, btns.SWAP.y, btns.SWAP.r, "SWAP", "🔄", false, 0, 0, 0);

    if (inputState.uiMode === 'combat') {
        drawHUDButton(ctxUI, btns.SKILL1.x, btns.SKILL1.y, btns.SKILL1.r, "S1", getSkillIcon(0), inputState.skill1, cd[0], reqLevels[0], currentLevel);
        drawHUDButton(ctxUI, btns.SKILL2.x, btns.SKILL2.y, btns.SKILL2.r, "S2", getSkillIcon(1), inputState.skill2, cd[1], reqLevels[1], currentLevel);
        drawHUDButton(ctxUI, btns.SKILL3.x, btns.SKILL3.y, btns.SKILL3.r, "S3", getSkillIcon(2), inputState.skill3, cd[2], reqLevels[2], currentLevel);
        drawHUDButton(ctxUI, btns.SKILL4.x, btns.SKILL4.y, btns.SKILL4.r, "ULT", getSkillIcon(3), inputState.skill4, cd[3], reqLevels[3], currentLevel);
        drawHUDButton(ctxUI, btns.MAIN.x, btns.MAIN.y, btns.MAIN.r, "ATK", "🗡️", inputState.mainBtn, 0, 0, currentLevel);
    } else {
        drawHUDButton(ctxUI, btns.INV.x, btns.INV.y, btns.INV.r, "INV", "🎒", false, 0, 0, 0);
        drawHUDButton(ctxUI, btns.WORK.x, btns.WORK.y, btns.WORK.r, "WORK", "🔨", inputState.keyF, 0, 0, 0);
        drawHUDButton(ctxUI, btns.DROP.x, btns.DROP.y, btns.DROP.r, "DROP", "⏬", inputState.drop, 0, 0, 0);
        drawHUDButton(ctxUI, btns.EAT.x, btns.EAT.y, btns.EAT.r, "EAT", "🍗", inputState.keyC, 0, 0, 0); 
        drawHUDButton(ctxUI, btns.PLANT.x, btns.PLANT.y, btns.PLANT.r, "PLANT", "🌱", inputState.keyV, 0, 0, 0);
        drawHUDButton(ctxUI, btns.INTERACT.x, btns.INTERACT.y, btns.INTERACT.r, "USE", "🖐️", inputState.interact, 0, 0, 0);
    }
}

export function drawXPStatus(ctxUI) {
    const info = getLevelInfo(hero.xp);
    const availablePoints = info.points - (hero.spentPoints || 0);

    const x = 10; 
    const y = Math.floor(canvas3.height / 2); 

    const barW = 80;
    const barH = 8;
    ctxUI.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctxUI.fillRect(x, y, barW, barH);

    const progress = Math.min(1, hero.xp / info.nextXp);
    ctxUI.fillStyle = (info.level > 0) ? "#FFD700" : "#3498db";
    ctxUI.fillRect(x, y, barW * progress, barH);

    ctxUI.fillStyle = "white";
    ctxUI.font = CONFIG.FONT_STYLE;
    ctxUI.textAlign = "left";
    ctxUI.fillText(`LVL ${info.level} - ${Math.floor(hero.xp)} XP`, x, y - 4);

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

export function drawAimIndicator(ctxUI) {
    if (!inputState.aim.active) return;

    const btns = getUIButtons();
    const cancel = btns.CANCEL;

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

    if (inputState.aim.dx !== 0 || inputState.aim.dy !== 0) {
        const screenX = viewport.offset[0] + hero.x + 8;
        const screenY = viewport.offset[1] + hero.y + 8;
        
        const skillId = hero.skills[inputState.aim.index];
        if (skillId === 'p5' || skillId === 'p14' || skillId === 'p16') { 
            const mag = inputState.aim.mag || 1.0;
            
            let range = 200;
            let radius = 32;
            let color = "0, 150, 255"; 

            if (skillId === 'p14') { range = 150; radius = 48; color = "255, 215, 0"; } 
            if (skillId === 'p16') { range = 250; radius = 64; color = "255, 140, 0"; } 
            
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

export const mapCanvas = document.createElement('canvas');
const MAP_SCALE = 1; 
mapCanvas.width = CONFIG.MAP_SIZE * MAP_SCALE;  
mapCanvas.height = CONFIG.MAP_SIZE * MAP_SCALE;
let mapCtx = mapCanvas.getContext('2d');

export function preRenderMinimap(worldMap) {
    const size = CONFIG.MAP_SIZE;
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height); 
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const val = worldMap[y * size + x];
        
            if (val === 103) mapCtx.fillStyle = "#1b0218"; 
            else if (val === 102) mapCtx.fillStyle = "#a32192"; 
            else if (val === 101) mapCtx.fillStyle = "#e74c3c"; 
            else if (val === 106) mapCtx.fillStyle = "#723d01"; 
            else if (val === 105) mapCtx.fillStyle = "#f1c40f"; 
            else if (val === 104 || val === 12) mapCtx.fillStyle = "#1e6b30"; 
            else if (val >= CONFIG.LAND_THRESHOLD) mapCtx.fillStyle = "#2ecc71"; 
            else if (val === 11) mapCtx.fillStyle = "#00FFFF"; 
            else mapCtx.fillStyle = "#3498db"; 

            mapCtx.fillRect(x, y, 1, 1);
        }
    }

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

        mapCtx.strokeStyle = "rgba(255, 255, 255, 0.9)"; 
        mapCtx.lineWidth = 1; 

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