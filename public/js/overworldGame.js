
// js/game.js
import { images, loadAllImages } from './assetLoader.js';
import { generateWorld } from './mapGenerator.js'; // Add this line
import { drawHouse, drawVillage, populateWorld, drawMiningArea, drawTown, drawCastle, decorateCell, linkVillages, ensureLocalCells } from './cellDecorator.js';
import { applyShorelineRules } from './terrainRules.js';
import { inputState, initInput, handleHeroUpdate } from './input.js';
import { viewport } from './viewport.js';
import { ctx, ctx2, ctx3, canvas, canvas2, canvas3, drawMap, drawJoystick, drawProjectiles, drawTargetCircle, drawHealthBar, drawAbilityButtons, drawXPStatus, initRenderer, clearAll, drawAnimals, drawHero, drawBobber, preRenderMinimap, drawMinimap } from './renderer.js';
import { hero, resetEntities, gameState } from './entities.js';
import { CONFIG } from './config.js'
import { checkCollision, getTileData } from './physics.js'; 
import { updateBacteria, seedBacteria, getBacteriaData } from './bacteria.js'; // Import the new system
import { ITEM_TYPES, createItem } from './items.js';
import { updatePlants, createGrass, plants } from './plants.js'; 
import { updateAnimals, animals, spawnChicken } from './animals.js';
import { findPriorityTarget, currentTarget, validateTarget } from './combat.js';
import { socket, initMultiplayer, drawRemotePlayers, pendingVouchers, playerWallet, remotePlayers } from './multiplayer.js';
import { handleInteractions, updateHeroStats, handlePvPCombat, handleFinancialActions } from './interactionManager.js';
import { redeemAllVouchers, refreshOnChainPoints, withdrawPoints } from './blockchainManager.js';

// Create a variable to hold your map data globally

let worldMap = [];

let worldMatrix = [];
let roomMatrix = []; 
let fertilityMatrix = [];

let bacteriaTimer = 0; // Tracks time until the next tick

async function assetInit() {
    // Wait here until loader.js says everything is finished
    await loadAllImages();
    // Now you can safely use your images!
    console.log("Hero is ready:", images.hero);
    // Start your loop
    // mainLoop(); 
}

assetInit();
console.log("hellowrold");

// Reset the game
var reset = function () {
	
	resetEntities(worldMap); // Pass your canvas size
	console.log("Game Reset: Hero at 500,500");

};

// js/game.js

var update = function (modifier) {

    // LOG A: The "Start" value (Should be 0 from the previous frame)
    //if (hero.isWindingUp) console.log("START OF UPDATE:", hero.attackTimer);

    // 🛡️ THE DEATH GUARD
    if (hero.hp <= 0) {
        hero.isMoving = false;
        hero.isAttacking = false;
        hero.isWindingUp = false;
        // Skip the rest of the update so they can't move or punch
        return; 
    }

    // 1. UNIFIED HERO SENSOR & CELL LOADING
    const heroTX = Math.floor((hero.x + 8) / 16);
    const heroTY = Math.floor((hero.y + 14) / 16);
    ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap);

    // 2. MOVEMENT & POSITION SYNC
    handleHeroUpdate(modifier, worldMatrix, roomMatrix);

    // 3. PASSIVE STATS (Decay & Cooldowns)
    updateHeroStats(modifier, hero);

    // 2. PVP COMBAT ENGINE
    // ✅ CALL IT HERE: Clean up the target state BEFORE processing attacks
    validateTarget(hero);

    // 4. BARE BONES PVP COMBAT
    // We pass remotePlayers instead of animals
    handlePvPCombat(modifier, worldMatrix, roomMatrix, hero, remotePlayers);

    // 5. WORLD SIMULATION (Plants/Bacteria)
    updatePlants(modifier, fertilityMatrix); 
    
    bacteriaTimer += modifier;
    if (bacteriaTimer >= (CONFIG.BACTERIA_TICK_RATE / 1000)) {
        updateBacteria(worldMatrix, fertilityMatrix);
        bacteriaTimer = 0;
    }

    // 6. FINANCIAL ACTIONS
    handleFinancialActions();

    // 7. MULTIPLAYER EMIT (Tell the server your new state)
    // Inside your update function in game.js
const tileInfo = getTileData(hero.x + 8, hero.y + 14, worldMatrix, roomMatrix);

