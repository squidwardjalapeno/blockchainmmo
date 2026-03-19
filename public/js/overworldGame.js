
// js/game.js
import { images, loadAllImages } from './assetLoader.js';
import { generateWorld } from './mapGenerator.js'; // Add this line
import { drawVillage, populateWorld, drawMiningArea, drawTown } from './cellDecorator.js';
import { applyShorelineRules } from './terrainRules.js';
import { inputState, initInput } from './input.js';
import { viewport } from './viewport.js';
import { ctx, ctx2, ctx3, canvas3, drawMap, drawJoystick, drawProjectiles, drawTargetCircle, drawHealthBar, drawAbilityButtons, initRenderer, clearAll, drawAnimals, drawHero, drawBobber } from './renderer.js';
import { hero, resetEntities, gameState } from './entities.js';
import { CONFIG } from './config.js'
import { checkCollision, getTileData } from './physics.js'; 
import { updateBacteria, seedBacteria, getBacteriaData } from './bacteria.js'; // Import the new system
import { ITEM_TYPES, createItem } from './items.js';
import { updatePlants, createGrass, plants } from './plants.js'; 
import { updateAnimals, animals, spawnChicken } from './animals.js';
import { updateProjectiles, findPriorityTarget, projectiles, currentTarget, spawnProjectile } from './combat.js';
import { socket, initMultiplayer, drawRemotePlayers, pendingVouchers, playerWallet } from './multiplayer.js';


// Change your import to this:
// This specific cdnjs link is the "Gold Standard" for Ethers v6 in browsers
import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js';


// 2. The Contract Address you deployed to Amoy
const WELL_BANK_ADDRESS = "0xf3Abb89fE45059cc0AE267c40FB172cFBb49F9A6";

// 3. The ABI (The "Map" of your contract's functions)
const WELL_BANK_ABI = [
    "function redeemVoucher(address player, uint256 amount, uint256 nonce, bytes signature) external",
    "function withdraw(uint256 _pointAmount) external",
    "function points(address) view returns (uint256)",
    "function getMasterBalance() view returns (uint256)"
];

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

export async function redeemAllVouchers() {
    if (!window.ethereum || pendingVouchers.length === 0) return;

    try {
        // 1. FORCE THE SWITCH TO POLYGON AMOY (Chain ID: 80002)
        // This ensures MetaMask uses MATIC and looks at the right blockchain
        const AMOY_CHAIN_ID = '0x13882'; // 80002 in hex
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: AMOY_CHAIN_ID }],
            });
        } catch (switchError) {
            // This error code means the chain has not been added to MetaMask
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: AMOY_CHAIN_ID,
                        chainName: 'Polygon Amoy Testnet',
                        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                        rpcUrls: ['https://rpc-amoy.polygon.technology'],
                        blockExplorerUrls: ['https://amoy.polygonscan.com']
                    }],
                });
            } else {
                throw switchError;
            }
        }

        // 2. INITIALIZE THE CONTRACT
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(WELL_BANK_ADDRESS, WELL_BANK_ABI, signer);

        console.log(`🏦 Attempting to redeem ${pendingVouchers.length} vouchers...`);

        // 3. LOOP THROUGH AND REDEEM
        for (let i = pendingVouchers.length - 1; i >= 0; i--) {
            const v = pendingVouchers[i];
            
            // Trigger the Polygon transaction
            const tx = await contract.redeemVoucher(v.player, v.amount, v.nonce, v.signature);
            console.log(`⏳ Transaction Sent: ${tx.hash}`);
            
            await tx.wait(); // Wait for the Polygon block to mine
            console.log(`✅ Voucher ${v.nonce} Redeemed!`);
            
            // Remove from list after success
            pendingVouchers.splice(i, 1);
        }

        // ✨ ADD THIS LINE HERE:
        await refreshOnChainPoints(); 

        console.log("✅ All vouchers successfully banked and HUD synced!");

        
    } catch (err) {
        console.error("Polygon Redemption Error:", err);
        alert("Transaction Failed. Check console for details.");
    }
}


// js/game.js

