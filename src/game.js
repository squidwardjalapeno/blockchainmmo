// src/game.js

if (typeof window !== 'undefined') {
    logStep("Modules Loaded & Parsed");
}

import { images, loadAllImages } from './assetLoader.js';
import { generateWorld, seededRandom } from './mapGenerator.js'; 
import { drawHouse, drawTemple, drawGeneralStore, drawVillageHall, drawRootCellar, drawBarn, drawRanch, drawStorageRoom, planVillage, drawBarracks, drawTwoStoryHouse, drawInn, drawMilitaryQuarters, drawBlacksmith, drawForge, drawLargeBarn, drawTownHall,  populateWorld, drawMiningArea, planTown, drawCastle, decorateCell, linkVillages, ensureLocalCells, linkLakes, drawOreDeposit, planAllSettlements, drawPlannedRanchRoads, drawRingRoads, buildPlannedStructures, buildPlannedWells, clearBlueprints, generateGlobalShorelines, drawTownWalls } from './cellDecorator.js';
import { applyShorelineRules } from './terrainRules.js';
import { inputState, initInput, handleHeroUpdate } from './input.js';
import { viewport } from './viewport.js';
import { ctx2, ctx3, canvas2, canvas3, drawMap, drawStaticObjects, drawJoystick, drawProjectiles, drawTargetCircle, drawWorkingIndicator, drawHeroRange, drawHealthBar, drawEnergyBar, drawAbilityButtons, drawXPStatus, drawAimIndicator, initRenderer, clearAll, drawAnimals, drawPlants, drawHero, drawRemotePlayers, drawBobber, preRenderMinimap, drawDroppedItems, drawCanopy, drawNightTint, drawHobbits } from './renderer.js';
import { hero, resetEntities, gameState, getFocusCoordinates } from './entities.js';
import { CONFIG } from './config.js';
import { checkCollision, getTileData } from './physics.js'; 
import { updateBacteria, seedBacteria, getBacteriaData } from './bacteria.js'; 
import { ITEM_TYPES, createItem } from './items.js';
import { updatePlants, plants } from './plants.js'; 
import { updateAnimals, animals, spawnChicken } from './animals.js';
import { scanForTarget, currentTarget, validateTarget } from './combat.js';
import { socket, initMultiplayer, playerWallet, remotePlayers, serverProjectiles, interpolateEntities } from './multiplayer.js';
import { handleInteractions, updateHeroStats, handlePvPCombat, handleFinancialActions } from './interactionManager.js';
import { initUI, updateHUD } from './uiManager.js';
import { getMasterBalance } from './blockchainManager.js';
import { worldTime } from './clock.js'; 
import { hobbits } from './hobbitCore.js';
import { updateHobbits } from './hobbitManager.js';

if (typeof window !== 'undefined') {
    logStep("overworldGame.js initialized");
}

const DEBUG_FLAGS = {
    ENABLE_PHYSICS_AND_INPUT: true,
    ENABLE_COMBAT_AND_STATS: true, 
    ENABLE_INTERACTIONS: true,
    ENABLE_WORLD_SIM: true, 
    ENABLE_MULTIPLAYER_EMIT: true,
};

let tvlTimer = 0; 
let isSyncingTVL = false; 

let worldMap = [];
export let worldMatrix = [];
export let roomMatrix = []; 
export let fertilityMatrix = [];

let bacteriaTimer = 0; 
let logicTick = 0; 
let slowTickTimer = 0; 

let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

export let isGameRunning = true; 

async function assetInit() {
    await loadAllImages();
    console.log("Hero is ready:", images.hero);
}

assetInit();

function displayBootResults() {
    const resultsDiv = document.getElementById('boot-results');
    if (!resultsDiv || !window.debugLogSteps) return;

    resultsDiv.style.display = 'block';

    let html = '<strong>BOOT SEQUENCE:</strong><br>';
    window.debugLogSteps.forEach(step => {
        html += step + "<br>";
    });

    const totalTime = window.debugLogSteps.reduce((acc, step) => {
        const time = parseFloat(step.split(': ')[1]);
        return acc + time;
    }, 0);

    html += "<strong>TOTAL: " + totalTime.toFixed(2) + "s</strong>";
    resultsDiv.innerHTML = html;
}

var reset = function () {
	resetEntities(worldMap);
	console.log("Game Reset: Hero at 500,500");
};

/**
 * ⚡ REAL-TIME UPDATE LOOP
 */
