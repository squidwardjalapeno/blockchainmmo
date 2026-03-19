// js/config.js

export const CONFIG = {
    // --- World Dimensions ---
    MAP_SIZE: 100,          // The 100x100 "Logic" Grid
    CELL_SIZE: 100,         // Tiles inside each Cell (100x100)
    TILE_SIZE: 16,          // Pixel size of one tile
    
    // --- Physics & Terrain ---
    LAND_THRESHOLD: 67,     // Value >= 67 is Land, < 67 is Water
    WOBBLE_MAX: 30,         // Max beach length in paintSide
    
    // --- Entities ---
    HERO_SPEED: 512,        // (32 * 16) pixels per second
    HERO_START_X: 500,
    HERO_START_Y: 500,
    
    // --- Visuals ---
    FONT_STYLE: "8px Helvetica",
    UI_COLOR: "rgb(250, 25, 250)",
    
    // --- Spritesheet Layout ---
    SHEET_WIDTH_TILES: 8,  
    SHEET_HEIGHT_TILES: 8, // Your spritesheet is 8 tiles wide

    // --- Spritesheet Layout ---
    CROP_SHEET_WIDTH_TILES: 12,  
    CROP_SHEET_HEIGHT_TILES: 10,

    // --- Bacteria System ---
    BACTERIA_TICK_RATE: 1000, // Update every 1 second (in ms)
    BACTERIA_SAMPLES: 2000      // How many random tiles to check per cell per tick
};
