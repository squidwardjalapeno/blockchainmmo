// src/input.js
import { hero, getLevelInfo } from './entities.js';
// Update import at the top
import { checkCollision, moveEntity } from './physics.js';
import { upgradeStat } from './interactionManager.js';
import { toggleMenu, uiState } from './uiManager.js';
import { executeAbility } from './abilities.js';
import { CONFIG } from './config.js'; // 👈 Import config


if (typeof window !== 'undefined') logStep("input.js loaded");

export const inputState = {
        
    inputType: 'keyboard', // 👈 'keyboard' or 'touch'

    moveX: 0, moveY: 0,
    action: false, interact: false, drop: false, keyB: false, keyP: false, keyC: false, keyV: false,
    mainBtn: false, skill1: false, skill2: false, skill3: false, skill4: false,
    leftJoystick: { active: false, startX: 0, startY: 0, currX: 0, currY: 0 },
    aim: { active: false, index: -1, dx: 0, dy: 0, cancel: false, startX: 0, startY: 0 },
    fireAim: false, fireAimIndex: -1 // 👈 NEW: Defers touch-aim execution to the physics loop
};

const keysDown = {};

// src/input.js

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
        
        // 👇 NEW: Left-side Touch Buttons
        INTERACT: { x: 25, y: H - 75, r: 14 },
        DROP:     { x: 25, y: H - 110, r: 14 },
        PLANT:    { x: 25, y: H - 145, r: 14 },

        // 👇 NEW: Inventory Button (Top-Left, below the XP bar)
        INV:      { x: 25, y: 50, r: 16 }
    };
}

