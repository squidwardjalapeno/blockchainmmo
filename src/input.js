// src/input.js
import { hero, getLevelInfo } from './entities.js';
import { checkCollision, moveEntity } from './physics.js';
import { upgradeStat } from './interactionManager.js';
import { toggleMenu, uiState } from './uiManager.js';
import { executeAbility } from './abilities.js';
import { CONFIG } from './config.js';
import { socket } from './multiplayer.js';
import { rtsState, handleRtsTouchStart, handleRtsTouchMove, handleRtsTouchEnd } from './rtsControls.js';

if (typeof window !== 'undefined') {
    logStep("input.js loaded");
}

const keysDown = {};

export const inputState = {
    inputType: 'keyboard', 
    uiMode: 'combat', 

    moveX: 0, 
    moveY: 0,
    action: false, 
    interact: false, 
    drop: false, 
    keyB: false, 
    keyP: false, 
    keyC: false, 
    keyV: false, 
    keyF: false,
    mainBtn: false, 
    skill1: false, 
    skill2: false, 
    skill3: false, 
    skill4: false,
    leftJoystick: { active: false, startX: 0, startY: 0, currX: 0, currY: 0 },
    aim: { active: false, index: -1, dx: 0, dy: 0, cancel: false, startX: 0, startY: 0, mag: 1.0 },
    fireAim: false, 
    fireAimIndex: -1 
};

/**
 * 1. Define Tablet UI Layout coordinates based on Zoom configuration
 */
export function getUIButtons() {
    const W = Math.floor(window.innerWidth / CONFIG.ZOOM);
    const H = Math.floor(window.innerHeight / CONFIG.ZOOM);
    
    return {
        MAIN:   { x: W - 28,  y: H - 28,  r: 20 },
        SKILL1: { x: W - 75,  y: H - 22,  r: 14, index: 0 },
        SKILL2: { x: W - 68,  y: H - 55,  r: 14, index: 1 },
        SKILL3: { x: W - 45,  y: H - 75,  r: 14, index: 2 },
        SKILL4: { x: W - 18,  y: H - 85,  r: 16, index: 3 },
        CANCEL: { x: W - 28,  y: H - 120, r: 16 },
        SWAP:   { x: W - 115, y: H - 22,  r: 14 }, 

        INV:      { x: W - 80, y: H - 120, r: 14 }, 
        WORK:     { x: W - 30, y: H - 120, r: 14 }, 
        DROP:     { x: W - 80, y: H - 75,  r: 14 }, 
        EAT:      { x: W - 30, y: H - 75,  r: 14 }, 
        PLANT:    { x: W - 80, y: H - 30,  r: 14 }, 
        INTERACT: { x: W - 30, y: H - 30,  r: 14 }  
    };
}

/**
 * 2. Initialize Inputs (Keyboard, Touch, RTS Overrides)
 */
