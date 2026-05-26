// src/game.js

// THIS SHOULD BE THE VERY FIRST LINE OF THIS FILE
if (typeof window !== 'undefined') logStep("Modules Loaded & Parsed");
// js/game.js
import { images, loadAllImages } from './assetLoader.js';
import { generateWorld, seededRandom } from './mapGenerator.js'; 
import { drawHouse, drawTemple, drawGeneralStore, drawVillageHall, drawRootCellar, drawBarn, drawRanch, drawStorageRoom, planVillage, drawBarracks, drawTwoStoryHouse, drawInn, drawMilitaryQuarters, drawBlacksmith, drawForge, drawLargeBarn, drawTownHall,  populateWorld, drawMiningArea, planTown, drawCastle, decorateCell, linkVillages, ensureLocalCells, linkLakes, drawOreDeposit, planAllSettlements, drawPlannedRanchRoads, drawRingRoads, buildPlannedStructures, buildPlannedWells, clearBlueprints, generateGlobalShorelines, drawTownWalls } from './cellDecorator.js';
import { applyShorelineRules } from './terrainRules.js';
import { inputState, initInput, handleHeroUpdate } from './input.js';
import { viewport } from './viewport.js';
import { ctx2, ctx3, canvas2, canvas3, drawMap, drawHobbits, drawStaticObjects, drawJoystick, drawProjectiles, drawTargetCircle, drawWorkingIndicator, drawHeroRange, drawHealthBar, drawEnergyBar, drawAbilityButtons, drawXPStatus, drawAimIndicator, initRenderer, clearAll, drawAnimals, drawPlants, drawHero, drawRemotePlayers, drawBobber, preRenderMinimap, drawDroppedItems, drawCanopy } from './renderer.js';
import { hero, resetEntities, gameState } from './entities.js';
import { CONFIG } from './config.js'
import { checkCollision, getTileData } from './physics.js'; 
import { updateBacteria, seedBacteria, getBacteriaData } from './bacteria.js'; 
import { ITEM_TYPES, createItem } from './items.js';
import { updatePlants, plants } from './plants.js'; 
import { updateAnimals, animals, spawnChicken } from './animals.js';
import { scanForTarget, currentTarget, validateTarget } from './combat.js';
import { socket, initMultiplayer, playerWallet, remotePlayers, serverProjectiles, updateRemotePlayers } from './multiplayer.js';
import { handleInteractions, updateHeroStats, handlePvPCombat, handleFinancialActions } from './interactionManager.js';
import { initUI, updateHUD } from './uiManager.js';
import { getMasterBalance } from './blockchainManager.js';
import { updateHobbits, hobbits } from './hobbits.js';
// js/overworldGame.js

const DEBUG_FLAGS = {
    ENABLE_PHYSICS_AND_INPUT: true,
    ENABLE_COMBAT_AND_STATS: true, // Re-enabled for PC build
    ENABLE_INTERACTIONS: true,
    ENABLE_WORLD_SIM: true, 
    ENABLE_MULTIPLAYER_EMIT: true,
};

// To this:
if (typeof window !== 'undefined') {
    logStep("overworldGame.js");
}

let tvlTimer = 0; // 🆕 Timer for TVL sync
let isSyncingTVL = false; 


// Create a variable to hold your map data globally
if (window.updateDebug) window.updateDebug("2. JS PARSED. STARTING INIT...");

let worldMap = [];

let worldMatrix = [];
let roomMatrix = []; 
let fertilityMatrix = [];

let bacteriaTimer = 0; // Tracks time until the next tick

let logicTick = 0; 
let slowTickTimer = 0; // 👈 NEW: Tracks time for our 1 FPS loop

// ADD THESE THREE LINES FOR FPS COUNTING
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

export let isGameRunning = true; 

// 🚨 Reverted loadAllImages to async/await for PC build
async function assetInit() {
    await loadAllImages();
    console.log("Hero is ready:", images.hero);
}

assetInit();
console.log("hellowrold");

function displayBootResults() {
    const resultsDiv = document.getElementById('boot-results');
    if (!resultsDiv || !window.debugLogSteps) return;

    resultsDiv.style.display = 'block';

    let html = '<strong>BOOT SEQUENCE:</strong><br>';
    window.debugLogSteps.forEach(step => {
        html += `${step}<br>`;
    });

    const totalTime = window.debugLogSteps.reduce((acc, step) => {
        const time = parseFloat(step.split(': ')[1]);
        return acc + time;
    }, 0);

    html += `<strong>TOTAL: ${totalTime.toFixed(2)}s</strong>`;

    resultsDiv.innerHTML = html;
}