export async function withdrawPoints(amount) {
    // 1. Safety Checks
    if (!window.ethereum || !playerWallet) return;
    if (amount <= 0) return;

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(WELL_BANK_ADDRESS, WELL_BANK_ABI, signer);

        console.log(`🏦 Requesting withdrawal of ${amount} points from the Well...`);

        // 2. The Blockchain Call
        // This triggers the (Balance / 200) * (Amount / 10000) math in Solidity
        const tx = await contract.withdraw(amount);
        
        console.log("⏳ Mining withdrawal transaction...");
        await tx.wait();

        console.log("💰 SUCCESS! POL has been sent to your wallet.");
        
        // 3. Refresh the HUD so the points go down and POL goes up
        refreshOnChainPoints(); 

    } catch (err) {
        console.error("Withdrawal failed:", err);
        alert("Withdrawal failed! Check if the Well has enough POL.");
    }
}

// js/game.js

export async function refreshOnChainPoints() {
    // 1. Safety Check: Only refresh if the wallet is connected
    if (!window.ethereum || !playerWallet) return;

    try {
        // 2. Setup the "Read-Only" connection to Polygon
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(WELL_BANK_ADDRESS, WELL_BANK_ABI, provider);

        // 3. Ask the contract for the 'points' mapping of YOUR address
        // Note: playerWallet is the address we got during the MetaMask handshake
        const p = await contract.points(playerWallet);
        
        // 4. Update the Hero's stats (Convert BigInt to Number)
        hero.onChainPoints = Number(p);

        console.log(`📊 HUD SYNC: Current Banked Points = ${hero.onChainPoints}`);
        
    } catch (err) {
        console.error("Failed to sync on-chain points:", err);
    }
}





// js/game.js

