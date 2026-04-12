// js/viewport.js
import { CONFIG } from './config.js';

const TILE_SZ = CONFIG.TILE_SIZE; // 16
// 200 cells * 100 tiles = 20,000 tiles wide world
const WORLD_TILE_LIMIT = CONFIG.MAP_SIZE * 100; 

export const viewport = {
    screen: [window.innerWidth, window.innerHeight],
    startTile: [0, 0],
    endTile: [0, 0],
    offset: [0, 0], // We'll keep this for any legacy UI needs

    update: function(heroPX, heroPY) {
        // 1. Where is the hero in Tile Coordinates?
        const centerTileX = Math.floor(heroPX / TILE_SZ);
        const centerTileY = Math.floor(heroPY / TILE_SZ);

        // 2. How many tiles fit on half the screen?
        const halfTilesX = Math.ceil((this.screen[0] / 2) / TILE_SZ);
        const halfTilesY = Math.ceil((this.screen[1] / 2) / TILE_SZ);

        // 3. Define the visible range (The Culling Box)
        // We add +1 for a small buffer so tiles don't "pop" at the edges
        this.startTile[0] = Math.max(0, centerTileX - halfTilesX - 1);
        this.startTile[1] = Math.max(0, centerTileY - halfTilesY - 1);

        this.endTile[0] = Math.min(WORLD_TILE_LIMIT - 1, centerTileX + halfTilesX + 1);
        this.endTile[1] = Math.min(WORLD_TILE_LIMIT - 1, centerTileY + halfTilesY + 1);

        // 4. Legacy Offset (Optional)
        // If any of your UI still uses viewport.offset, we keep it centered
        this.offset[0] = Math.floor((this.screen[0] / 2) - heroPX);
        this.offset[1] = Math.floor((this.screen[1] / 2) - heroPY);
    }
};
