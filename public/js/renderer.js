// js/renderer.js
import { viewport } from './viewport.js';
import { images } from './assetLoader.js';
import { CONFIG } from './config.js';
import { hero, getLevelInfo } from './entities.js'; 
import { plants } from './plants.js'; // Add this near your other imports
import { getBacteriaData } from './bacteria.js';
// js/renderer.js
import { animals } from './animals.js';
import { inputState } from './input.js';
import { pendingVouchers } from './multiplayer.js';

// js/renderer.js
import { globalFishCount } from './fish.js'; // Ensure this is imported



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

export function drawMap(worldMatrix, roomMatrix) {
    // We clear ctx2 here because entities (animals, projectiles) move every frame
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height);

    // 1. LOCAL ANCHORS: The center of your screen
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);

    const hGX = Math.floor((hero.x + 8) / 16);
    const hGY = Math.floor((hero.y + 14) / 16);
    const heroHouseId = getCellData(hGX, hGY, worldMatrix, roomMatrix).roomID;

    const [startX, startY] = viewport.startTile;
    const [endX, endY] = viewport.endTile;

    for (let k = startX; k <= endX; k++) {
        // 2. THE LOCAL FIX: (WorldPos - HeroPos) + ScreenCenter
        // This keeps screenX always within the size of your monitor
        const screenX = Math.floor(centerX + (k * 16 - (hero.x + 8)));

        for (let l = startY; l <= endY; l++) {
            const current = getCellData(k, l, worldMatrix, roomMatrix);
            if (current.tileID === undefined) continue;

            const screenY = Math.floor(centerY + (l * 16 - (hero.y + 14)));
            let tileID = current.tileID;

// --- 🏠 HOUSE INTERIOR LOGIC ---
if (heroHouseId !== 0 && heroHouseId === current.roomID) {
    const startX = getHouseStart(k, l, current.roomID, roomMatrix);
    const relI = k - startX;

    // 1. BACK WALL (Top Row)
    if (tileID === 40) {
        tileID = (relI === 2) ? 43 : 41; // Window and Walls stay here
    } 
    // 2. FLOOR & FURNITURE (Middle and Bottom Rows)
    else if ([35, 48, 50, 52].includes(tileID)) {
        
        if (relI === 3) {
            // If we are on the middle row (tile 48), place the HEAD
            if (tileID === 48) {
                tileID = 61; 
            } 
            // If we are on the foundation row (50/52), place the FEET
            else if (tileID === 50 || tileID === 52) {
                tileID = 60;
            }
        } 
        else {
            tileID = 42; // Normal floor for everything else
        }
    }
}



            // --- 🖼️ RENDER PASS 1: GROUND ---
            ctx2.drawImage(
                images.worldTilesColor,
                (tileID % CONFIG.SHEET_WIDTH_TILES) * 16, 
                Math.floor(tileID / CONFIG.SHEET_WIDTH_TILES) * 16, 
                16, 16,
                screenX, screenY,
                16, 16
            );

            // --- 🌿 RENDER PASS 2: PLANTS ---
            const plant = plants.get(`${k}_${l}`);
            if (plant && (heroHouseId === 0 || heroHouseId !== current.roomID)) {
                let plantSpriteID = 15; 
                if (plant.growth >= 25) plantSpriteID = 16;
                if (plant.growth >= 50) plantSpriteID = 17;
                if (plant.growth >= 75) plantSpriteID = 33;
                if (plant.growth >= 100) plantSpriteID = 34;


ctx2.drawImage(
    images.weaponTileset,
    (plantSpriteID % CONFIG.WEAPON_SHEET_WIDTH_TILES) * 16, 
    Math.floor(plantSpriteID / CONFIG.WEAPON_SHEET_WIDTH_TILES) * 16, 
    16, 16,
    screenX, screenY,
    16, 16
);
            }

            // --- 💩 RENDER PASS 3: DROPS/BACTERIA ---
            const bacData = getBacteriaData(k, l);
            const traits = bacData.data[bacData.idx];
            
            if (traits > 0) {
                const h = traits & 0xFF;
                const v = (traits >> 8) & 0xFF;
                const typeID = (traits >> 20) & 0x0F;

                if ((typeID === 1 || typeID === 3 || typeID === 4 || typeID === 5) && (h > 0 || v > 0)) {
                    let spriteID = 57; 

                    if (typeID === 5) { // Cooked Fish
                        if (h > 0) spriteID = 44; 
                        else if (v >= 10) spriteID = 58; 
                        else spriteID = 59;
                    } 
                    else if (typeID === 4) spriteID = 8; // Poop
                    else if (typeID === 3) { // Grass
                        spriteID = (h > 0) ? 36 : 37;
                    } else { // Raw Fish
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


// js/renderer.js

// js/renderer.js
// js/renderer.js

export function drawHero() {
    const imgKey = `hero${hero.dir}`; 
    const currentImg = images[imgKey];

    if (currentImg && currentImg.complete) {

        /*
        if (hero.hp <= 0) {
        ctx2.globalAlpha = 0.5; // Make them a ghost
        ctx2.rotate(Math.PI / 2); // Flip them sideways
        }
        */

        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);

        const srcW = 48; 
        const srcH = 72;
        const destW = 16; 
        const destH = 24; 

        let drawX = centerX - (destW / 2);
        let drawY = centerY - (destH - 8) - 8;

        // --- ⚔️ PVP VISUALS: WIND-UP & IMPACT ---
        if (hero.isWindingUp) {
            // Jitter/Shake during wind-up
            drawX += (Math.random() * 2 - 1);
            drawY += (Math.random() * 2 - 1);
        } else if (hero.attackTimer < 0 && hero.attackTimer > -0.2) {
            // Lunge forward slightly on impact
            const lunge = 4;
            if (hero.dir === 'Up')    drawY -= lunge;
            if (hero.dir === 'Down')  drawY += lunge;
            if (hero.dir === 'Left')  drawX -= lunge;
            if (hero.dir === 'Right') drawX += lunge;
        }

        // --- 🎣 FISHING VISUALS ---
        // Only draw the rod if we aren't currently punching someone
        if (hero.isFishing && !hero.isWindingUp) {
            ctx2.strokeStyle = "#4B2C20"; 
            ctx2.lineWidth = 2;
            
            const startX = centerX;
            const startY = centerY - 12;

            let rodEX = startX, rodEY = startY;
            const rodLen = 12;
            if (hero.dir === 'Up')    rodEY -= rodLen;
            if (hero.dir === 'Down')  rodEY += rodLen;
            if (hero.dir === 'Left')  rodEX -= rodLen;
            if (hero.dir === 'Right') rodEX += rodLen;

            ctx2.beginPath();
            ctx2.moveTo(startX, startY);
            ctx2.lineTo(rodEX, rodEY);
            ctx2.stroke();

            // Fishing Line
            const bobberSX = centerX + (hero.bobberX - (hero.x + 8));
            const bobberSY = centerY + (hero.bobberY - (hero.y + 14));

            ctx2.strokeStyle = "#FFFFFF";
            ctx2.lineWidth = 0.5;
            ctx2.beginPath();
            ctx2.moveTo(rodEX, rodEY);
            ctx2.lineTo(bobberSX, bobberSY);
            ctx2.stroke();
        }

        // --- 🏃 DRAW HERO ---
        ctx2.drawImage(
            currentImg,
            hero.frame * srcW, 0, 
            srcW, srcH,
            Math.floor(drawX), 
            Math.floor(drawY),
            destW, destH
        );

        // --- ➕ HP BAR (Stays attached to head) ---
        const barW = 16, barH = 2;
        const barX = drawX + (destW / 2) - (barW / 2);
        const barY = drawY - 4;

        ctx2.fillStyle = "black";
        ctx2.fillRect(barX, barY, barW, barH);
        ctx2.fillStyle = "#00FF00"; 
        ctx2.fillRect(barX, barY, barW * (hero.hp / hero.maxHp), barH);
    }
}




export function drawAnimals() {
    animals.forEach(chicken => {
        const screenX = (chicken.x - hero.x) + (canvas.width / 2);
    const screenY = (chicken.y - hero.y) + (canvas.height / 2);
    
    ctx2.fillRect(screenX - 4, screenY - 4, 8, 8);
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

// js/renderer.js

let mapCanvas = document.createElement('canvas');
mapCanvas.width = CONFIG.MAP_SIZE;
mapCanvas.height = CONFIG.MAP_SIZE;
let mapCtx = mapCanvas.getContext('2d');

export function preRenderMinimap(worldMap) {
    const size = CONFIG.MAP_SIZE;
    mapCtx.clearRect(0, 0, size, size);
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const val = worldMap[y * size + x];
        
            if (val === 103) {
            mapCtx.fillStyle = "#1b0218"; // Bright black for castle
        }
        else if (val === 102) {
            mapCtx.fillStyle = "#a32192"; // Bright purple for town
        }    // Add a check for your new Village ID
          else if (val === 101) {
            mapCtx.fillStyle = "#e74c3c"; // Bright Red for Villages
        } else if (val >= CONFIG.LAND_THRESHOLD) {
            mapCtx.fillStyle = "#2ecc71"; // Grass
        } else {
            mapCtx.fillStyle = "#3498db"; // Water
        }

        mapCtx.fillRect(x, y, 1, 1);
        }
    }
    console.log("🗺️ Minimap baked to buffer!");
}

export function drawMinimap(ctx) {
    const displaySize = 600; // The size on your UI
    const padding = 20;
    const x = window.innerWidth - displaySize - padding;
    const y = padding;

    // Stamp the pre-rendered image (1 draw call instead of 160,000!)
    ctx.drawImage(mapCanvas, x, y, displaySize, displaySize);

    // Draw Player Dot
    const pX = (hero.x / 1600) * (displaySize / CONFIG.MAP_SIZE);
    const pY = (hero.y / 1600) * (displaySize / CONFIG.MAP_SIZE);
    ctx.fillStyle = "white";
    ctx.fillRect(x + pX, y + pY, 3, 3);
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
    if (!target || target.hp <= 0) return; // Don't draw on dead players

    // 1. Center the ring under the player's feet (16x24 sprite logic)
    const screenX = viewport.offset[0] + target.x + 8;
    const screenY = viewport.offset[1] + target.y + 12;

    // 2. Animated Pulse Effect
    const pulse = Math.sin(Date.now() / 150) * 2;
    const radius = 12 + pulse;

    // 3. Draw the "Lock-On" Ring
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 4. Draw the enemy's health bar
    // Since 'target' is a remote player, this will now show their PvP HP
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

    /*
    // B. Q Ability (The Skillshot)
    drawHUDButton(ctxUI, window.innerWidth - 180, window.innerHeight - 120, 30, "Q", hero.abilities.Q.cd, hero.abilities.Q.maxCd);

    // C. W Ability (The Dash)
    drawHUDButton(ctxUI, window.innerWidth - 220, window.innerHeight - 180, 30, "W", hero.abilities.W.cd, hero.abilities.W.maxCd);
*/

    // --- 🌊 GLOBAL FISH TRACKER ---
    const uiX = 4;
    const uiY = 160; // Positioned below your other stats

    ctxUI.save(); // Save state to avoid affecting other UI elements
    
    // Change color based on scarcity (Visual feedback)
    // Turns red if population is under 2,000
    ctxUI.fillStyle = globalFishCount < 2000 ? "#FF4444" : "#00FFFF"; 
    ctxUI.font = "bold 14px Arial";
    ctxUI.textAlign = "left";
    
    // Display the count
    ctxUI.fillText(`WORLD FISH: ${Math.floor(globalFishCount)}`, uiX, uiY);
    
    ctxUI.restore();
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

export function drawXPStatus(ctxUI) {
    const info = getLevelInfo(hero.xp);
    const availablePoints = info.points - (hero.spentPoints || 0);

    const x = 10;
    const y = 200; // Positioned below the "WORLD FISH" (uiY 160)

    // 1. Progress Bar Background
    const barW = 150;
    const barH = 12;
    ctxUI.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctxUI.fillRect(x, y, barW, barH);

    // 2. XP Fill (Blue for Lv0, Gold for Lv1+)
    const progress = Math.min(1, hero.xp / info.nextXp);
    ctxUI.fillStyle = (info.level > 0) ? "#FFD700" : "#3498db";
    ctxUI.fillRect(x, y, barW * progress, barH);

    // 3. Level Text
    ctxUI.fillStyle = "white";
    ctxUI.font = "bold 10px Arial";
    ctxUI.textAlign = "left";
    ctxUI.fillText(`LVL ${info.level} - ${Math.floor(hero.xp)} XP`, x, y - 5);

    // 4. STAT UPGRADE MENU (Visible when points exist)
    if (availablePoints > 0) {
        const menuY = y + 25;
        ctxUI.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctxUI.fillRect(x, menuY, 110, 95);
        ctxUI.strokeStyle = "#FFD700";
        ctxUI.strokeRect(x, menuY, 110, 95);

        ctxUI.fillStyle = "#FFD700";
        ctxUI.fillText(`UPGRADES (${availablePoints})`, x + 10, menuY + 15);
        
        ctxUI.fillStyle = "white";
        ctxUI.font = "9px Arial";
        // Update the stats array to match your 1-6 plan:
const stats = [
    "1: +10 HP", 
    "2: +1 ATK", 
    "3: +1 DEF", 
    "4: +1 MAGIC", // Added
    "5: +1 MR", 
    "6: +10 SPEED"  // Corrected to 6
];

        stats.forEach((text, i) => ctxUI.fillText(text, x + 10, menuY + 35 + (i * 14)));
    }
}




// js/renderer.js
export function clearAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // Clears Hero layer
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height); // Clears Map layer
    ctx3.clearRect(0, 0, canvas3.width, canvas3.height); // Clears UI layer
}