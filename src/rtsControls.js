// src/rtsControls.js
import { viewport } from './viewport.js';
import { hobbits } from './hobbitCore.js';
import { socket, playerWallet } from './multiplayer.js';
import { CONFIG } from './config.js';
import { gameState } from './entities.js'; // 🎯 Import directly from entities

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("rtsControls.js loaded");
}

export const rtsState = {
    enabled: false,
    selectedHobbitIds: new Set(),
    dragStart: null,     
    dragCurrent: null,   
    isPanning: false,
    lastPanTouch: null
};

export function setRtsMode(enabled) {
    rtsState.enabled = enabled;
    gameState.rtsEnabled = enabled; // 🎯 Sync to entities global state
    
    if (enabled) {
        gameState.rtsCameraX = 80800;
        gameState.rtsCameraY = 80800;
        console.log("👁️ Overseer RTS Mode enabled.");
    } else {
        rtsState.selectedHobbitIds.clear();
    }
}

export function screenToWorld(screenX, screenY) {
    const worldX = screenX - viewport.offset[0];
    const worldY = screenY - viewport.offset[1];
    return { x: worldX, y: worldY };
}

function isWithinSelectionBox(unitX, unitY, startScreen, endScreen) {
    const uScreenX = unitX + viewport.offset[0];
    const uScreenY = unitY + viewport.offset[1];

    const minX = Math.min(startScreen.x, endScreen.x);
    const maxX = Math.max(startScreen.x, endScreen.x);
    const minY = Math.min(startScreen.y, endScreen.y);
    const maxY = Math.max(startScreen.y, endScreen.y);

    return uScreenX >= minX && uScreenX <= maxX && uScreenY >= minY && uScreenY <= maxY;
}

export function handleRtsPointerDown(clientX, clientY, isRightClick = false, isSpaceHeld = false) {
    if (!rtsState.enabled) return;

    const rx = clientX / CONFIG.ZOOM;
    const ry = clientY / CONFIG.ZOOM;

    const worldPos = screenToWorld(rx, ry);

    // 🎯 Spacebar + Left Click or Right Click triggers panning
    if (isRightClick || isSpaceHeld) {
        rtsState.isPanning = true;
        rtsState.lastPanTouch = { x: rx, y: ry };
    } else {
        let clickedUnit = null;
        for (let hob of hobbits) {
            const dist = Math.hypot((hob.x + 8) - worldPos.x, (hob.y + 8) - worldPos.y);
            if (dist < 16) {
                clickedUnit = hob;
                break;
            }
        }

        if (clickedUnit) {
            rtsState.selectedHobbitIds.clear();
            rtsState.selectedHobbitIds.add(clickedUnit.id);
        } else {
            rtsState.dragStart = { x: rx, y: ry };
            rtsState.dragCurrent = { x: rx, y: ry };
        }
    }
}

// src/rtsControls.js (Update inside handleRtsPointerMove)

export function handleRtsPointerMove(clientX, clientY) {
    if (!rtsState.enabled) return;

    const rx = clientX / CONFIG.ZOOM;
    const ry = clientY / CONFIG.ZOOM;

    if (rtsState.isPanning && rtsState.lastPanTouch) {
        const dx = rx - rtsState.lastPanTouch.x;
        const dy = ry - rtsState.lastPanTouch.y;

        // Shift camera positions
        gameState.rtsCameraX -= dx;
        gameState.rtsCameraY -= dy;

        rtsState.lastPanTouch = { x: rx, y: ry };

        // --- 📡 EMIT RTS CAMERA MOVEMENT TELEMETRY TO SERVER ---
        if (socket && socket.connected) {
            socket.emit('rts_camera_move', {
                x: gameState.rtsCameraX,
                y: gameState.rtsCameraY
            });
        }
    } else if (rtsState.dragStart) {
        rtsState.dragCurrent = { x: rx, y: ry };
    }
}

export function handleRtsPointerUp(clientX, clientY, isRightClick = false) {
    if (!rtsState.enabled) return;

    if (rtsState.dragStart && rtsState.dragCurrent) {
        const dist = Math.hypot(rtsState.dragCurrent.x - rtsState.dragStart.x, rtsState.dragCurrent.y - rtsState.dragStart.y);
        
        if (dist > 5) { 
            rtsState.selectedHobbitIds.clear();
            hobbits.forEach(hob => {
                if (isWithinSelectionBox(hob.x + 8, hob.y + 8, rtsState.dragStart, rtsState.dragCurrent)) {
                    rtsState.selectedHobbitIds.add(hob.id);
                }
            });
        }
        rtsState.dragStart = null;
        rtsState.dragCurrent = null;
        return;
    }

    if (rtsState.isPanning) {
        rtsState.isPanning = false;
        rtsState.lastPanTouch = null;
        return;
    }

    if (!isRightClick && rtsState.selectedHobbitIds.size > 0) {
        const rx = clientX / CONFIG.ZOOM;
        const ry = clientY / CONFIG.ZOOM;
        const worldPos = screenToWorld(rx, ry);

        const tileX = Math.floor(worldPos.x / 16);
        const tileY = Math.floor(worldPos.y / 16);

        let actionType = 'MOVE';
        let combatTargetId = null;

        for (let other of hobbits) {
            if (rtsState.selectedHobbitIds.has(other.id)) continue;
            if (Math.hypot((other.x + 8) - worldPos.x, (other.y + 8) - worldPos.y) < 16) {
                combatTargetId = other.id;
                actionType = 'ATTACK';
                break;
            }
        }

        if (socket && socket.connected) {
            socket.emit('command_hobbits', {
                hobbitIds: Array.from(rtsState.selectedHobbitIds),
                tx: tileX,
                ty: tileY,
                targetId: combatTargetId,
                action: actionType,
                playerWallet: playerWallet
            });
        }
    }
}

// 🎯 Re-route old touch handlers to write to safe state variables
export function handleRtsTouchStart(e) {
    if (!rtsState.enabled) return;
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleRtsPointerDown(touch.clientX, touch.clientY, false, false);
    } else if (e.touches.length === 2) {
        const touch = e.touches[0];
        handleRtsPointerDown(touch.clientX, touch.clientY, true, false);
    }
}
export function handleRtsTouchMove(e) {
    if (!rtsState.enabled) return;
    if (e.touches.length > 0) {
        const touch = e.touches[0];
        handleRtsPointerMove(touch.clientX, touch.clientY);
    }
}
export function handleRtsTouchEnd(e) {
    if (!rtsState.enabled) return;
    if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const wasRightClick = (e.touches.length >= 1);
        handleRtsPointerUp(touch.clientX, touch.clientY, wasRightClick);
    }
}