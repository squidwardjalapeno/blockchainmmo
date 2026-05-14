// src/viewport.js
import { CONFIG } from './config.js';

if (typeof window !== 'undefined') {
    logStep("viewport.js loaded");
}

const TILE_SZ = CONFIG.TILE_SIZE; // 16
const WORLD_TILE_LIMIT = CONFIG.MAP_SIZE * 100; 

export const viewport = {
    // 🛡️ INITIALIZE WITH ZOOM: Division ensures the lens matches the canvas size
    screen: [
        window.innerWidth / (CONFIG.ZOOM || 1), 
        window.innerHeight / (CONFIG.ZOOM || 1)
    ],
    startTile: [0, 0],
    endTile: [0, 0],
    offset: [0, 0],

    update: function(heroPX, heroPY) {
        // 1. Lock the focus point to a whole number to prevent sub-pixel shimmering
        const targetX = Math.floor(heroPX);
        const targetY = Math.floor(heroPY);

        const centerTileX = Math.floor(targetX / TILE_SZ);
        const centerTileY = Math.floor(targetY / TILE_SZ);

        // 2. Center calculations based on the smaller zoomed resolution
        const halfTilesX = Math.ceil((this.screen[0] / 2) / TILE_SZ);
        const halfTilesY = Math.ceil((this.screen[1] / 2) / TILE_SZ);

        // 3. Define the visible tile range for culling (with 1-tile safety buffer)
        this.startTile[0] = Math.max(0, centerTileX - halfTilesX - 1);
        this.startTile[1] = Math.max(0, centerTileY - halfTilesY - 1);
        this.endTile[0] = Math.min(WORLD_TILE_LIMIT - 1, centerTileX + halfTilesX + 1);
        this.endTile[1] = Math.min(WORLD_TILE_LIMIT - 1, centerTileY + halfTilesY + 1);

        // 4. MASTER INTEGER OFFSET: 
        // This is the golden rule for pixel smoothness. It must be an absolute integer.
        this.offset[0] = Math.floor((this.screen[0] / 2) - targetX);
        this.offset[1] = Math.floor((this.screen[1] / 2) - targetY);
    }
};