// Reset the game
var reset = function () {
	resetEntities(worldMap);
	console.log("Game Reset: Hero at 500,500");
};

var update = function (modifier) {
    logicTick++;

    if (!isGameRunning) return;

    if (hero.hp <= 0) {
        hero.isMoving = false;
        hero.isAttacking = false;
        hero.isWindingUp = false;
        return; 
    }

    // 👇 NEW: Location Banner Tracker
    const currentCX = Math.floor(hero.x / 1600);
    const currentCY = Math.floor(hero.y / 1600);

    // If we just spawned in, or crossed the border into a new chunk
    if (!gameState.lastLoggedCell || gameState.lastLoggedCell.cx !== currentCX || gameState.lastLoggedCell.cy !== currentCY) {
        gameState.lastLoggedCell = { cx: currentCX, cy: currentCY };
        
        // Grab the blueprint data for this chunk
        const globalIdx = currentCY * CONFIG.MAP_SIZE + currentCX;
        const cellType = worldMap[globalIdx];
        
        import('./uiManager.js').then(m => m.triggerLocationBanner(currentCX, currentCY, cellType));
    }

    // ==========================================
    // ⚡ REAL-TIME LOOP (Runs every frame)
    // ==========================================
    if (DEBUG_FLAGS.ENABLE_PHYSICS_AND_INPUT) {
        ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
        handleHeroUpdate(modifier, worldMatrix, roomMatrix);
    }

    // 👇 NEW: Smoothly interpolate remote players!
    updateRemotePlayers(modifier);
    
    if (logicTick % 3 === 0) {
        // Fast Combat & Interactions
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
                    x: hero.x, y: hero.y, dir: hero.dir, animFrame: hero.frame,
                    isMoving: hero.isMoving, isWindingUp: hero.isWindingUp,
                    currentTileID: tileInfo.tileID, pet: hero.pet
                });
            }
        }
        
        // 👇 THE FIX: Let chickens run smoothly here (Removed the 'false' arg)
        if (DEBUG_FLAGS.ENABLE_WORLD_SIM) {
            updateAnimals(modifier * 3, worldMatrix, roomMatrix); 
            updateHobbits(modifier * 3, worldMatrix, roomMatrix); // 👈 ADDED HERE

        }
    }

    // ==========================================
    // 🐢 SLOW-TICK LOOP (Runs once per second)
    // ==========================================
    slowTickTimer += modifier;
    if (slowTickTimer >= 1.0) { 
        
        if (DEBUG_FLAGS.ENABLE_WORLD_SIM) {
            updatePlants(1.0, fertilityMatrix, worldMatrix, roomMatrix); 
            updateBacteria(worldMatrix, fertilityMatrix);
            // 👇 THE FIX: Removed updateAnimals from here!
        }

        // 🐟 TASK 4: Replenish the global fish population!
        import('./fish.js').then(m => m.updateGlobalPopulation(1.0));
                
        slowTickTimer = 0; 
    }

    // UI Updates
    handleFinancialActions();
    if (logicTick % 60 === 0) {
        updateHUD();
        if (!isSyncingTVL) syncTVL();
    }
};

async function syncTVL() {
    /*
    if (isSyncingTVL) return;
    isSyncingTVL = true;
    
    try {
        // Fetch the real TVL from the blockchain!
        const balance = await getMasterBalance();
        gameState.tvl = balance; 
    } catch (e) {
        console.warn("TVL Sync Error:", e);
    } finally {
        isSyncingTVL = false;
    }
        */
}


