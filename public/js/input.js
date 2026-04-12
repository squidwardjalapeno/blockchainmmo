// js/input.js
import { hero, getLevelInfo } from './entities.js';
import { checkCollision } from './physics.js';
import { socket } from './multiplayer.js';
import { upgradeStat } from './interactionManager.js';

export const inputState = {
    moveX: 0, 
    moveY: 0,
    action: false,
    interact: false,
    drop: false,
    shift: false,
    // Combat
    mainBtn: false,
    //keyQ: false,
    keyW: false,
    keyB: false,
    keyP: false,
    leftJoystick: { active: false, startX: 0, startY: 0, currX: 0, currY: 0 }
};

// 1. KEYBOARD KEYS (For WASD testing)
const keysDown = {};


// js/input.js

// 1. Define the button positions (Bottom-Right area)
const UI_BUTTONS = {
    MAIN: { x: window.innerWidth - 100, y: window.innerHeight - 100, r: 45, action: 'mainBtn' }
    /*,
    Q:    { x: window.innerWidth - 180, y: window.innerHeight - 120, r: 30, action: 'keyQ' },
    W:    { x: window.innerWidth - 220, y: window.innerHeight - 180, r: 30, action: 'keyW' }
    */

};

// js/input.js -> inside checkCombatButtons(tx, ty)

function checkCombatButtons(tx, ty) {

    /*
    // 1. Check Q Button (Skillshot)
    const distQ = Math.sqrt(Math.pow(tx - UI_BUTTONS.Q.x, 2) + Math.pow(ty - UI_BUTTONS.Q.y, 2));
    if (distQ < UI_BUTTONS.Q.r) {
        if (!inputState.keyQ) inputState.keyQ = true;
        return; // Exit once a button is found
    }

    // 2. Check W Button (Dash) 🛑 ENSURE THIS MATCHES
    const distW = Math.sqrt(Math.pow(tx - UI_BUTTONS.W.x, 2) + Math.pow(ty - UI_BUTTONS.W.y, 2));
    if (distW < UI_BUTTONS.W.r) {
        if (!inputState.keyW) inputState.keyW = true;
        return;
    }

    */

    // 3. Check Main Attack (Fixed the logic check here)
    const distMain = Math.sqrt(Math.pow(tx - UI_BUTTONS.MAIN.x, 2) + Math.pow(ty - UI_BUTTONS.MAIN.y, 2));
    if (distMain < UI_BUTTONS.MAIN.r) {
        // Only trigger if we aren't already attacking
        if (!inputState.mainBtn) {  
            inputState.mainBtn = true;
            inputState.action = true;
        }
        return;
    }
}