var update = function (modifier) {
    // 1. UNIFIED HERO SENSOR
    const heroTX = Math.floor((hero.x + 8) / 16);
    const heroTY = Math.floor((hero.y + 14) / 16);
    const heroCX = Math.floor(hero.x / 1600);
    const heroCY = Math.floor(hero.y / 1600);

    // 2. Cell Logging
    if (window.lastLoggedCell !== `${heroCX}_${heroCY}`) {
        console.log(`📍 CELL: [${heroCX}, ${heroCY}]`);
        window.lastLoggedCell = `${heroCX}_${heroCY}`;
    }

   

        // --- 3. HARVESTING & PICKUP LOGIC ---

    if (inputState.interact && !hero.isMoving && !hero.isFishing) {
        const plantKey = `${heroTX}_${heroTY}`;
        const bac = getBacteriaData(heroTX, heroTY);
        const traits = bac.data[bac.idx];

        // OPTION A: Picking up a LIVING PLANT (Grass)
        if (plants.has(plantKey) && hero.inventory.length < hero.maxSlots) {
            const grassItem = createItem(ITEM_TYPES.UPROOTED_GRASS);
            hero.inventory.push(grassItem);
            plants.delete(plantKey);
            bac.data[bac.idx] = 0; // Clear the bacteria anchor
            console.log(`🌱 Uprooted ${grassItem.name}!`);
            inputState.interact = false; 
        } 
        
        // OPTION B: Picking up a DROPPED ITEM (Fish, Scraps, etc.)
        else if (traits > 0 && hero.inventory.length < hero.maxSlots) {
            // Unpack the data from the ground
            const h = traits & 0xFF;
            const v = (traits >> 8) & 0xFF;
            const typeID = (traits >> 20) & 0x0F;

            let template = null;
            if (typeID === 1) template = ITEM_TYPES.BASS;
            if (typeID === 3) template = ITEM_TYPES.UPROOTED_GRASS;
            if (typeID === 4) template = ITEM_TYPES.CHICKEN_POOP;
            if (typeID === 5) template = ITEM_TYPES.COOKED_BASS;

            if (template) {
                const pickedItem = createItem(template);
                // Keep the exact health and virulence it had on the ground!
                pickedItem.health = h;
                pickedItem.virulence = v;
                
                hero.inventory.push(pickedItem);
                bac.data[bac.idx] = 0; // Wipe it from the world
                
                console.log(`🎒 Picked up ${pickedItem.name} (HP: ${Math.floor(h)})`);
            }
            inputState.interact = false;
        }
    }


    // A. CASTING
    if (inputState.action && !hero.isMoving && !hero.isFishing) {
        let bx = 0, by = 0;
        const dist = 1;
        if (hero.dir === 'Up')    by = -dist;
        if (hero.dir === 'Down')  by = dist;
        if (hero.dir === 'Left')  bx = -dist;
        if (hero.dir === 'Right') bx = dist;

        const target = getTileData((heroTX + bx) * 16, (heroTY + by) * 16, worldMatrix, roomMatrix);
        if (target.tileID === 17) { 
            hero.isFishing = true;
            hero.hasBite = false;
            hero.bobberX = (heroTX + bx) * 16 + 8;
            hero.bobberY = (heroTY + by) * 16 + 8;
            hero.fishTimer = 2 + Math.random() * 3;
        }
    }

    // B. REELING IN
    if (hero.isFishing) {
        if (!hero.hasBite) {
            hero.fishTimer -= modifier;
            if (hero.fishTimer <= 0) hero.hasBite = true;
        } else if (inputState.action) {
            if (hero.inventory.length < hero.maxSlots) {
                const newFish = createItem(ITEM_TYPES.BASS);
                hero.inventory.push(newFish);
                console.log(`🎣 Caught ${newFish.name}! Bag: ${hero.inventory.length}/${hero.maxSlots}`);
            }
            hero.isFishing = false;
            hero.hasBite = false;
        }
    }

    // C. DROPPING (Now Scalable)
    if (inputState.drop && hero.inventory.length > 0 && !hero.isFishing) {
        const item = hero.inventory.pop();
        // Uses the seedType (e.g., "grass_item" or "fish") from the item object
        seedBacteria(heroTX, heroTY, item.seedType, item.health, item.virulence);
        console.log(`📦 Dropped ${item.name} (HP: ${Math.floor(item.health)})`);
        inputState.drop = false; 
    }

    // D. INVENTORY DECAY (Now Scalable)
    hero.inventory.forEach(item => {
        if (item.health > 0) {
            // Uses the decayRate (0.5 for grass, 2.0 for fish) from the item object
            item.health -= (modifier * item.decayRate); 
        }
    });

    // js/game.js -> inside update(modifier)

if (inputState.action && !hero.isMoving && !hero.isFishing) {
    const tx = Math.floor((hero.x + 8) / 16);
    const ty = Math.floor((hero.y + 14) / 16);

    // 1. SCAN FOR WELL (Tiles 30, 31, 38, 39)
    let nearWell = false;
    const wellTiles = [30, 31, 38, 39];
    
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const check = getTileData((tx + ox) * 16, (ty + oy) * 16, worldMatrix, roomMatrix);
            if (wellTiles.includes(check.tileID)) {
                nearWell = true;
                break;
            }
        }
        if (nearWell) break;
    }

    // 2. DEPOSIT CHECK
    if (nearWell && hero.inventory.length > 0 && playerWallet) { // 👈 Added playerWallet check) {
        const topItem = hero.inventory[hero.inventory.length - 1];

        // 3. TRIGGER VOUCHER (Multiplayer Sync)
        // We tell the server: "I am sacrificing this item at the well"
        socket.emit('sacrificeToWell', {
            itemType: topItem.seedType,
            health: topItem.health,
            virulence: topItem.virulence,
            playerWalletAddress: playerWallet // 👈 ADD THIS LINE
        });

        // 4. REMOVE FROM BAG
        hero.inventory.pop();
        
        console.log(`💎 Deposited ${topItem.name}... Awaiting Voucher for ${playerWallet}...`);
        
        // Consume input so we don't dump the whole bag in one frame
        inputState.action = false; 
    } else if (nearWell && !playerWallet) {
    console.warn("🚫 MetaMask not connected! Connect wallet to earn points.");
}
}


    // --- COMBAT UPDATES ---

    // 1. RESOURCE REGEN
    // Keep the hero fueled for spells
    hero.mana = Math.min(hero.maxMana, hero.mana + (hero.manaRegen * modifier));
    hero.attackTimer = Math.max(0, hero.attackTimer - modifier);

    // 5. COOLDOWNS
    hero.abilities.Q.cd = Math.max(0, hero.abilities.Q.cd - modifier);
    hero.abilities.W.cd = Math.max(0, hero.abilities.W.cd - modifier);


// 1. Always look for a target nearby (The "Lock-On" indicator)
findPriorityTarget(hero, animals, 150);

// Basic Attack: The "Main Button"
    if (inputState.mainBtn && hero.attackTimer <= 0 && currentTarget) {
        spawnProjectile(hero, currentTarget.x, currentTarget.y, 500, hero.ad, 4);
        hero.attackTimer = 1.0 / hero.attackSpeed;
        inputState.mainBtn = false; // 👈 CONSUME THE TAP
    }

 // 3. COMBAT ACTIONS
    // js/game.js -> inside update(modifier)

