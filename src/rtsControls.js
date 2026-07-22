// src/rtsControls.js
import { viewport } from './viewport.js';
import { hobbits } from './hobbitCore.js';
import { socket, playerWallet } from './multiplayer.js';
import { getTileData } from './physics.js';
import { CONFIG } from './config.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("rtsControls.js loaded");
}

export const rtsState = {
    enabled: false,
    cameraX: 80800, 
    cameraY: 80800,
    selectedHobbitIds: new Set(),
    dragStart: null,     // { x, y } in screen coordinates
    dragCurrent: null,   // { x, y } in screen coordinates
    isPanning: false,
    lastPanTouch: null
};

export function setRtsMode(enabled) {
    rtsState.enabled = enabled;
    if (enabled) {
        import('./entities.js').then(m => {
            m.hero.isMoving = false;
        });
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

// ==========================================
// 📡 UNIFIED POINTER ENGINE (MOUSE & TOUCH)
// ==========================================

export function handleRtsPointerDown(clientX, clientY, isRightClick = false) {
    if (!rtsState.enabled) return;

    // Convert coordinates to account for current zoom level
    const rx = clientX / CONFIG.ZOOM;
    const ry = clientY / CONFIG.ZOOM;

    const worldPos = screenToWorld(rx, ry);

    if (isRightClick) {
        // Right click: start camera pan
        rtsState.isPanning = true;
        rtsState.lastPanTouch = { x: rx, y: ry };
    } else {
        // Left Click: Check for single-unit tap select first
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
            // Clicked empty ground: start drawing selection box
            rtsState.dragStart = { x: rx, y: ry };
            rtsState.dragCurrent = { x: rx, y: ry };
        }
    }
}

export function handleRtsPointerMove(clientX, clientY) {
    if (!rtsState.enabled) return;

    const rx = clientX / CONFIG.ZOOM;
    const ry = clientY / CONFIG.ZOOM;

    if (rtsState.isPanning && rtsState.lastPanTouch) {
        const dx = rx - rtsState.lastPanTouch.x;
        const dy = ry - rtsState.lastPanTouch.y;

        rtsState.cameraX -= dx;
        rtsState.cameraY -= dy;

        rtsState.lastPanTouch = { x: rx, y: ry };
    } else if (rtsState.dragStart) {
        rtsState.dragCurrent = { x: rx, y: ry };
    }
}

export function handleRtsPointerUp(clientX, clientY, isRightClick = false) {
    if (!rtsState.enabled) return;

    // A. Resolve box marquee selection
    if (rtsState.dragStart && rtsState.dragCurrent) {
        const dist = Math.hypot(rtsState.dragCurrent.x - rtsState.dragStart.x, rtsState.dragCurrent.y - rtsState.dragStart.y);
        
        if (dist > 5) { // Only select if drag is larger than 5 pixels
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

    // B. Resolve Camera panning
    if (rtsState.isPanning) {
        rtsState.isPanning = false;
        rtsState.lastPanTouch = null;
        return;
    }

    // C. Issue unit commands (on Left Click ground Tap)
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