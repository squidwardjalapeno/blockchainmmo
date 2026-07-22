// src/rtsControls.js
import { viewport } from './viewport.js';
import { hobbits } from './hobbitCore.js';
import { socket, playerWallet } from './multiplayer.js';
import { getTileData } from './physics.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("rtsControls.js loaded");
}

export const rtsState = {
    enabled: false,
    cameraX: 1600, 
    cameraY: 1600,
    selectedHobbitIds: new Set(),
    dragStart: null,     // { x, y } screen space coordinates
    dragCurrent: null,   // { x, y } screen space coordinates
    isPanning: false,
    lastPanTouch: null   // { x, y } last touch position during panning
};

/**
 * 1. Toggle RTS Mode and center camera on player coordinates
 */
export function setRtsMode(enabled) {
    rtsState.enabled = enabled;
    if (enabled) {
        import('./entities.js').then(m => {
            rtsState.cameraX = m.hero.x;
            rtsState.cameraY = m.hero.y;
        });
        console.log("👁️ Overseer RTS Mode enabled. Free camera active.");
    } else {
        rtsState.selectedHobbitIds.clear();
        console.log("🛡️ MOBA Hero Mode enabled. Camera locked to Hero.");
    }
}

/**
 * 2. Translate Screen Coordinates (HTML UI Space) into World Pixel Coordinates
 */
export function screenToWorld(screenX, screenY) {
    const worldX = screenX - viewport.offset[0];
    const worldY = screenY - viewport.offset[1];
    return { x: worldX, y: worldY };
}

/**
 * 3. Evaluate if a unit coordinate falls within the drawn selection bounds
 */
function isWithinSelectionBox(unitX, unitY, startScreen, endScreen) {
    const uScreenX = unitX + viewport.offset[0];
    const uScreenY = unitY + viewport.offset[1];

    const minX = Math.min(startScreen.x, endScreen.x);
    const maxX = Math.max(startScreen.x, endScreen.x);
    const minY = Math.min(startScreen.y, endScreen.y);
    const maxY = Math.max(startScreen.y, endScreen.y);

    return uScreenX >= minX && uScreenX <= maxX && uScreenY >= minY && uScreenY <= maxY;
}

/**
 * 4. Input Triggers: Handle touch initiation
 */
export function handleRtsTouchStart(e) {
    if (!rtsState.enabled) return;

    const touches = e.touches;

    if (touches.length === 1) {
        const tx = touches[0].clientX;
        const ty = touches[0].clientY;
        const worldPos = screenToWorld(tx, ty);

        // A. Check if the player tapped directly on a Hobbit
        let clickedUnit = null;
        for (let hob of hobbits) {
            const dist = Math.hypot((hob.x + 8) - worldPos.x, (hob.y + 8) - worldPos.y);
            if (dist < 16) {
                clickedUnit = hob;
                break;
            }
        }

        if (clickedUnit) {
            // Manage selections
            if (e.shiftKey) {
                if (rtsState.selectedHobbitIds.has(clickedUnit.id)) {
                    rtsState.selectedHobbitIds.delete(clickedUnit.id);
                } else {
                    rtsState.selectedHobbitIds.add(clickedUnit.id);
                }
            } else {
                rtsState.selectedHobbitIds.clear();
                rtsState.selectedHobbitIds.add(clickedUnit.id);
            }
        } else {
            // No unit tapped: initiate camera pan
            rtsState.lastPanTouch = { x: tx, y: ty };
            rtsState.isPanning = true;
        }
    } else if (touches.length === 2) {
        // Two fingers: drag marquee box
        rtsState.isPanning = false;
        rtsState.dragStart = { x: touches[0].clientX, y: touches[0].clientY };
        rtsState.dragCurrent = { x: touches[1].clientX, y: touches[1].clientY };
    }
}

/**
 * 5. Input Updates: Handle drag movements
 */
export function handleRtsTouchMove(e) {
    if (!rtsState.enabled) return;

    const touches = e.touches;

    if (rtsState.isPanning && touches.length === 1 && rtsState.lastPanTouch) {
        const tx = touches[0].clientX;
        const ty = touches[0].clientY;

        const dx = tx - rtsState.lastPanTouch.x;
        const dy = ty - rtsState.lastPanTouch.y;

        // Shift camera positions
        rtsState.cameraX -= dx;
        rtsState.cameraY -= dy;

        rtsState.lastPanTouch = { x: tx, y: ty };
    } else if (touches.length === 2 && rtsState.dragStart) {
        rtsState.dragCurrent = { x: touches[1].clientX, y: touches[1].clientY };
    }
}

/**
 * 6. Input Resolutions: Finalize selections or transmit coordinate commands
 */
export function handleRtsTouchEnd(e) {
    if (!rtsState.enabled) return;

    // A. Resolve Marquee box selection
    if (rtsState.dragStart && rtsState.dragCurrent) {
        rtsState.selectedHobbitIds.clear();

        hobbits.forEach(hob => {
            if (isWithinSelectionBox(hob.x + 8, hob.y + 8, rtsState.dragStart, rtsState.dragCurrent)) {
                rtsState.selectedHobbitIds.add(hob.id);
            }
        });

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

    // C. Resolve unit commands if fingers lift and we have selections
    if (rtsState.selectedHobbitIds.size > 0 && e.touches.length === 0 && e.changedTouches.length === 1) {
        const tx = e.changedTouches[0].clientX;
        const ty = e.changedTouches[0].clientY;
        const worldPos = screenToWorld(tx, ty);

        const tileX = Math.floor(worldPos.x / 16);
        const tileY = Math.floor(worldPos.y / 16);

        // Determine target context
        let actionType = 'MOVE';
        let combatTargetId = null;

        // Scan for hostiles near tap location
        for (let other of hobbits) {
            if (rtsState.selectedHobbitIds.has(other.id)) continue;
            if (Math.hypot((other.x + 8) - worldPos.x, (other.y + 8) - worldPos.y) < 16) {
                combatTargetId = other.id;
                actionType = 'ATTACK';
                break;
            }
        }

        // --- 📡 SEND UNIT COMMAND TO THE SERVER ---
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