// --- 🎯 Q ABILITY LOGIC ---
if (inputState.keyQ) {
    // 1. Check BOTH Cooldown and Mana BEFORE firing
    if (hero.abilities.Q.cd <= 0 && hero.mana >= hero.abilities.Q.cost) {
        
        // Find where to aim (Target or Forward)
        const tX = currentTarget ? currentTarget.x : (hero.x + (hero.dir === 'Right' ? 100 : (hero.dir === 'Left' ? -100 : 0)));
        const tY = currentTarget ? currentTarget.y : (hero.y + (hero.dir === 'Down' ? 100 : (hero.dir === 'Up' ? -100 : 0)));

        // Fire the spell
        spawnProjectile(hero, tX, tY, 400, 100, 6);

        // 2. APPLY COSTS (This blocks the next frame)
        hero.mana -= hero.abilities.Q.cost;
        hero.abilities.Q.cd = hero.abilities.Q.maxCd; 
        
        console.log(`💥 Q Cast! Mana: ${Math.floor(hero.mana)} | CD Start: ${hero.abilities.Q.maxCd}`);
    }

    // 3. CONSUME INPUT
    // We set this to false regardless of whether we fired or not.
    // This forces the player to tap the screen again for the next shot.
    inputState.keyQ = false; 
}

// js/game.js -> inside update(modifier)

// --- 🛡️ W ABILITY: DASH ---
if (inputState.keyW) {
    if (hero.abilities.W.cd <= 0 && hero.mana >= hero.abilities.W.cost) {
        
        // 1. Calculate Dash Vector (Use Joystick direction or face direction)
        const dashPower = 64; // Distance in pixels (4 tiles)
        let dx = inputState.moveX;
        let dy = inputState.moveY;

        // If not moving, dash forward based on facing direction
        if (dx === 0 && dy === 0) {
            if (hero.dir === 'Left')  dx = -1;
            if (hero.dir === 'Right') dx = 1;
            if (hero.dir === 'Up')    dy = -1;
            if (hero.dir === 'Down')  dy = 1;
        }

        // 2. Teleport/Dash (Simple version: instant move)
        // We check collision to make sure we don't dash into a wall
        const targetX = hero.x + (dx * dashPower);
        const targetY = hero.y + (dy * dashPower);

        if (checkCollision(targetX, targetY, worldMatrix, roomMatrix, hero)) {
            hero.x = targetX;
            hero.y = targetY;
            
            // 3. Costs
            hero.mana -= hero.abilities.W.cost;
            hero.abilities.W.cd = hero.abilities.W.maxCd;
            console.log("💨 DASH!");
        }
    }
    inputState.keyW = false; // Reset tap
}

if (inputState.keyB && pendingVouchers.length > 0) {

    inputState.keyB = false;
    redeemAllVouchers(); // This opens MetaMask to claim your MATIC
    
}

// Inside update(modifier)
if (inputState.keyP) {

    inputState.keyP = false; // Reset the tap

    // Check if player actually has banked points to spend
    if (hero.onChainPoints >= 100) {
        // Let's test by withdrawing 100 points
        withdrawPoints(100);
    } else {
        console.warn("❌ Not enough banked points! Go sacrifice more grass.");
    }
}







    

    updateProjectiles(modifier, animals);

    

    // --- 4. WORLD SIMULATION ---
    updatePlants(modifier, fertilityMatrix); 
    // Inside update(modifier):
    updateAnimals(modifier, worldMatrix, roomMatrix);

    // Joystick-based Movement (The code we just wrote!)
    //handleHeroMovement(modifier); 

    bacteriaTimer += modifier;
    if (bacteriaTimer >= (CONFIG.BACTERIA_TICK_RATE / 1000)) {
        updateBacteria(worldMatrix, fertilityMatrix);
        
        const { data, idx } = getBacteriaData(heroTX, heroTY);
        const traits = data[idx];
        if (traits > 0) {
            const h = traits & 0xFF;
            const v = (traits >> 8) & 0xFF;
            const typeID = (traits >> 20) & 0x0F;
            console.log(`📍 TILE [${heroTX},${heroTY}] | Type: ${typeID} | HP: ${Math.floor(h)} | VIR: ${v}`);
        }
        bacteriaTimer = 0;
    }

    // js/game.js -> inside the update(modifier) function