var render = function () {
    clearAll(); 
    viewport.update(hero.x + 8, hero.y + 8);

    drawMap(worldMatrix, roomMatrix); 

    drawStaticObjects();                       // Pass 1.5: Draw Static Overlays (Wells & Trees) 👈 ADDED HERE


    // 👇 PASS ROOM MATRIX HERE 👇
    drawPlants(roomMatrix); 

    // 👇 ADD THIS LINE: Draw poop, dead grass, and dropped items!
    drawDroppedItems();


    // 👇 ADD THIS LINE to actually draw the flock to the screen!
    drawAnimals(); 

    drawHobbits(ctx2, hobbits);                // 👈 ADDED HERE


    // 👇 MOBA FIX: Only draw the red circle when we are locked onto an enemy!
    if (hero.target) drawTargetCircle(ctx2, hero.target);

    // 👇 NEW: Draw the pulsing red circle over an anvil/smelter if we are working it!
    drawWorkingIndicator(ctx2, hero.workingObj);
    
    // 👇 NEW: Draw Hero's Attack Range underneath the hero
    drawHeroRange(ctx2, hero);

    // 👇 ADD THIS TO DRAW YOUR FLYING SKILLSHOTS!
    drawProjectiles(ctx2, serverProjectiles);


    drawRemotePlayers(ctx2, remotePlayers);
    drawHero(); 
    drawBobber();
    // 👇 ADD THIS LINE: Draw the leaves over the players' heads!
    drawCanopy(worldMatrix);

    drawJoystick(ctx3); // Placeholder for touch/gamepad on PC
    drawAbilityButtons(ctx3);

    // 👇 ADD THIS TO DRAW THE BLUE AIM UI & CANCEL BUTTON!
    drawAimIndicator(ctx3);
    
    drawXPStatus(ctx3);
    drawHealthBar(ctx3, hero, "#00FF00");
    drawEnergyBar(ctx3, hero, "#FFD700");

    ctx3.fillStyle = CONFIG.UI_COLOR;
    ctx3.font = CONFIG.FONT_STYLE;
    
    // 👈 Align right, underneath the Fish and TGV boxes
    ctx3.textAlign = "right"; 
    
    const tileX = Math.floor((hero.x + 8) / 16);
    const tileY = Math.floor((hero.y + 8) / 16);
    
    // 👇 Nudged Y down to 65 so it sits right beneath the new HTML UI!
    ctx3.fillText(`PVP MODE | X: ${tileX}, Y: ${tileY}`, canvas3.width - 10, 65);
    
    // Reset text alignment so we don't mess up other UI elements
    ctx3.textAlign = "left";



    /*
    // ==========================================
    // 🚨 FERTILITY X-RAY DEBUGGER 🚨
    // ==========================================
    const left = 3, right = 12, top = 10, bottom = 15;
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    
    // The screen coordinate of your hero's top-left pixel
    const sX = centerX - 8; 
    const sY = centerY - 8;

    // 1. Draw Hero Hitboxes
    ctx3.strokeStyle = "rgba(255, 255, 0, 0.8)";
    ctx3.lineWidth = 1;
    ctx3.strokeRect(sX, sY, 16, 16);
    ctx3.strokeStyle = "rgba(0, 255, 255, 0.8)";
    ctx3.strokeRect(sX + left, sY + top, right - left, bottom - top);

    // 2. Highlight surrounding Tile Grid and print FERTILITY
    const hTX = Math.floor(hero.x / 16);
    const hTY = Math.floor(hero.y / 16);
    ctx3.font = "8px Arial";
    ctx3.textAlign = "center";
    
    // 7x7 Grid to see the ecosystem around you
    for(let i = -3; i <= 3; i++) {
        for(let j = -3; j <= 3; j++) {
            const tilePX = (hTX + i) * 16;
            const tilePY = (hTY + j) * 16;
            
            // Translate world coordinates to screen coordinates
            const tileScreenX = centerX + (tilePX - hero.x) - 8;
            const tileScreenY = centerY + (tilePY - hero.y) - 8;
            
            // Draw Magenta Tile Boundaries
            ctx3.strokeStyle = "rgba(255, 0, 255, 0.1)"; 
            ctx3.strokeRect(tileScreenX, tileScreenY, 16, 16);
            
            // Fetch Fertility Data
            const cx = Math.floor(tilePX / 1600);
            const cy = Math.floor(tilePY / 1600);
            const lx = ((Math.floor(tilePX / 16) % 100) + 100) % 100;
            const ly = ((Math.floor(tilePY / 16) % 100) + 100) % 100;
            const idx = (ly * 100) + lx;
            
            let fVal = 0;
            if (fertilityMatrix[cx] && fertilityMatrix[cx][cy]) {
                fVal = fertilityMatrix[cx][cy][idx];
            }
            
            // Tint the ground based on fertility!
            if (fVal > 0) {
                // F:12 will be mildly green. F:150 (poop/compost) will be bright neon green!
                const greenAlpha = Math.min(0.6, fVal / 50);
                ctx3.fillStyle = `rgba(0, 255, 0, ${greenAlpha})`; 
                ctx3.fillRect(tileScreenX, tileScreenY, 16, 16);
            } else {
                // Dead soil = slight red tint
                ctx3.fillStyle = "rgba(255, 0, 0, 0.2)";
                ctx3.fillRect(tileScreenX, tileScreenY, 16, 16);
            }

            // Print Exact Fertility Value
            // Adding a black stroke makes the text pop over any background
            ctx3.strokeStyle = "black";
            ctx3.lineWidth = 2;
            ctx3.strokeText(Math.floor(fVal), tileScreenX + 8, tileScreenY + 11);
            
            ctx3.fillStyle = "white";
            ctx3.fillText(Math.floor(fVal), tileScreenX + 8, tileScreenY + 11);
        }
    }
        */
};

