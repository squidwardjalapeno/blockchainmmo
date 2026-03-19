// js/renderer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { CONFIG } from './config.js';
import { hero } from './entities.js'; 
import { plants } from './plants.js'; // Add this near your other imports
import { getBacteriaData } from './bacteria.js';
// js/renderer.js
import { animals } from './animals.js';
import { inputState } from './input.js';
import { pendingVouchers } from './multiplayer.js';




export const canvas = document.getElementById("myCanvas");
export const canvas2 = document.getElementById("myCanvas2");
export const canvas3 = document.getElementById("myCanvas3");

export const ctx = canvas.getContext("2d");
export const ctx2 = canvas2.getContext("2d");
export const ctx3 = canvas3.getContext("2d");

// js/renderer.js

export function initRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 1. FORCE ALL THREE TO THE SAME SIZE
    // This aligns the "Sandwich" perfectly
    [canvas, canvas2, canvas3].forEach(c => {
        c.width = w;
        c.height = h;
    });

    // 2. Sync Viewport to the new size
    viewport.screen = [w, h];

    // 3. PIXEL ART SETTINGS
    // We loop through all contexts to ensure crisp edges on every layer
    [ctx, ctx2, ctx3].forEach(c => {
        c.imageSmoothingEnabled = false;
        c.mozImageSmoothingEnabled = false;
        c.webkitImageSmoothingEnabled = false;
        c.msImageSmoothingEnabled = false;
    });

    console.log(`📺 Renderer Initialized: ${w}x${h} resolution.`);
}

// js/renderer.js

// js/renderer.js

function getCellData(k, l, worldMatrix, roomMatrix) {
    // k and l are global tiles (0 to 10,000)
    // 100 is the size of one cell's internal tile grid
    const cx = Math.floor(k / 100); 
    const cy = Math.floor(l / 100);
    const lx = ((k % 100) + 100) % 100;
    const ly = ((l % 100) + 100) % 100;

    // IMPORTANT: Check if the CELL exists first
    if (!worldMatrix[cx] || !worldMatrix[cx][cy]) return { tileID: undefined, roomID: 0 };

    return {
        tileID: worldMatrix[cx][cy][lx][ly],
        roomID: roomMatrix[cx][cy][lx][ly] || 0
    };
}


export function drawMap(worldMatrix, roomMatrix) {
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height);

    const hGX = Math.floor((hero.x + 8) / 16);
    const hGY = Math.floor((hero.y + 14) / 16);
    const heroHouseId = getCellData(hGX, hGY, worldMatrix, roomMatrix).roomID;

    const [startX, startY] = viewport.startTile;
    const [endX, endY] = viewport.endTile;
    const [offX, offY] = viewport.offset;

    for (let k = startX; k <= endX; k++) {
        const screenX = offX + (k * 16);

        for (let l = startY; l <= endY; l++) {
            const current = getCellData(k, l, worldMatrix, roomMatrix);
            if (current.tileID === undefined) continue;

            const screenY = offY + (l * 16);
            let tileID = current.tileID;

            // 1. TERRAIN LOGIC
            if (heroHouseId !== 0 && heroHouseId === current.roomID) {
                if (tileID === 40) {
                    const relativeI = k - getHouseStart(k, l, current.roomID, roomMatrix); 
                    tileID = (relativeI === 2) ? 43 : 41; 
                } 
                else if ([35, 48, 50, 52].includes(tileID)) {
                    tileID = 42; 
                }
            }

            // 2. DRAW THE BASE TERRAIN (Always 16x16)
            ctx2.drawImage(
                images.worldTilesColor,
                (tileID % CONFIG.SHEET_WIDTH_TILES) * 16, 
                Math.floor(tileID / CONFIG.SHEET_WIDTH_TILES) * 16, 
                16, 16,
                screenX, screenY,
                16, 16
            );

            // 3. DRAW THE PLANT (Layered on top, 8x8 centered)
            const plant = plants.get(`${k}_${l}`);
            if (plant && (heroHouseId === 0 || heroHouseId !== current.roomID)) {
                let plantSpriteID = 47; 
                if (plant.growth >= 25) plantSpriteID = 59;
                if (plant.growth >= 50) plantSpriteID = 58;
                if (plant.growth >= 75) plantSpriteID = 57;
                if (plant.growth >= 100) plantSpriteID = 56;

                ctx2.drawImage(
                    images.cropTileset,
                    (plantSpriteID % CONFIG.CROP_SHEET_WIDTH_TILES) * 16, 
                    Math.floor(plantSpriteID / CONFIG.CROP_SHEET_HEIGHT_TILES) * 16, 
                    16, 16,
                    screenX + 4, screenY + 4,
                    8, 8
                );
            }

                        // 4. DRAW THE BACTERIA/FISH/GRASS (Layered on top, 8x8 centered)
            const bacData = getBacteriaData(k, l);
            const traits = bacData.data[bacData.idx];
            
            if (traits > 0) {
                const h = traits & 0xFF;
                const v = (traits >> 8) & 0xFF;
                const typeID = (traits >> 20) & 0x0F;

                // Combined check for Type 1 (Fish) and Type 3 (Uprooted Grass)
                if ((typeID === 1 || typeID === 3 || typeID === 4 || typeID === 5) && (h > 0 || v > 0)) {
                    let spriteID = 57; // Default

                    if (typeID === 5) {
                        // --- 🆕 COOKED FISH VISUALS ---
                        if (h > 0) spriteID = 44; 
                        else if (v >= 10) spriteID = 58; 
                        else spriteID = 59;
                        
                        
                    } 
                    else if (typeID === 4) {
                        // --- 🆕 CHICKEN POOP VISUALS ---
                        spriteID = 8;       // Fresh Grass Item
                        
                        
                    } 
                    else if (typeID === 3) {
                        // --- 🆕 UPROOTED GRASS VISUALS ---
                        if (h > 0) spriteID = 36;       // Fresh Grass Item
                        else if (v >= 0) spriteID = 37; // Rotting/Moldy
                        
                    } else {
                        // --- FISH VISUALS ---
                        if (h > 0) spriteID = 57; 
                        else if (v >= 10) spriteID = 58; 
                        else spriteID = 59;
                    }

                    ctx2.drawImage(
                        images.worldTilesColor,
                        (spriteID % CONFIG.SHEET_WIDTH_TILES) * 16, 
                        Math.floor(spriteID / CONFIG.SHEET_WIDTH_TILES) * 16, 
                        16, 16,
                        screenX + 4, screenY + 4, 
                        8, 8
                    );
                }
            }

        }
    }
}