var update = function (modifier) {
    logicTick++;

    if (!isGameRunning) return;

    if (hero.hp <= 0) {
        hero.isMoving = false;
        hero.isAttacking = false;
        hero.isWindingUp = false;
        return; 
    }

    const focus = getFocusCoordinates();
    const currentCX = Math.floor(focus.x / 1600);
    const currentCY = Math.floor(focus.y / 1600);

    // Track when coordinates enter a new cell sector to trigger banner banners
    if (!gameState.lastLoggedCell || gameState.lastLoggedCell.cx !== currentCX || gameState.lastLoggedCell.cy !== currentCY) {
        gameState.lastLoggedCell = { cx: currentCX, cy: currentCY };
        const globalIdx = currentCY * CONFIG.MAP_SIZE + currentCX;
        const cellType = worldMap[globalIdx];
        import('./uiManager.js').then(m => m.triggerLocationBanner(currentCX, currentCY, cellType));
    }

    // ==========================================
    // ⚡ HIGH-FREQUENCY LOOP (Runs on every frame / 60+ FPS)
    // ==========================================
    if (DEBUG_FLAGS.ENABLE_PHYSICS_AND_INPUT) {
        ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        handleHeroUpdate(modifier, worldMatrix, roomMatrix);
        
        // 🎯 LERP HOBBIT PHYSICS: Calculate Hobbit steps smoothly at 60 FPS
        if (DEBUG_FLAGS.ENABLE_WORLD_SIM) {
            updateHobbits(modifier, worldMatrix, roomMatrix); 
        }
    }

    // 🎯 LERP INTERPOLATION ENGINE: Glides entities smoothly on every single frame
    interpolateEntities(modifier);
    
    // ==========================================
    // 🐢 MEDIUM-FREQUENCY LOOP (Runs every 3 frames)
    // ==========================================
    if (logicTick % 3 === 0) {
        if (DEBUG_FLAGS.ENABLE_COMBAT_AND_STATS) {
            updateHeroStats(modifier * 3, hero);
            validateTarget(hero);
            handlePvPCombat(modifier * 3, worldMatrix, roomMatrix, hero, remotePlayers);
        }

        if (DEBUG_FLAGS.ENABLE_INTERACTIONS) {
            handleInteractions(modifier * 3, worldMatrix, roomMatrix, fertilityMatrix);
        }

        if (DEBUG_FLAGS.ENABLE_MULTIPLAYER_EMIT) {
            const tileInfo = getTileData(hero.x + 8, hero.y + 8, worldMatrix, roomMatrix);

            if (socket && socket.connected) {
                socket.emit('movement', {
                    x: hero.x,
                    y: hero.y,
                    dir: hero.dir,
                    animFrame: hero.frame,
                    isMoving: hero.isMoving,
                    isWindingUp: hero.isWindingUp,
                    isLunge: (hero.attackTimer < 0 && hero.attackTimer < -1.5), 
                    currentTileID: tileInfo.tileID,
                    pet: hero.pet
                });
            }
        }
        
        // Logical background updates (no visual snapping math)
        if (DEBUG_FLAGS.ENABLE_WORLD_SIM) {
            updateAnimals(modifier * 3, worldMatrix, roomMatrix); 
        }
    }

    // ==========================================
    // 🐢 SLOW-TICK LOOP (Runs once per second)
    // ==========================================
    slowTickTimer += modifier;
    if (slowTickTimer >= 1.0) { 

        worldTime.minute += 8; 
        if (worldTime.minute >= 60) {
            worldTime.minute = 0;
            worldTime.hour++;
            if (worldTime.hour >= 24) {
                worldTime.hour = 0;
            }
        }
        worldTime.isNight = (worldTime.hour >= 20 || worldTime.hour < 6); 

        if (DEBUG_FLAGS.ENABLE_WORLD_SIM) {
            updatePlants(1.0, fertilityMatrix, worldMatrix, roomMatrix); 
            updateBacteria(worldMatrix, fertilityMatrix);
        }

        import('./fish.js').then(m => m.updateGlobalPopulation(1.0));
        slowTickTimer = 0; 
    }

    // UI Updates
    if (logicTick % 60 === 0) {
        updateHUD();
        if (!isSyncingTVL) syncTVL();
    }
};

/**
 * 🏛️ Blockchain TVL Query Handshake
 */
async function syncTVL() {
    if (isSyncingTVL) return;
    isSyncingTVL = true;
    try {
        const balance = await getMasterBalance();
        gameState.tvl = balance; 
    } catch (e) {
        console.warn("TVL Sync Error:", e);
    } finally {
        isSyncingTVL = false;
    }
}

/**
 * ⚡ CANVAS DRAW PIPELINE
 */