if (socket && socket.connected) {
    socket.emit('movement', {
        x: hero.x,
        y: hero.y,
        dir: hero.dir,
        animFrame: hero.frame,
        isMoving: hero.isMoving,
        isWindingUp: hero.isWindingUp,
        currentTileID: tileInfo.tileID // 👈 ADD THIS LINE
    });
}

    // LOG B: The "End" value (Should be 0.016 higher than Start)
    //if (hero.isWindingUp) console.log("END OF UPDATE:", hero.attackTimer);

};


// js/game.js

var render = function () {
    clearAll(); 
    viewport.update(hero.x + 8, hero.y + 14);

    // LAYER 1: Ground
    drawMap(worldMatrix, roomMatrix); 

    // LAYER 2: Entities
    // 1. Target Ring goes UNDER players
    if (currentTarget) {
        drawTargetCircle(ctx2, currentTarget); 
    }

    // 2. Other Players
    drawRemotePlayers(ctx2);

    // 3. Local Hero
    drawHero(); 
    drawBobber(); // Keep fishing for now

    // LAYER 3: UI/HUD
    drawMinimap(ctx3);
    drawJoystick(ctx3);
    drawAbilityButtons(ctx3);

    drawXPStatus(ctx3);        // New Status/Upgrade UI
    // Self Health Bar (UI Layer)
    drawHealthBar(ctx3, hero, "#00FF00");

    // Debug Text
    ctx3.fillStyle = CONFIG.UI_COLOR;
    ctx3.font = CONFIG.FONT_STYLE;
    const tileX = Math.floor((hero.x + 8) / 16);
    const tileY = Math.floor((hero.y + 14) / 16);
    ctx3.fillText(`PVP MODE | X: ${tileX}, Y: ${tileY}`, 4, 64);
};

async function waitImages() {
    initInput(canvas3);
    initMultiplayer();
    await loadAllImages();
    initRenderer();

    // 1. GENERATE (The heavy math)
const rawShape = generateWorld(CONFIG.MAP_SIZE, CONFIG.MAP_SIZE, 800);

// 2. ASSIGN (Save it to your global variable immediately)
worldMap = rawShape; 

// 4. POPULATE (Build the world buffers)
const worldData = populateWorld(worldMap);

// 5. LINK THE REST
worldMatrix = worldData.worldMatrix; 
roomMatrix = worldData.roomMatrix; 
fertilityMatrix = worldData.fertilityMatrix;


// ✅ New: Add the fertilityMatrix to the call
linkVillages(worldMap, worldData.worldMatrix, worldData.roomMatrix, worldData.fertilityMatrix); 

// 3. BAKE (Create the minimap image using the saved map)
preRenderMinimap(worldMap); 






    // 2. SPAWN THE HERO
    reset(); 
    // --- 🏁 THE CRITICAL FIX ---
    // Force the engine to "bake" the cells around the hero IMMEDIATELY.
    // Otherwise, the next lines (drawTown, createGrass) will try to write to 'null'.
    ensureLocalCells(hero, worldMatrix, roomMatrix, fertilityMatrix, worldMap);
    // ---------------------------
    // 3. STARTER LOGIC (Now safe because the floor exists!)
    const hx = Math.floor(hero.x / 16);
    const hy = Math.floor(hero.y / 16);

    console.log("🌱 Planting starter grass around hero...");
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            createGrass(hx + ox, hy + oy, fertilityMatrix);
        }
    }

    //spawnChicken(hx + 20, hy + 20);
    // Careful with drawTown here—ensure the offset doesn't push it 
    // into a cell that isn't baked yet. 
    // (Luckily, ensureLocalCells handles the 3x3 area around hero).
    drawHouse(hx - 20, hy - 20, worldMatrix, roomMatrix, fertilityMatrix);

    // 5. Start the loop
    main(); 
}

// js/game.js
window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 1. Sync Canvas Pixels
    [canvas, canvas2, canvas3].forEach(c => {
        c.width = w;
        c.height = h;
    });

    // 2. Sync Viewport Data
    viewport.screen = [w, h];

    // 3. Restore Pixel Art Crispness
    [ctx, ctx2, ctx3].forEach(c => {
        c.imageSmoothingEnabled = false;
    });

    console.log(`🔄 Window Resized: ${w}x${h}. Camera recentered.`);
});
// The main game loop
function main(timestamp) {

    const ts = timestamp || performance.now();
	const delta = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;

	update(delta);
	render(); 
	// Request to do this again ASAP
	requestAnimationFrame(main);
};
let lastTimestamp = 0;
// Let's play this game!
waitImages();