export function initInput(canvas) {
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');
    
    if (chatSendBtn && chatInput) {
        chatSendBtn.addEventListener('click', () => {
            const msg = chatInput.value.trim();
            if (msg.length > 0) {
                import('./multiplayer.js').then(m => m.sendChatMessage(msg));
            }
            chatInput.value = ''; 
            chatInput.blur();     
        });
    }

    // --- KEYBOARD LISTENERS ---
    window.addEventListener("keydown", (e) => {
        if (document.activeElement && document.activeElement.id === 'chat-input') {
            if (e.code === 'Enter') {
                const msg = document.activeElement.value.trim();
                if (msg.length > 0) {
                    import('./multiplayer.js').then(m => m.sendChatMessage(msg));
                }
                document.activeElement.value = ''; 
                document.activeElement.blur();     
            }
            return; 
        }
        
        if (e.code === 'Enter') {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) chatInput.focus();
            return;
        }
                
        inputState.inputType = 'keyboard'; 
        keysDown[e.code] = true;
        updateKeyboardVectors();

        const info = getLevelInfo(hero.xp);
        if ((info.points - (hero.spentPoints || 0)) > 0) {
            if (e.code === 'Digit1') upgradeStat('hp');    
            if (e.code === 'Digit2') upgradeStat('ad');    
            if (e.code === 'Digit3') upgradeStat('armor'); 
            if (e.code === 'Digit4') upgradeStat('magic'); 
            if (e.code === 'Digit5') upgradeStat('mr');    
            if (e.code === 'Digit6') upgradeStat('speed'); 
        }
        
        if (e.code === 'Space') inputState.action = true;
        if (e.code === 'KeyE')  inputState.interact = true;
        if (e.code === 'KeyC')  inputState.keyC = true; 
        if (e.code === 'KeyG')  inputState.drop = true;
        if (e.code === 'KeyV')  inputState.keyV = true;
        if (e.code === 'KeyF')  inputState.keyF = true;

        if (e.code === 'KeyQ') inputState.skill1 = true;
        if (e.code === 'KeyW') inputState.skill2 = true;
        if (e.code === 'KeyE') inputState.skill3 = true;
        if (e.code === 'KeyR') inputState.skill4 = true;

        if (e.code === 'KeyI') toggleMenu(); 
        if (e.code === 'Tab') { e.preventDefault(); toggleMenu(); }
        if (e.code === 'Escape' && uiState.isOpen) toggleMenu();
    });

    window.addEventListener("keyup", (e) => {
        delete keysDown[e.code];
        updateKeyboardVectors();
        if (e.code === 'Space') {
            inputState.action = false;
            inputState.mainBtn = false; 
        }
        if (e.code === 'KeyE')  inputState.interact = false;
        if (e.code === 'KeyC')  inputState.keyC = false; 
        if (e.code === 'KeyG')  inputState.drop = false;
        if (e.code === 'KeyV')  inputState.keyV = false;
        if (e.code === 'KeyF')  inputState.keyF = false;

        if (e.code === 'KeyQ') inputState.skill1 = false;
        if (e.code === 'KeyW') inputState.skill2 = false;
        if (e.code === 'KeyE') inputState.skill3 = false;
        if (e.code === 'KeyR') inputState.skill4 = false;
    });

    function updateKeyboardVectors() {
        if (inputState.leftJoystick.active) return;
        let vx = 0, vy = 0;
        if (keysDown['KeyW'] || keysDown['ArrowUp']) vy -= 1;
        if (keysDown['KeyS'] || keysDown['ArrowDown']) vy += 1;
        if (keysDown['KeyA'] || keysDown['ArrowLeft']) vx -= 1;
        if (keysDown['KeyD'] || keysDown['ArrowRight']) vx += 1;
        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
        inputState.moveX = vx;
        inputState.moveY = vy;
    }

    // --- TOUCH / MOBILE LISTENERS ---
    const handleTouch = (e) => {
        e.preventDefault();
        inputState.inputType = 'touch'; 

        let leftSideActive = false;
        const btns = getUIButtons();
        const middleScreenX = Math.floor(window.innerWidth / CONFIG.ZOOM) / 2;

        for (let i = 0; i < e.touches.length; i++) {
            const tx = e.touches[i].clientX / CONFIG.ZOOM;
            const ty = e.touches[i].clientY / CONFIG.ZOOM;
            const hit = (btn) => Math.hypot(tx - btn.x, ty - btn.y) < btn.r + 5;

            if (tx < middleScreenX) {
                leftSideActive = true;
                if (!inputState.leftJoystick.active) {
                    inputState.leftJoystick.active = true;
                    inputState.leftJoystick.startX = tx;
                    inputState.leftJoystick.startY = ty;
                }
                const dx = tx - inputState.leftJoystick.startX;
                const dy = ty - inputState.leftJoystick.startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > 6) {
                    inputState.moveX = dx / dist; inputState.moveY = dy / dist;
                } else {
                    inputState.moveX = 0; inputState.moveY = 0;
                }
                if (dist > 25) {
                    inputState.leftJoystick.currX = inputState.leftJoystick.startX + (dx / dist) * 25;
                    inputState.leftJoystick.currY = inputState.leftJoystick.startY + (dy / dist) * 25;
                } else {
                    inputState.leftJoystick.currX = tx; inputState.leftJoystick.currY = ty;
                }
            } 
            else {
                if (e.type === 'touchstart' && hit(btns.SWAP)) {
                    inputState.uiMode = inputState.uiMode === 'combat' ? 'normal' : 'combat';
                    if (navigator.vibrate) navigator.vibrate(20);
                }

                if (inputState.uiMode === 'normal') {
                    if (e.type === 'touchstart') {
                        if (hit(btns.INTERACT)) { inputState.interact = true; inputState.action = true; }
                        if (hit(btns.DROP)) inputState.drop = true;
                        if (hit(btns.PLANT)) inputState.keyV = true;
                        if (hit(btns.EAT)) inputState.keyC = true;
                        if (hit(btns.WORK)) inputState.keyF = true;
                        if (hit(btns.INV)) import('./uiManager.js').then(m => m.toggleMenu());
                    }
                } 
                else {
                    if (Math.hypot(tx - btns.MAIN.x, ty - btns.MAIN.y) < btns.MAIN.r) {
                        if (!inputState.mainBtn) { inputState.mainBtn = true; inputState.action = true; }
                    }

                    if (e.type === 'touchstart' && !inputState.aim.active) {
                        for (let key of ['SKILL1', 'SKILL2', 'SKILL3', 'SKILL4']) {
                            if (Math.hypot(tx - btns[key].x, ty - btns[key].y) < btns[key].r) {
                                inputState.aim.active = true;
                                inputState.aim.index = btns[key].index;
                                inputState.aim.startX = btns[key].x;
                                inputState.aim.startY = btns[key].y;
                                inputState.aim.dx = 0; inputState.aim.dy = 0;
                                inputState.aim.cancel = false;
                            }
                        }
                    }

                    if (inputState.aim.active) {
                        if (Math.hypot(tx - btns.CANCEL.x, ty - btns.CANCEL.y) < btns.CANCEL.r + 10) {
                            inputState.aim.cancel = true;
                        } else {
                            inputState.aim.cancel = false;
                            const adx = tx - inputState.aim.startX;
                            const ady = ty - inputState.aim.startY;
                            const adist = Math.sqrt(adx * adx + ady * ady);
                            if (adist > 15) { 
                                inputState.aim.dx = adx / adist;
                                inputState.aim.dy = ady / adist;
                                inputState.aim.mag = Math.min(adist / 25, 1.0); 
                            }
                        }
                    }
                }
            }
        }

        if (!leftSideActive) {
            inputState.leftJoystick.active = false;
            if (Object.keys(keysDown).length === 0) { inputState.moveX = 0; inputState.moveY = 0; }
        }
    };

    // Routing inputs dynamically depending on whether the RTS mode is active
    canvas.addEventListener('touchstart', (e) => {
        if (rtsState.enabled) {
            handleRtsTouchStart(e);
            return;
        }
        handleTouch(e);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (rtsState.enabled) {
            handleRtsTouchMove(e);
            return;
        }
        handleTouch(e);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        if (rtsState.enabled) {
            handleRtsTouchEnd(e);
            return;
        }
        
        let leftStillActive = false;
        let rightStillActive = false;

        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].clientX < window.innerWidth / 2) leftStillActive = true;
            else rightStillActive = true;
        }

        if (!leftStillActive) {
            inputState.leftJoystick.active = false;
            if (Object.keys(keysDown).length === 0) { inputState.moveX = 0; inputState.moveY = 0; }
        }

        if (!rightStillActive) {
            inputState.mainBtn = false;
            inputState.action = false;
            
            if (inputState.aim.active) {
                if (!inputState.aim.cancel) {
                    inputState.aim.targetId = null;
                    const aimX = (hero.x + 8) + (inputState.aim.dx * 150);
                    const aimY = (hero.y + 8) + (inputState.aim.dy * 150);
                    
                    import('./multiplayer.js').then(m => {
                        let bestDist = 50; 
                        m.remotePlayers.forEach((p, id) => {
                            if (p.hp <= 0) return;
                            const dist = Math.hypot((p.x + 8) - aimX, (p.y + 8) - aimY);
                            if (dist < bestDist) {
                                bestDist = dist;
                                inputState.aim.targetId = id;
                            }
                        });

                        inputState.fireAim = true;
                        inputState.fireAimIndex = inputState.aim.index;
                    });
                } else {
                    inputState.aim.active = false;
                    inputState.aim.index = -1;
                }
            }
        }
    });
}

