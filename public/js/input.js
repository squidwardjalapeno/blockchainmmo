export const inputState = {
    moveX: 0, 
    moveY: 0,
    action: false,
    interact: false,
    drop: false,
    shift: false,
    // Combat
    mainBtn: false,
    keyQ: false,
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
    MAIN: { x: window.innerWidth - 100, y: window.innerHeight - 100, r: 45, action: 'mainBtn' },
    Q:    { x: window.innerWidth - 180, y: window.innerHeight - 120, r: 30, action: 'keyQ' },
    W:    { x: window.innerWidth - 220, y: window.innerHeight - 180, r: 30, action: 'keyW' }

};

// 2. Add a "Button Checker" function
function checkCombatButtons(tx, ty) {
    // Check Q Button
    const distQ = Math.sqrt(Math.pow(tx - UI_BUTTONS.Q.x, 2) + Math.pow(ty - UI_BUTTONS.Q.y, 2));
    if (distQ < UI_BUTTONS.Q.r) {
        // ONLY trigger if the button isn't already "Active" 
        // This prevents the 60fps machine gun
        if (!inputState.keyQ) {
            inputState.keyQ = true;
        }
        return;
    }

    // Check W Button
    const distW = Math.sqrt(Math.pow(tx - UI_BUTTONS.W.x, 2) + Math.pow(ty - UI_BUTTONS.W.y, 2));
    if (distW < UI_BUTTONS.W.r) {
        // ONLY trigger if the button isn't already "Active" 
        // This prevents the 60fps machine gun
        if (!inputState.keyW) {
            inputState.keyW = true;
        }
        return;
    }

    // Check Main Attack
    const distMain = Math.sqrt(Math.pow(tx - UI_BUTTONS.MAIN.x, 2) + Math.pow(ty - UI_BUTTONS.MAIN.y, 2));
    if (distMain < UI_BUTTONS.MAIN.r) {
        // ONLY trigger if the button isn't already "Active" 
        // This prevents the 60fps machine gun
        if (!inputState.keyQ) {  
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
        // Single-press actions
        if (e.code === 'Space') inputState.action = true;
        if (e.code === 'KeyE')  inputState.interact = true;
        if (e.code === 'KeyG')  inputState.drop = true;
        if (e.code === 'KeyQ')  inputState.keyQ = true;
        if (e.code === 'KeyB')  inputState.keyB = true;
        if (e.code === 'KeyP')  inputState.keyP = true;

        
    });

    window.addEventListener("keyup", (e) => {
        delete keysDown[e.code];
        updateKeyboardVectors();
        if (e.code === 'Space') inputState.action = false;
        if (e.code === 'KeyE')  inputState.interact = false;
        if (e.code === 'KeyG')  inputState.drop = false;
        if (e.code === 'KeyQ')  inputState.keyQ = false;
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
        inputState.keyQ = false; // Reset ability press too
        inputState.keyW = false;
    }
});

}