export function initInput(canvas) {
    window.addEventListener("keydown", (e) => {
                
        inputState.inputType = 'keyboard'; // 👈 Switch to PC Mode
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
        // Inside keydown:
        if (e.code === 'KeyG') inputState.drop = true;
        if (e.code === 'KeyV') inputState.keyV = true;


        // PC QUICK-CAST (Flag for the physics loop)
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
        if (e.code === 'Space') inputState.action = false;
        if (e.code === 'KeyE')  inputState.interact = false;
        if (e.code === 'KeyC')  inputState.keyC = false; 
        // Inside keyup:
        if (e.code === 'KeyG') inputState.drop = false;
        if (e.code === 'KeyV') inputState.keyV = false;

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

    const handleTouch = (e) => {
        e.preventDefault();
        inputState.inputType = 'touch'; // 👈 Switch to Touch Mode

        let leftSideActive = false;
        const btns = getUIButtons();

        // 👈 Calculate Half-Screen Boundary
        const middleScreenX = Math.floor(window.innerWidth / CONFIG.ZOOM) / 2;

        for (let i = 0; i < e.touches.length; i++) {
            // 👈 Divide actual touch pixels by our ZOOM factor!
            const tx = e.touches[i].clientX / CONFIG.ZOOM;
            const ty = e.touches[i].clientY / CONFIG.ZOOM;

            // Touch Button Hit-Tester Helper
            const hit = (btn) => Math.hypot(tx - btn.x, ty - btn.y) < btn.r + 5;

            // 👈 Check New Left-Side Buttons FIRST
            if (e.type === 'touchstart') {
                if (hit(btns.INTERACT)) { inputState.interact = true; inputState.action = true; }
                if (hit(btns.DROP)) inputState.drop = true;
                if (hit(btns.PLANT)) inputState.keyV = true;
                
                // 👇 NEW: Toggle the menu if they tap the backpack!
                if (hit(btns.INV)) {
                    import('./uiManager.js').then(m => m.toggleMenu());
                }
            }

// 👇 Make sure the joystick ignores the INV button too
            if (tx < middleScreenX && !hit(btns.INTERACT) && !hit(btns.DROP) && !hit(btns.PLANT) && !hit(btns.INV)) {
                leftSideActive = true;
                if (!inputState.leftJoystick.active) {
                    inputState.leftJoystick.active = true;
                    inputState.leftJoystick.startX = tx;
                    inputState.leftJoystick.startY = ty;
                }
                const dx = tx - inputState.leftJoystick.startX;
                const dy = ty - inputState.leftJoystick.startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // 👈 Shrunk joystick deadzones
                if (dist > 6) {
                    inputState.moveX = dx / dist;
                    inputState.moveY = dy / dist;
                } else {
                    inputState.moveX = 0; inputState.moveY = 0;
                }
                if (dist > 25) {
                    inputState.leftJoystick.currX = inputState.leftJoystick.startX + (dx / dist) * 25;
                    inputState.leftJoystick.currY = inputState.leftJoystick.startY + (dy / dist) * 25;
                } else {
                    inputState.leftJoystick.currX = tx;
                    inputState.leftJoystick.currY = ty;
                }
            } else {
                // ... (Keep the right-side button logic exactly the same, the math will naturally work!)
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
                            inputState.aim.mag = Math.min(adist / 25, 1.0); // 👈 Shrunk aim deadzone
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


    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', (e) => {
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

        // ... inside canvas.addEventListener('touchend') in src/input.js ...

        // If the right side was released, execute the aimed skill!
        if (!rightStillActive) {
            inputState.mainBtn = false;
            inputState.action = false;
            
            if (inputState.aim.active) {
                if (!inputState.aim.cancel) {
                    
                    // 🎯 SMART TARGETING FOR SPELLS
                    // Find an enemy near the end of our aim vector
                    inputState.aim.targetId = null;
                    const aimX = (hero.x + 8) + (inputState.aim.dx * 150);
                    const aimY = (hero.y + 8) + (inputState.aim.dy * 150);
                    
                    import('./multiplayer.js').then(m => {
                        let bestDist = 50; // "Snap" radius of 50 pixels
                        m.remotePlayers.forEach((p, id) => {
                            if (p.hp <= 0) return;
                            const dist = Math.hypot((p.x + 8) - aimX, (p.y + 8) - aimY);
                            if (dist < bestDist) {
                                bestDist = dist;
                                inputState.aim.targetId = id;
                            }
                        });

                        // Now queue the spell to fire!
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

// --- Replace this entirely in src/input.js ---

export function handleHeroUpdate(modifier, worldMatrix, roomMatrix) {
    const hud = document.getElementById('hud');
    if (!hud || hud.style.display === 'none') return;

    if (hero.isFishing) { hero.isMoving = false; hero.frame = 0; return; }

    // 🌟 1. FIRE ABILITIES (Now passes world and room matrix!)
    if (inputState.skill1) { executeAbility(hero, 0, inputState, worldMatrix, roomMatrix); inputState.skill1 = false; }
    if (inputState.skill2) { executeAbility(hero, 1, inputState, worldMatrix, roomMatrix); inputState.skill2 = false; }
    if (inputState.skill3) { executeAbility(hero, 2, inputState, worldMatrix, roomMatrix); inputState.skill3 = false; }
    if (inputState.skill4) { executeAbility(hero, 3, inputState, worldMatrix, roomMatrix); inputState.skill4 = false; }
    
    if (inputState.fireAim) { 
        executeAbility(hero, inputState.fireAimIndex, inputState, worldMatrix, roomMatrix); 
        inputState.fireAim = false; 
    }

    const oldX = hero.x; const oldY = hero.y;
    
    // 16x16 HITBOX (Feet Only)
    const left = 2, right = 13, top = 8, bottom = 15;

    // 🌟 2. WARP PHYSICS (0.1s Cast Delay)
    if (hero.warpTimer > 0) {
        hero.warpTimer -= modifier;
        hero.isMoving = false;
        hero.animState = 'idle'; 
        
        if (hero.warpTimer <= 0) {
            hero.x = hero.warpTarget.x;
            hero.y = hero.warpTarget.y;
            console.log("🌌 Warped!");
            
            import('./multiplayer.js').then(m => {
                if (m.socket) m.socket.emit('movement', {
                    x: hero.x, y: hero.y, dir: hero.dir, 
                    animFrame: hero.frame, isMoving: false, isWindingUp: false, currentTileID: 0
                });
            });
        }
        return; 
    }

    // 🌟 3. GENERAL CASTING PHYSICS (e.g. Ring of Penance 0.3s Cast Time)
    if (hero.castTimer > 0) {
        hero.castTimer -= modifier;
        
        // Root the player while casting!
        hero.isMoving = false;
        hero.animState = 'idle'; 

        // Did the cast finish this frame?
        if (hero.castTimer <= 0) {
            
            // --- DETONATE p11: RING OF PENANCE ---
            if (hero.castSpellId === 'p11') {
                console.log("💥 Ring of Penance Detonated!");
                const damage = hero.magic * 0.30; 

                // Emit the AoE to the server
                import('./multiplayer.js').then(module => {
                    if (module.socket) {
                        module.socket.emit('abilityAoE', {
                            type: 'ringOfPenance',
                            x: hero.x + 8,
                            y: hero.y + 8,
                            radius: 40,
                            damage: damage
                        });
                    }
                });
                
                // Spawn a local Hallowed Ground ring for the caster
                hero.aoeZones.push({
                    type: 'ringOfPenanceVis',
                    x: hero.x + 8, y: hero.y + 8,
                    radius: 40,
                    life: 0.5 
                });
            }

            // --- DETONATE p16: ZENITH GUARDIAN ---
            else if (hero.castSpellId === 'p16') {
                console.log("🤖 Zenith Guardian Crashes Down!");
                
                // Grab the coordinates we stored 1 second ago!
                const dropX = hero.castSpellTarget.x;
                const dropY = hero.castSpellTarget.y;
                
                // 1. AoE Explosion (Damage + BIND CC) AT THE DROP ZONE
                import('./multiplayer.js').then(module => {
                    if (module.socket) module.socket.emit('abilityAoE', {
                        type: 'zenithGuardianSpawn',
                        x: dropX, 
                        y: dropY,
                        radius: 64, // 4-tile radius
                        damage: hero.magic * 0.25
                    });
                });

                // 2. Create the Pet Object AT THE DROP ZONE
                hero.pet = {
                    active: true,
                    x: dropX, 
                    y: dropY,
                    maxHp: hero.maxHp * 1.8,
                    hp: hero.maxHp * 1.8,
                    ad: hero.ad * 0.2, 
                    speed: hero.speed * 0.8, 
                    life: 40.0, 
                    attackTimer: 0,
                    healTimer: 5.0, 
                    overrideTarget: null
                };
                
                // Clean up the temporary targeting variable
                hero.castSpellTarget = null;
            }
            
            hero.castSpellId = null; // Clear the queue
        }
        return; // 🛑 EXIT EARLY: Cannot move while casting!
    }


    // 🌟 4. DASH PHYSICS OVERRIDE
    if (hero.dashTimer > 0) {
        hero.dashTimer -= modifier;
        
        let moveX = hero.dashVector.x * modifier;
        let moveY = hero.dashVector.y * modifier;

        if (moveX !== 0) {
            const nextX = hero.x + moveX;
            const sideToCheck = (moveX < 0) ? nextX + left : nextX + right;
            if (checkCollision(sideToCheck, hero.y + top, worldMatrix, roomMatrix, hero) && 
                checkCollision(sideToCheck, hero.y + bottom, worldMatrix, roomMatrix, hero)) {
                hero.x = nextX;
            }
        }
        if (moveY !== 0) {
            const nextY = hero.y + moveY;
            const sideToCheck = (moveY < 0) ? nextY + top : nextY + bottom;
            if (checkCollision(hero.x + left, sideToCheck, worldMatrix, roomMatrix, hero) && 
                checkCollision(hero.x + right, sideToCheck, worldMatrix, roomMatrix, hero)) {
                hero.y = nextY;
            }
        }

        hero.isMoving = true;
        hero.animState = 'rolling';
        hero.animTimer += modifier * 30; 
        hero.frame = Math.floor(hero.animTimer) % 6; 
        
        if (hero.dashTimer <= 0) hero.animState = 'idle'; 
        return; 
    }

    // 🌟 5. NORMAL WALKING PHYSICS
    if (hero.ccFlags && hero.ccFlags.canMove) { 
        let moveX = inputState.moveX * hero.speed * modifier;
        let moveY = inputState.moveY * hero.speed * modifier;

        const oldX = hero.x; 
        const oldY = hero.y;

        // 👇 ONE LINE handles all collision and sliding for the hero!
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
            hero.frame = Math.floor(hero.animTimer) % 4; // Walking uses 4 frames
        } else {
            hero.animState = 'idle';
            hero.frame = 0;       // 👈 RESTORED: Locks to the standing frame
            hero.animTimer = 0;   // 👈 RESTORED: Stops the timer
        }
    } else {
        // If they cannot move (Rooted/Stunned)
        hero.isMoving = false;
        hero.animState = 'idle';
        hero.frame = 0;           // 👈 RESTORED: Locks to standing frame
        hero.animTimer = 0;
    }
}