var render = function () {
    clearAll(); 
    const focus = getFocusCoordinates();
    viewport.update(focus.x + 8, focus.y + 8);

    // Pass 1: Draw Terrain Map
    drawMap(worldMatrix, roomMatrix); 
    
    // Pass 2: Draw Static Wells and Trees
    drawStaticObjects();                       
    
    // Pass 3: Draw Agricultural Flora and Crops
    drawPlants(roomMatrix); 
    
    // Pass 4: Draw Dropped Backpack items, Eggs, and Mulch
    drawDroppedItems();
    
    // Pass 5: Draw Pasture Animals (Chickens)
    drawAnimals(); 
    
    // Pass 6: Draw Environmental Night Mask
    drawNightTint();                           

    // Pass 7: Draw Targeted Highlights
    if (hero.target) drawTargetCircle(ctx2, hero.target);
    drawWorkingIndicator(ctx2, hero.workingObj);
    drawHeroRange(ctx2, hero);
    
    // Pass 8: Draw Projectile and Spell Animations
    drawProjectiles(ctx2, serverProjectiles);
    
    // Pass 9: Draw Remote players
    drawRemotePlayers(ctx2, remotePlayers, roomMatrix); 
    
    // Pass 10: Draw Settlement Hobbits
    drawHobbits(ctx2, hobbits, roomMatrix);    
    
    // Pass 11: Draw Player Hero Sprite and held items
    drawHero(); 
    
    // Pass 12: Draw Fishing Bobbers and Lines
    drawBobber();
    
    // Pass 13: Draw Leafy Overhead Canopies
    drawCanopy(worldMatrix);

    // Pass 14: Draw HUD Joystick overlays
    drawJoystick(ctx3); 
    drawAbilityButtons(ctx3);
    drawAimIndicator(ctx3);
    drawXPStatus(ctx3);
    if (hero.charClass !== 'Overseer') {
        drawHealthBar(ctx3, hero, "#00FF00");
        drawEnergyBar(ctx3, hero, "#FFD700");
    }

    ctx3.fillStyle = CONFIG.UI_COLOR;
    ctx3.font = CONFIG.FONT_STYLE;
    ctx3.textAlign = "right"; 
    
    const tileX = Math.floor((hero.x + 8) / 16);
    const tileY = Math.floor((hero.y + 8) / 16);
    
    ctx3.fillText(`PVP MODE | X: ${tileX}, Y: ${tileY}`, canvas3.width - 10, 65);
    ctx3.textAlign = "left";
};

/**
 * ⚡ MAIN INITIALIZATION ROUTINE (Includes accurate performance markers)
 */
async function mainInit() {
    try {
        logStep("1. Init Input...");
        initInput(canvas3); 
        
        logStep("2. Waiting on Multiplayer...");
        await initMultiplayer(); 
        
        logStep("3. Waiting on Images...");
        await loadAllImages(); 
        
        logStep("4. Init Renderer...");
        initRenderer(); 

        logStep("5. Generating World...");
        const rawShape = generateWorld(CONFIG.MAP_SIZE, CONFIG.MAP_SIZE, 800);
        worldMap = rawShape;
        window.worldMap = worldMap; 

        const worldData = populateWorld(worldMap); 
        worldMatrix = worldData.worldMatrix;
        roomMatrix = worldData.roomMatrix;
        fertilityMatrix = worldData.fertilityMatrix;

        import('./multiplayer.js').then(m => {
            m.setWorldMatrix(worldMatrix);
        });

        const measureStep = async (name, fn) => {
            logStep(name + "..."); 
            await new Promise(resolve => setTimeout(resolve, 20)); 
            const t0 = performance.now();
            await fn(); 
            const t1 = performance.now();
            logStep("--> DONE [" + ((t1 - t0) / 1000).toFixed(2) + "s]"); 
            
            const term = document.getElementById('debug-terminal');
            if (term) term.scrollTop = term.scrollHeight;
        };

        logStep("Step 1: Continents & Biomes (Handled in populateWorld)");

        await measureStep("Step 2: Drawing Global Shorelines", () => {
            generateGlobalShorelines(worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        });

        await measureStep("Step 3: Drawing Rivers & Main Village Roads", () => {
            linkLakes(worldMap, worldMatrix, roomMatrix, fertilityMatrix);
            linkVillages(worldMap, worldMatrix, roomMatrix, fertilityMatrix);
        });

        await measureStep("Step 4: Planning Houses, Ranches, and Storage", () => {
            planAllSettlements(worldMap, worldMatrix, roomMatrix, fertilityMatrix);
        });

        await measureStep("Step 5: Cleaning up Blueprints", () => {
            clearBlueprints(roomMatrix);
        });

        logStep("8. Pre-rendering...");
        preRenderMinimap(worldMap); 
        resetEntities(worldMap); 
        ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 

        // Set starting location coordinates safely inside our debug village
        const chunkX = Math.floor(hero.x / 1600);
        const chunkY = Math.floor(hero.y / 1600);
        const gridX = (chunkX * 100) + 50;
        const gridY = (chunkY * 100) + 50;
        
        hero.x = gridX * 16;
        hero.y = (gridY + 10) * 16; 

        logStep("9. Init UI...");
        initUI(); 
        
        logStep("10. STARTING LOOP!");
        
        const term = document.getElementById('debug-terminal');
        if (term) term.style.display = 'none';
        
        isGameRunning = true;
        main(); 
    } catch (err) {
        logStep("CRASH: " + err.message);
    }
}

window.addEventListener('resize', () => {
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
});

function main() {
    const ts = Date.now();
    const delta = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;

    frameCount++;
    if (ts - lastFpsUpdate > 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = ts;
    }

    const safeDelta = Math.min(delta, 0.1); 

    update(safeDelta);
    render(); 

    ctx3.fillStyle = "white";
    ctx3.font = "12px 'Press Start 2P'";
    ctx3.textAlign = "center";
    ctx3.fillText("FPS: " + currentFps, canvas3.width / 2, 20);
    ctx3.textAlign = "left"; 
    
    window.requestAnimationFrame(main);
}

let lastTimestamp = Date.now();

mainInit();