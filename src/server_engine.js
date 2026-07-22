// server_engine.js
// Modern ES Module setup for the authoritative dual-loop server simulation

import { CONFIG } from './src/config.js';

// --- AUTHORITATIVE STATE DB ---
const players = new Map();       // Active players (HOT or WARM depending on proximity)
const projectiles = new Map();   // Active combat skillshots (Always HOT)
const hobbits = new Map();       // Village units (WARM or COLD HEARTBEAT depending on proximity)
const serverPlants = new Map();  // Crops (WARM or COLD depending on proximity)

// --- INPUT BUFFER ---
// Stores incoming player inputs to be processed sequentially in the 30Hz loop
const inputBuffers = new Map(); 

// --- DUAL-LOOP CONFIGURATION ---
const COMBAT_TICK_RATE = 33.33; // ~30 Hz (Combat, Projectiles, Movement)
const WORLD_TICK_RATE = 200.00;  // 5 Hz (Agriculture, Background AI, Proximity)

let combatTickInterval = null;
let worldTickInterval = null;

/**
 * 1. Initialize the Authoritative Loops
 */
export function startSimulationEngine() {
    console.log("🌐 Server Authoritative Simulation Engine starting...");
    
    // The HOT Loop: High-frequency processing for physics, inputs, and projectiles
    combatTickInterval = setInterval(tickCombat, COMBAT_TICK_RATE);
    
    // The WARM Loop: Low-frequency processing for peaceful AI and economy
    worldTickInterval = setInterval(tickWorld, WORLD_TICK_RATE);
}

/**
 * 2. THE HOT LOOP (30 Hz)
 * Strictly processes rapid inputs, physics stepping, and hit registration.
 */
function tickCombat() {
    const delta = COMBAT_TICK_RATE / 1000;

    // A. Process Authoritative Movement from buffered inputs
    for (let [playerId, player] of players) {
        if (player.hp <= 0 || player.isOffline) continue;

        const inputs = inputBuffers.get(playerId) || [];
        while (inputs.length > 0) {
            const input = inputs.shift();
            processPlayerInput(player, input, delta);
        }
    }

    // B. Step Projectile Physics
    for (let [projId, proj] of projectiles) {
        proj.x += proj.dx * proj.speed * delta;
        proj.y += proj.dy * proj.speed * delta;
        proj.life -= delta;

        // Authoritative continuous collision detection (Raycasting/Swept check)
        checkAuthoritativeCollisions(proj);

        if (proj.life <= 0) {
            projectiles.delete(projId);
        }
    }

    // C. Package and broadcast the HOT high-frequency frames to clients
    broadcastHighFrequencyState();
}

/**
 * 3. THE WARM LOOP (5 Hz)
 * Handles slower systems that do not require frame-perfect execution.
 */
function tickWorld() {
    const delta = WORLD_TICK_RATE / 1000;

    // A. Update Slow-Moving Background AI (Hobbits, Animals)
    for (let [hobId, hob] of hobbits) {
        if (hob.state === 'walking' && hob.path && hob.path.length > 0) {
            // Low-frequency path progress stepping
            const targetNode = hob.path[0];
            const dx = (targetNode.x * 16) - hob.x;
            const dy = (targetNode.y * 16) - hob.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 4) {
                // Direction and basic state updates
                hob.x += (dx / dist) * hob.speed * delta;
                hob.y += (dy / dist) * hob.speed * delta;
            } else {
                hob.path.shift(); // Reached node
            }
        }
    }

    // B. Update Crop Growth Ticks
    for (let [plantKey, plant] of serverPlants) {
        if (plant.growth < 100) {
            plant.growth = Math.min(100, plant.growth + (plant.growthRate * delta));
        }
    }

    // C. Perform Spatial Proximity Sweeps to determine Hot/Warm/Cold states
    updateSimulationTemperatures();

    // D. Broadcast low-frequency state updates (inventories, crop growth, positions)
    broadcastLowFrequencyState();
}

/**
 * 4. Input Authority Handler
 * Translates raw inputs into movement vectors after server validation.
 */
function processPlayerInput(player, input, delta) {
    if (!player.ccFlags || !player.ccFlags.canMove) return;

    // Validate input values to prevent speed hacks
    const mag = Math.hypot(input.dx, input.dy);
    if (mag > 1.05) return; // Discard suspicious movements

    const speed = player.speed || CONFIG.HERO_SPEED;
    
    // Authoritative collision boundaries
    const nextX = player.x + (input.dx * speed * delta);
    const nextY = player.y + (input.dy * speed * delta);

    // Apply movement internally on the server
    if (validateServerCollision(nextX, nextY)) {
        player.x = nextX;
        player.y = nextY;
    }
}

/**
 * Helper to queue incoming client inputs safely
 */
export function queuePlayerInput(playerId, inputData) {
    if (!inputBuffers.has(playerId)) {
        inputBuffers.set(playerId, []);
    }
    
    const buffer = inputBuffers.get(playerId);
    // Cap buffer size to prevent memory exhaustion attacks
    if (buffer.length < 10) {
        buffer.push(inputData);
    }
}

// Stub functions for subsequent implementation phases
function validateServerCollision(x, y) { return true; }
function checkAuthoritativeCollisions(proj) {}
function updateSimulationTemperatures() {}
function broadcastHighFrequencyState() {}
function broadcastLowFrequencyState() {}