export function initInput(canvas) {
    // --- KEYBOARD LISTENERS ---
    window.addEventListener("keydown", (e) => {
        keysDown[e.code] = true;
        updateKeyboardVectors();

        const info = getLevelInfo(hero.xp);
        const available = info.points - (hero.spentPoints || 0);

    if (available > 0) {
        if (e.code === 'Digit1') upgradeStat('hp');    // 1: HP
        if (e.code === 'Digit2') upgradeStat('ad');    // 2: ATK
        if (e.code === 'Digit3') upgradeStat('armor'); // 3: DEF
        if (e.code === 'Digit4') upgradeStat('magic'); // 4: MAGIC
        if (e.code === 'Digit5') upgradeStat('mr');    // 5: MR
        if (e.code === 'Digit6') upgradeStat('speed'); // 6: SPEED
    }
        // Single-press actions
        if (e.code === 'Space') inputState.action = true;
        if (e.code === 'KeyE')  inputState.interact = true;
        if (e.code === 'KeyG')  inputState.drop = true;
        //if (e.code === 'KeyQ')  inputState.keyQ = true;
        if (e.code === 'KeyB')  inputState.keyB = true;
        if (e.code === 'KeyP')  inputState.keyP = true;




        
    });

    window.addEventListener("keyup", (e) => {
        delete keysDown[e.code];
        updateKeyboardVectors();
        if (e.code === 'Space') inputState.action = false;
        if (e.code === 'KeyE')  inputState.interact = false;
        if (e.code === 'KeyG')  inputState.drop = false;
        //if (e.code === 'KeyQ')  inputState.keyQ = false;
        if (e.code === 'KeyB')  inputState.keyB = false;
        if (e.code === 'KeyP')  inputState.keyP = false;
    });

    // Helper to turn WASD into the same vectors the Joystick uses
    function updateKeyboardVectors() {
        // Only update vectors if Joystick isn't being used
        if (inputState.leftJoystick.active) return;

        let vx = 0, vy = 0;
        if (keysDown['KeyW'] || keysDown['ArrowUp'])    vy -= 1;
        if (keysDown['KeyS'] || keysDown['ArrowDown'])  vy += 1;
        if (keysDown['KeyA'] || keysDown['ArrowLeft'])  vx -= 1;
        if (keysDown['KeyD'] || keysDown['ArrowRight']) vx += 1;

        // Normalize diagonals (0.707)
        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
        
        inputState.moveX = vx;
        inputState.moveY = vy;
    }

    // --- TOUCH LISTENERS (Wild Rift Style) ---
    const handleTouch = (e) => {
        e.preventDefault();
        let leftSideActive = false;

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const tx = touch.clientX;
            const ty = touch.clientY;

            if (tx < window.innerWidth / 2) {
                leftSideActive = true;
                if (!inputState.leftJoystick.active) {
                    inputState.leftJoystick.active = true;
                    inputState.leftJoystick.startX = tx;
                    inputState.leftJoystick.startY = ty;
                }
                const dx = tx - inputState.leftJoystick.startX;
                const dy = ty - inputState.leftJoystick.startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxRadius = 50;
                inputState.moveX = dx / Math.max(dist, maxRadius);
                inputState.moveY = dy / Math.max(dist, maxRadius);
                inputState.leftJoystick.currX = tx;
                inputState.leftJoystick.currY = ty;
            } else {
    // RIGHT SIDE: Check for specific buttons instead of a generic tap
    checkCombatButtons(tx, ty);
}
        }
        if (!leftSideActive) {
            inputState.leftJoystick.active = false;
            // Only zero-out if keyboard isn't pressing anything
            if (Object.keys(keysDown).length === 0) {
                inputState.moveX = 0;
                inputState.moveY = 0;
            }
        }
    };

    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', (e) => {
    // Check if any fingers are still on the left side
    let leftStillActive = false;
    let rightStillActive = false;

    for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].clientX < window.innerWidth / 2) leftStillActive = true;
        else rightStillActive = true;
    }

    if (!leftStillActive) {
        inputState.leftJoystick.active = false;
        // Only zero-out if keyboard isn't pressing anything
        if (Object.keys(keysDown).length === 0) {
            inputState.moveX = 0;
            inputState.moveY = 0;
        }
    }

    if (!rightStillActive) {
        inputState.mainBtn = false;
        inputState.action = false;
       // inputState.keyQ = false; // Reset ability press too
       // inputState.keyW = false;
    }
});

}

/**
 * 🏃 THE CONTROLLER: Processes movement, collision, and state locking.
 * Call this once per frame in your main update() loop.
 */
export function handleHeroUpdate(modifier, worldMatrix, roomMatrix) {
    // 1. STATE LOCK: Root the hero if they are fishing
    if (hero.isFishing) {
        hero.isMoving = false;
        hero.frame = 0;
        return; 
    }

    // 2. CALCULATE VELOCITY
    let moveX = inputState.moveX * hero.speed * modifier;
    let moveY = inputState.moveY * hero.speed * modifier;

    const oldX = hero.x;
    const oldY = hero.y;
    
    // Hitbox constants (centered on feet)
    const left = 4, right = 12, top = 10, bottom = 15;

    // 3. HORIZONTAL COLLISION (Sliding)
    if (moveX !== 0) {
        const nextX = hero.x + moveX;
        const sideToCheck = (moveX < 0) ? nextX + left : nextX + right;
        if (checkCollision(sideToCheck, hero.y + top, worldMatrix, roomMatrix, hero) && 
            checkCollision(sideToCheck, hero.y + bottom, worldMatrix, roomMatrix, hero)) {
            hero.x = nextX;
        }
    }

    // 4. VERTICAL COLLISION (Sliding)
    if (moveY !== 0) {
        const nextY = hero.y + moveY;
        const sideToCheck = (moveY < 0) ? nextY + top : nextY + bottom;
        if (checkCollision(hero.x + left, sideToCheck, worldMatrix, roomMatrix, hero) && 
            checkCollision(hero.x + right, sideToCheck, worldMatrix, roomMatrix, hero)) {
            hero.y = nextY;
        }
    }

    // 5. UPDATE ANIMATION STATE
    hero.isMoving = (hero.x !== oldX || hero.y !== oldY);

    if (hero.isMoving) {
        // Directional facing
        if (Math.abs(moveX) > Math.abs(moveY)) {
            hero.dir = (moveX > 0) ? 'Right' : 'Left';
        } else {
            hero.dir = (moveY > 0) ? 'Down' : 'Up';
        }
        
        hero.animTimer += modifier * 10; 
        hero.frame = Math.floor(hero.animTimer) % 4;
    } else {
        hero.frame = 0;
        hero.animTimer = 0;
    }
}