/**
 * 3. Local predicted movement update + Authoritative server input emission
 */
export function handleHeroUpdate(modifier, worldMatrix, roomMatrix) {
    const hud = document.getElementById('hud');
    if (!hud || hud.style.display === 'none') return;
    if (rtsState.enabled) return; // Freeze Hero input checks if player is in Overseer mode

    if (hero.isFishing) { hero.isMoving = false; hero.frame = 0; return; }

    // Execute local abilities
    if (inputState.skill1) { executeAbility(hero, 0, inputState, worldMatrix, roomMatrix); inputState.skill1 = false; }
    if (inputState.skill2) { executeAbility(hero, 1, inputState, worldMatrix, roomMatrix); inputState.skill2 = false; }
    if (inputState.skill3) { executeAbility(hero, 2, inputState, worldMatrix, roomMatrix); inputState.skill3 = false; }
    if (inputState.skill4) { executeAbility(hero, 3, inputState, worldMatrix, roomMatrix); inputState.skill4 = false; }
    
    if (inputState.fireAim) { 
        executeAbility(hero, inputState.fireAimIndex, inputState, worldMatrix, roomMatrix); 
        inputState.fireAim = false; 
    }

    if (hero.warpTimer > 0) {
        hero.warpTimer -= modifier;
        hero.isMoving = false;
        hero.animState = 'idle'; 
        if (hero.warpTimer <= 0) {
            hero.x = hero.warpTarget.x;
            hero.y = hero.warpTarget.y;
        }
        return; 
    }

    if (hero.castTimer > 0) {
        hero.castTimer -= modifier;
        hero.isMoving = false;
        hero.animState = 'idle'; 
        return; 
    }

    if (hero.dashTimer > 0) {
        hero.dashTimer -= modifier;
        
        let moveX = hero.dashVector.x * modifier;
        let moveY = hero.dashVector.y * modifier;

        moveEntity(hero, moveX, moveY, worldMatrix, roomMatrix);

        hero.isMoving = true;
        hero.animState = 'rolling';
        hero.animTimer += modifier * 30; 
        hero.frame = Math.floor(hero.animTimer) % 6; 
        return; 
    }

    if (hero.ccFlags && hero.ccFlags.canMove) { 
        let velX = inputState.moveX * hero.speed;
        let velY = inputState.moveY * hero.speed;

        const isManualMove = (inputState.moveX !== 0 || inputState.moveY !== 0);

        // Auto-chase pathing offset
        if (hero.isAttacking && hero.target && !hero.isWindingUp && !isManualMove) {
            const hx = hero.x + 8;
            const hy = hero.y + 8;
            const tx = hero.target.x + 8;
            const ty = hero.target.y + 8;
            const dist = Math.hypot(tx - hx, ty - hy);
            const attackRange = hero.attackRange || 24;

            if (dist > attackRange) {
                velX = ((tx - hx) / dist) * hero.speed;
                velY = ((ty - hy) / dist) * hero.speed;
            } else {
                velX = 0; velY = 0; 
            }
        }

        let moveX = velX * modifier;
        let moveY = velY * modifier;

        // --- 📡 PHASE 1: EMIT RAW INPUT TO SERVER FOR AUTHORITATIVE STEPS ---
        if (socket && socket.connected && (inputState.moveX !== 0 || inputState.moveY !== 0)) {
            socket.emit('player_input', { dx: inputState.moveX, dy: inputState.moveY });
        }

        const oldX = hero.x; 
        const oldY = hero.y;

        // Run local Client-Side Prediction to keep movement instant
        moveEntity(hero, moveX, moveY, worldMatrix, roomMatrix);

        hero.isMoving = (hero.x !== oldX || hero.y !== oldY);

        if (hero.isMoving) {
            hero.animState = 'walking';
            if (moveX > 0 && moveY < 0) hero.dir = 'NorthEast';
            else if (moveX < 0 && moveY < 0) hero.dir = 'NorthWest';
            else if (moveX > 0 && moveY > 0) hero.dir = 'SouthEast';
            else if (moveX < 0 && moveY > 0) hero.dir = 'SouthWest';
            else if (moveX > 0) hero.dir = 'East';
            else if (moveX < 0) hero.dir = 'West';
            else if (moveY > 0) hero.dir = 'South';
            else if (moveY < 0) hero.dir = 'North';

            hero.animTimer += modifier * 10; 
            hero.frame = Math.floor(hero.animTimer) % 4; 
        } else {
            hero.animState = 'idle';
            hero.frame = 0;       
            hero.animTimer = 0;   
        }
    } else {
        hero.isMoving = false;
        hero.animState = 'idle';
        hero.frame = 0;           
        hero.animTimer = 0;
    }
}