if (inputState.action && !hero.isMoving && !hero.isFishing) {
    const tx = Math.floor((hero.x + 8) / 16);
    const ty = Math.floor((hero.y + 14) / 16);

    // 1. SCAN FOR CAMPFIRE (Tile 62)
    let nearFire = false;
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const check = getTileData((tx + ox) * 16, (ty + oy) * 16, worldMatrix, roomMatrix);
            if (check.tileID === 62) nearFire = true;
        }
    }

    // 2. COOKING CHECK
    if (nearFire && hero.inventory.length > 0) {
        // Peek at the last item in the bag (or selectedSlot if you use that)
        const topItem = hero.inventory[hero.inventory.length - 1];

        // Only allow FRESH BASS (Health > 0 and no rot/virulence)
        if (topItem.name === "River Bass" && topItem.health > 0) {
            
            // Remove raw fish
            hero.inventory.pop();
            
            // Add cooked fish
            const cookedFish = createItem(ITEM_TYPES.COOKED_BASS);
            hero.inventory.push(cookedFish);
            
            console.log("🔥 SIZZLE! You cooked the fish. It smells delicious!");
            inputState.action = false; // Consume input so we don't cook the whole bag instantly
        } else if (topItem.name === "River Bass" && topItem.health <= 0) {
            console.log("🤢 This fish is too rotten to cook!");
        }
    }
}


    // --- 5. MOVEMENT & COLLISION LOGIC (Mobile Style) ---

    if (hero.isMoving && socket) {
    socket.emit('movement', { 
        x: hero.x, y: hero.y, 
        dir: hero.dir, animFrame: hero.frame, 
        isMoving: hero.isMoving 
    });
}

// 1. Calculate how far we move based on the joystick vector
// inputState.moveX/Y is a value between -1 and 1
let moveX = inputState.moveX * hero.speed * modifier;
let moveY = inputState.moveY * hero.speed * modifier;

const oldX = hero.x, oldY = hero.y;
const left = 4, right = 12, top = 10, bottom = 15;

// 2. Horizontal Collision
if (moveX !== 0) {
    const nextX = hero.x + moveX;
    const sideToCheck = (moveX < 0) ? nextX + left : nextX + right;
    if (checkCollision(sideToCheck, hero.y + top, worldMatrix, roomMatrix, hero) && 
        checkCollision(sideToCheck, hero.y + bottom, worldMatrix, roomMatrix, hero)) {
        hero.x = nextX;
    }
}

// 3. Vertical Collision
if (moveY !== 0) {
    const nextY = hero.y + moveY;
    const sideToCheck = (moveY < 0) ? nextY + top : nextY + bottom;
    if (checkCollision(hero.x + left, sideToCheck, worldMatrix, roomMatrix, hero) && 
        checkCollision(hero.x + right, sideToCheck, worldMatrix, roomMatrix, hero)) {
        hero.y = nextY;
    }
}

// 4. Update Direction & Animation
hero.isMoving = (hero.x !== oldX || hero.y !== oldY);

if (hero.isMoving) {
    // If moving more horizontally than vertically, face Left/Right
    if (Math.abs(moveX) > Math.abs(moveY)) {
        hero.dir = (moveX > 0) ? 'Right' : 'Left';
    } else {
        hero.dir = (moveY > 0) ? 'Down' : 'Up';
    }
    
    // Animate based on distance moved
    hero.animTimer += modifier * 10; 
    hero.frame = Math.floor(hero.animTimer) % 4;
} else {
    hero.frame = 0;
    hero.animTimer = 0;
}

};

// Draw everything

