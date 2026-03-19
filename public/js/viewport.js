// js/viewport.js
import { CONFIG } from './config.js';

const TILE_W = CONFIG.TILE_SIZE;
const TILE_H = CONFIG.TILE_SIZE;
const MAP_W = CONFIG.MAP_SIZE * CONFIG.CELL_SIZE; // 100 cells * 100 tiles
const MAP_H = CONFIG.MAP_SIZE * CONFIG.CELL_SIZE;

export const viewport = {
    screen: [0, 0],
    startTile: [0, 0],
    endTile: [0, 0],
    offset: [0, 0],

    update: function(px, py) {
        // Calculate camera offset to center on hero
        this.offset[0] = Math.floor((this.screen[0] / 2) - px);
        this.offset[1] = Math.floor((this.screen[1] / 2) - py);

        const tile = [Math.floor(px / TILE_W), Math.floor(py / TILE_H)];

        // Calculate which tiles are visible on screen
        this.startTile[0] = tile[0] - 1 - Math.ceil((this.screen[0] / 2) / TILE_W);
        this.startTile[1] = tile[1] - 1 - Math.ceil((this.screen[1] / 2) / TILE_H);

        if (this.startTile[0] < 0) this.startTile[0] = 0;
        if (this.startTile[1] < 0) this.startTile[1] = 0;

        this.endTile[0] = tile[0] + 1 + Math.ceil((this.screen[0] / 2) / TILE_W);
        this.endTile[1] = tile[1] + 1 + Math.ceil((this.screen[1] / 2) / TILE_H);

        if (this.endTile[0] >= MAP_W) this.endTile[0] = MAP_W;
        if (this.endTile[1] >= MAP_H) this.endTile[1] = MAP_H;
    }
};