function getHouseStart(gx, gy, houseId, roomMatrix) {
    let startX = gx;
    // We only check 5 tiles back (House is 4 wide + safety)
    for (let i = 0; i < 5; i++) {
        const nextX = startX - 1;
        // Optimization: Use a direct lookup instead of getCellData
        const cx = Math.floor(nextX / 100), cy = Math.floor(gy / 100);
        const lx = ((nextX % 100) + 100) % 100, ly = ((gy % 100) + 100) % 100;
        
        if (roomMatrix[cx]?.[cy]?.[lx]?.[ly] === houseId) startX = nextX;
        else break;
    }
    return startX;
}

// js/renderer.js

// js/renderer.js

export function drawHero() {
    const imgKey = `hero${hero.dir}`; 
    const currentImg = images[imgKey];

    if (currentImg && currentImg.complete) {
        // 1. Source dimensions (from your PNG)
        const srcW = 48; 
        const srcH = 72;

        // 2. Destination dimensions (how big he looks in-game)
        const destW = 16; 
        const destH = 24; 

        // 3. Offset to keep feet on the tile
        // Since he is 24px tall but tiles are 16px, 
        // we subtract 8px from Y so his feet stay at the hero.y coordinate.
        const footOffset = destH - 16; 

        if (hero.isFishing) {
        ctx.strokeStyle = "#4B2C20"; // Dark Brown for the rod
        ctx.lineWidth = 2;
        
        // 1. Calculate Rod Start (Hero's hands/chest area)
        const startX = viewport.offset[0] + hero.x + 8;
        const startY = viewport.offset[1] + hero.y + 4;

        // 2. Calculate Rod End (Slightly toward the bobber)
        // We'll point the rod based on hero.dir
        let rodEX = startX, rodEY = startY;
        const rodLen = 12;
        if (hero.dir === 'Up')    rodEY -= rodLen;
        if (hero.dir === 'Down')  rodEY += rodLen;
        if (hero.dir === 'Left')  rodEX -= rodLen;
        if (hero.dir === 'Right') rodEX += rodLen;

        // 3. Draw the Rod
        ctx2.beginPath();
        ctx2.moveTo(startX, startY);
        ctx2.lineTo(rodEX, rodEY);
        ctx2.stroke();

        // 4. Draw the Fishing Line (Thin white/blue line to the bobber)
        ctx2.strokeStyle = "#FFFFFF";
        ctx2.lineWidth = 0.5;
        ctx2.beginPath();
        ctx2.moveTo(rodEX, rodEY);
        ctx2.lineTo(viewport.offset[0] + hero.bobberX, viewport.offset[1] + hero.bobberY);
        ctx2.stroke();
        }

        ctx2.drawImage(
            currentImg,
            hero.frame * srcW, 0,    // Source X (0, 48, 96, 144), Source Y
            srcW, srcH,             // Source Width, Height (48x72)
            viewport.offset[0] + hero.x, 
            viewport.offset[1] + hero.y - footOffset, // Shift up so feet match tiles
            destW, destH            // Draw Width, Height (16x24)
        );

        
    }
}



export function drawAnimals() {
    animals.forEach(chicken => {
        // Draw a simple yellow body for now
        ctx2.fillStyle = "#FFD700"; 
        ctx2.fillRect(
            viewport.offset[0] + chicken.x - 4, 
            viewport.offset[1] + chicken.y - 4, 
            8, 8
        );
    });
}


// Inside js/renderer.js