// 🚨 Reverted mainInit to async/await for PC build
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
        window.worldMap = worldMap; // 👈 Add this line here!

        const worldData = populateWorld(worldMap); 
        worldMatrix = worldData.worldMatrix;
        roomMatrix = worldData.roomMatrix;
        fertilityMatrix = worldData.fertilityMatrix;

        // ==========================================
        // 🏗️ THE PERFECT 8-STEP GENERATION PIPELINE
        // ==========================================

        // ==========================================
        // 🏗️ THE PERFECT 9-STEP GENERATION PIPELINE
        // ==========================================

        // ==========================================
        // 👑 THE ULTIMATE GENERATION PIPELINE
        // ==========================================

        // ==========================================
        // 👑 THE ULTIMATE GENERATION PIPELINE
        // ==========================================

        // ==========================================
        // ⏱️ PROFILING HELPER
        // ==========================================
        // ==========================================
        // ⏱️ PROFILING HELPER (With DOM Yielding)
        // ==========================================
        const measureStep = async (name, fn) => {
            // 1. Print the starting message
            logStep(name + "..."); 
            
            // 2. Force the browser to pause for 20ms to actually draw the text to the screen!
            await new Promise(resolve => setTimeout(resolve, 20)); 
            
            // 3. Run the heavy math
            const t0 = performance.now();
            await fn(); 
            const t1 = performance.now();
            
            // 4. Print the completion time
            logStep(`--> DONE [${((t1 - t0) / 1000).toFixed(2)}s]`); 
            
            // Scroll the terminal to the bottom so we always see the newest text
            const term = document.getElementById('debug-terminal');
            if (term) term.scrollTop = term.scrollHeight;
        };

        // ==========================================
        // 👑 THE ULTIMATE GENERATION PIPELINE
        // ==========================================

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


        await measureStep("Step 9: Cleaning up Blueprints", () => {
            clearBlueprints(roomMatrix);
        });
        /*
        */
        // ==========================================

        // ==========================================

        // ==========================================

        // ==========================================

        // ==========================================

        logStep("8. Pre-rendering...");
        preRenderMinimap(worldMap); 
        resetEntities(worldMap); 
        ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap); 

        // 👇 OPTIONAL DEBUG: Force a town exactly at spawn
        const chunkX = Math.floor(hero.x / 1600);
        const chunkY = Math.floor(hero.y / 1600);
        const gridX = (chunkX * 100) + 50;
        const gridY = (chunkY * 100) + 50;
        
        hero.x = gridX * 16;
        hero.y = (gridY + 10) * 16; // Start slightly south of the center
        // 👆 ------------------------------------------- 👆



        logStep("9. Init UI...");
        initUI(); 
        
        logStep("10. STARTING LOOP!");
        
        const term = document.getElementById('debug-terminal');
        if (term) term.style.display = 'none';
        
        isGameRunning = true;
        main(); // Start the main game loop
    } catch (err) {
        logStep("CRASH: " + err.message);
    }
}

// Inside src/game.js
// At the bottom of src/game.js (Inside the window.addEventListener('resize'...) block)

window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const zoom = CONFIG.ZOOM;

    // 🎯 Only resize active Game World (canvas2) and UI (canvas3) layers
    [canvas2, canvas3].forEach(c => {
        c.width = Math.floor(w / zoom);
        c.height = Math.floor(h / zoom);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
    });

    viewport.screen = [Math.floor(w / zoom), Math.floor(h / zoom)];

    // 🎯 Set smoothing properties only on active contexts
    [ctx2, ctx3].forEach(c => {
        c.imageSmoothingEnabled = false;
        c.webkitImageSmoothingEnabled = false;
        c.mozImageSmoothingEnabled = false; 
    });
});

// The main game loop for PC (using requestAnimationFrame)
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
    
    // 👈 Top Middle Alignment
    ctx3.textAlign = "center";
    ctx3.fillText("FPS: " + currentFps, canvas3.width / 2, 20);
    ctx3.textAlign = "left"; // Reset 
    
    window.requestAnimationFrame(main);
}

let lastTimestamp = Date.now();

mainInit(); // Start the PC initialization