var render = function () {
    clearAll(); // Clears all 3 layers
    
    viewport.update(hero.x + 8, hero.y + 8);

    // LAYER 1 (ctx): Ground & Water
    drawMap(worldMatrix, roomMatrix); 

    // LAYER 2 (ctx2): The "World" (Entities)

    drawRemotePlayers(ctx2)

    drawProjectiles(ctx2, projectiles); // Draw shots first so they are under health bars
    drawAnimals();                      // Draw chickens/enemies
    if (currentTarget) drawTargetCircle(ctx2, currentTarget); // The "Lock-On" Ring
    drawHero();                         // Draw the hero

    // LAYER 3 (ctx3): The "UI" (HUD)
    drawJoystick(ctx3);                 // The Virtual Stick

    // --- 🆕 ADD THIS HERE ---
    drawAbilityButtons(ctx3);           // ⚔️ The Right Buttons (Q and Attack)
    // --------------------
    // Inside render() -> LAYER 3 (ctx3)
drawHealthBar(ctx3, hero, "#00FF00"); // Green HP

// Add this for Mana:
const manaW = 20;
const screenX = viewport.offset[0] + hero.x - (manaW / 2);
const screenY = viewport.offset[1] + hero.y - 6; // Just below HP bar
ctx3.fillStyle = "rgba(0, 0, 0, 0.5)";
ctx3.fillRect(screenX, screenY, manaW, 2); // Tiny background
ctx3.fillStyle = "#0099FF"; // Blue Mana
ctx3.fillRect(screenX, screenY, manaW * (hero.mana / hero.maxMana), 2);

    // 5. Draw UI
    ctx3.fillStyle = CONFIG.UI_COLOR;
    ctx3.font = CONFIG.FONT_STYLE;
    
    // Using the hero's "feet" center for more accurate tile checking
    const tileX = Math.floor((hero.x + 8) / 16);
    const tileY = Math.floor((hero.y + 14) / 16);

    ctx3.fillText(`YOU ROCK: ${tileX}, ${tileY}`, 4, 64);
    ctx3.fillText(`BAG: ${hero.inventory.length}/${hero.maxSlots}`, 4, 80);

    // --- 🆕 FERTILITY TRACKER ---
    const cx = Math.floor(tileX / 100), cy = Math.floor(tileY / 100);
    const lx = ((tileX % 100) + 100) % 100, ly = ((tileY % 100) + 100) % 100;
    const soilF = fertilityMatrix[cx]?.[cy]?.[lx]?.[ly] || 0;

    ctx3.fillStyle = "#FF0000"; // Red font
    ctx3.fillText(`SOIL: ${Math.floor(soilF)} / 255`, 4, 112); 

    // --- 🆕 PLANT TRACKER ---
    const currentPlant = plants.get(`${tileX}_${tileY}`);
    if (currentPlant) {
        ctx3.fillStyle = "#00FF44"; // Vibrant Green
        const status = currentPlant.growth >= 100 ? "FLOWER" : `${Math.floor(currentPlant.growth)}%`;
        ctx3.fillText(`PLANT: ${status} (HP: ${Math.floor(currentPlant.health)})`, 4, 128);
    }

    // --- DROP INFO (Shifted down slightly to make room) ---
    if (hero.inventory.length > 0) {
        ctx3.fillStyle = CONFIG.UI_COLOR;
        const item = hero.inventory[hero.inventory.length - 1];
        ctx3.fillText(`DROP: ${item.name} (HP: ${Math.floor(item.health)})`, 4, 144);
    }
};


async function waitImages() {
    initInput(canvas3);

    initMultiplayer()

    await loadAllImages();
    initRenderer();

    // 1. Generate the world
    const rawShape = generateWorld(100, 100, 5); 
    const worldData = populateWorld(rawShape); 

    worldMatrix = worldData.worldMatrix; 
    roomMatrix = worldData.roomMatrix; 
    fertilityMatrix = worldData.fertilityMatrix; // 👈 Map it here!
    worldMap = rawShape;

    // 2. FIND A SPAWN FIRST (So hero.x isn't 500,500 every time)
    reset(); // Final safety reset


    /*
    // 🚩 FORCE TEST POSITION (Add this temporarily)
    hero.x = 1650; 
    hero.y = 1550;
    */

    

    // Get hero's tile position
const hx = Math.floor(hero.x / 16);
const hy = Math.floor(hero.y / 16);

console.log("🌱 Planting starter grass around hero...");

// Plant a 3x3 square of grass entities at the hero's feet

for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
        createGrass(hx + ox, hy + oy, fertilityMatrix);
    }
}
    

//createGrass(hx, hy, fertilityMatrix);

spawnChicken(hx + 20, hy + 20);

drawTown(hx - 20, hy - 20, worldMatrix, roomMatrix, fertilityMatrix);


//drawVillage(hx + 20, hy + 20, worldMatrix, roomMatrix);
    
    

    // 5. Start the loop
    
    main(); 
}

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
