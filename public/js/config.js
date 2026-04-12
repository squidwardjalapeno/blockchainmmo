// js/config.js

export const CONFIG = {
    // --- World Dimensions ---
    MAP_SIZE: 100,          // The 100x100 "Logic" Grid
    CELL_SIZE: 100,         // Tiles inside each Cell (100x100)
    TILE_SIZE: 16,          // Pixel size of one tile
    
    // --- Physics & Terrain ---
    LAND_THRESHOLD: 55,     // Value >= 67 is Land, < 67 is Water
    WOBBLE_MAX: 30,         // Max beach length in paintSide
    
          // (32 * 16) pixels per second
    HERO_START_X: 500,
    HERO_START_Y: 500,

    // --- Entities ---
    HERO_HP: 100,
    HERO_ATTACK: 10,
    HERO_MAGIC: 10,
    HERO_ARMOR: 0,
    HERO_MAGIC_RESISTANCE: 0,
    HERO_SPEED: 100,  
    
    
    // --- Visuals ---
    FONT_STYLE: "8px Helvetica",
    UI_COLOR: "rgb(250, 25, 250)",
    
    // --- Spritesheet Layout ---
    SHEET_WIDTH_TILES: 8,  
    SHEET_HEIGHT_TILES: 8, // Your spritesheet is 8 tiles wide

    // --- Spritesheet Layout ---
    CROP_SHEET_WIDTH_TILES: 12,  
    CROP_SHEET_HEIGHT_TILES: 10,

    // --- Spritesheet Layout ---
    GARDEN_SHEET_WIDTH_TILES: 16,  
    GARDEN_SHEET_HEIGHT_TILES: 19,

    // --- Spritesheet Layout ---
    SPELL_SHEET_WIDTH_TILES: 16,  
    SPELL_SHEET_HEIGHT_TILES: 28,

    // --- Spritesheet Layout ---
    JEWELRY_SHEET_WIDTH_TILES: 16,  
    JEWELRY_SHEET_HEIGHT_TILES: 28,

    // --- Spritesheet Layout ---
    WEAPON_SHEET_WIDTH_TILES: 16,  
    WEAPON_SHEET_HEIGHT_TILES: 52,

    // --- Spritesheet Layout ---
    ARMOR_SHEET_WIDTH_TILES: 16,  
    ARMOR_SHEET_HEIGHT_TILES: 35,

     // --- Spritesheet Layout ---
    POTION_SHEET_WIDTH_TILES: 16,  
    POTION_SHEET_HEIGHT_TILES: 10,

      // --- Spritesheet Layout ---
    CRAFTING_SHEET_WIDTH_TILES: 16,  
    CRAFTING_SHEET_HEIGHT_TILES: 9,

      // --- Spritesheet Layout ---
    JEWEL_SHEET_WIDTH_TILES: 16,  
    JEWEL_SHEET_HEIGHT_TILES: 11,

      // --- Spritesheet Layout ---
    KEY_SHEET_WIDTH_TILES: 16,  
    KEY_SHEET_HEIGHT_TILES: 12,

    // --- Bacteria System ---
    BACTERIA_TICK_RATE: 1000, // Update every 1 second (in ms)
    BACTERIA_SAMPLES: 2000      // How many random tiles to check per cell per tick
};