export function drawBobber() {
    if (!hero.isFishing) return;

    const img = images.feather;
    if (img && img.complete) {
        // Animation: Make the feather bob up and down slightly
        const bob = Math.sin(Date.now() / 200) * 2;
        
        // Bite Animation: If there's a bite, make it shake frantically
        const shake = hero.hasBite ? (Math.random() * 4 - 2) : 0;

        ctx2.drawImage(
            img, 
            0, 0, 980, 980,             // Source: Grab the whole giant image
           viewport.offset[0] + hero.bobberX + shake - 8, // Center it (16/2 = 8)
            viewport.offset[1] + hero.bobberY + bob - 8, 
            16, 16                     // Destination: Scale to 16x16
        );
    }
}

// js/renderer.js

export function drawHealthBar(ctx, entity, color = "#00FF00") {
    const barW = 20;
    const barH = 4;
    
    // Support both Hero (hp/maxHp) and Animals (hunger/100)
    let percent = 0;
    if (entity.hp !== undefined) {
        percent = entity.hp / entity.maxHp;
    } else if (entity.hunger !== undefined) {
        // In your eco-sim, 100 hunger = 0% health
        percent = (100 - entity.hunger) / 100;
    }

    const screenX = viewport.offset[0] + entity.x - (barW / 2);
    const screenY = viewport.offset[1] + entity.y - 12;

    // 1. Background (Shadow)
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(screenX, screenY, barW, barH);

    // 2. Current Value
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, barW * Math.max(0, percent), barH);
}

export function drawTargetCircle(ctx, target) {
    if (!target) return;

    const screenX = viewport.offset[0] + target.x;
    const screenY = viewport.offset[1] + target.y;

    // Draw the "Lock-On" Ring
    ctx.strokeStyle = "rgba(255, 0, 0, 0.6)"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 14, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw the Animal's health bar in RED so it looks like an enemy
    drawHealthBar(ctx, target, "#FF4444"); 
}

export function drawJoystick(ctxUI) {
    // IMPORT inputState here or pass it as an argument
    if (!inputState.leftJoystick.active) return;

    const { startX, startY, currX, currY } = inputState.leftJoystick;

    // Use ctx3 (the UI layer)
    ctxUI.save();
    ctxUI.setLineDash([]); // Ensure solid lines
    
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

/**
 * 🆕 ADD THIS: Draw the projectiles!
 */
export function drawProjectiles(ctx, projectiles) {
    projectiles.forEach(p => {
        const screenX = viewport.offset[0] + p.x;
        const screenY = viewport.offset[1] + p.y;
        
        ctx.fillStyle = "#00FFFF"; // Cyan energy ball
        ctx.beginPath();
        ctx.arc(screenX, screenY, p.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add a small outer glow
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

// js/renderer.js

/**
 * 🎨 HELPER: Draws a Wild Rift style ability button with CD overlay
 */
function drawHUDButton(ctx, x, y, radius, label, cooldown, maxCooldown) {
    // 1. Draw the Circle Base
    // Turn red if on cooldown, otherwise blue/green
    ctx.fillStyle = cooldown > 0 ? "rgba(255, 0, 0, 0.2)" : "rgba(0, 150, 255, 0.3)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Draw the Text (Number or Letter)
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 16px Arial";

    const displayText = cooldown > 0 ? Math.ceil(cooldown) : label;
    ctx.fillText(displayText, x, y);
}

/**
 * The main UI call for the right side of the screen
 */
export function drawAbilityButtons(ctxUI) {
    // A. Main Attack (The Big One)
    drawHUDButton(ctxUI, window.innerWidth - 100, window.innerHeight - 100, 45, "ATK", 0, 0);

    // B. Q Ability (The Skillshot)
    drawHUDButton(ctxUI, window.innerWidth - 180, window.innerHeight - 120, 30, "Q", hero.abilities.Q.cd, hero.abilities.Q.maxCd);

    // C. W Ability (The Dash)
    drawHUDButton(ctxUI, window.innerWidth - 220, window.innerHeight - 180, 30, "W", hero.abilities.W.cd, hero.abilities.W.maxCd);

    // js/renderer.js -> inside drawAbilityButtons(ctxUI)

// Draw the "Bank" button (The B Key)
if (pendingVouchers.length > 0) {
    const bX = window.innerWidth - 300;
    const bY = window.innerHeight - 120;
    
    ctxUI.fillStyle = "rgba(255, 215, 0, 0.4)"; // Gold color
    ctxUI.beginPath();
    ctxUI.arc(bX, bY, 35, 0, Math.PI * 2);
    ctxUI.fill();
    ctxUI.strokeStyle = "white";
    ctxUI.stroke();

    ctxUI.fillStyle = "white";
    ctxUI.font = "bold 14px Arial";
    ctxUI.fillText("BANK", bX, bY - 5);
    ctxUI.fillText(`(${pendingVouchers.length})`, bX, bY + 12);
}

}





// js/renderer.js
export function clearAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // Clears Hero layer
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height); // Clears Map layer
    ctx3.clearRect(0, 0, canvas3.width, canvas3.height); // Clears UI layer
}