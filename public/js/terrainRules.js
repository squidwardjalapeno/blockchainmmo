// terrainRules.js
import { CONFIG } from './config.js';

export const SHORELINE_CONFIGS = {
    // Basic Sides
    1: "northSide", 2: "westSide", 4: "eastSide", 8: "southSide",

    // Passages
    9: "northSouthPassage", 6: "eastWestPassage",

    // Elbows (Inner Curves)
    3: "northWestElbow", 5: "northEastElbow", 10: "southWestElbow", 12: "southEastElbow",

    // 3-Sided Elbows
    7: "westNorthEastElbow", 13: "northEastSouthElbow", 14: "westSouthEastElbow", 11: "northWestSouthElbow",

    // Outer Corners (Diagonals)
    16: "northWestCorner", 32: "northEastCorner", 64: "southWestCorner", 128: "southEastCorner",

    // Two Corners
    48: "northTwoCorners", 80: "westTwoCorners", 160: "eastTwoCorners", 192: "southTwoCorners",

    // Cross Corners
    96: "northEastCrossCorners", 144: "northWestCrossCorners",

    // Three & Four Corners
    176: "northEastThreeCorners", 112: "northWestThreeCorners", 224: "southEastThreeCorners", 208: "southWestThreeCorners",
    240: "allFourCorners",

    // Sides + Corners
    65: "northSideSWCorner", 129: "northSideSECorner", 193: "northSideBothCorners",
    34: "westSideNECorner", 130: "westSideSECorner", 162: "westSideBothCorners",
    20: "eastSideNWCorner", 68: "eastSideSWCorner", 84: "eastSideBothCorners",
    24: "southSideNWCorner", 40: "southSideNECorner", 56: "southSideBothCorners",

    // Elbow + Corner
    131: "northWestElbowCorner", 69: "northEastElbowCorner", 42: "southWestElbowCorner", 28: "southEastElbowCorner",

    // Special
    15: "completelyEnclosed",
    0: "openWater"
};


export function applyShorelineRules(i, j, map) {

    
    

    const landThresh = CONFIG.LAND_THRESHOLD;
    let score = 0;

    // Standardize: (xOffset, yOffset)
    const isLand = (xOff, yOff) => {
        const col = i + xOff; // i is X (Columns)
        const row = j + yOff; // j is Y (Rows)
        if (col < 0 || col >= 100 || row < 0 || row >= 100) return false;

        //console.log(`Center Check: Standing at [${i},${j}], checking neighbor [${col},${row}]. Value: ${map[col] ? map[col][row] : 'OUT'}`);



        return map[col][row] >= landThresh;
    };

    // Now these match your comments perfectly:
    if (isLand(0, -1))  score += 1;   // North (Up)
    if (isLand(-1, 0))  score += 2;   // West  (Left)
    if (isLand(1, 0))   score += 4;   // East  (Right)
    if (isLand(0, 1))   score += 8;   // South (Down)
    
    // Diagonals
    if (isLand(-1, -1)) score += 16;  // NW
    if (isLand(1, -1))  score += 32;  // NE
    if (isLand(-1, 1))  score += 64;  // SW
    if (isLand(1, 1))   score += 128; // SE

    return SHORELINE_CONFIGS[score] || "openWater";
}

/*
    // Use a Switch or Lookup Table instead of 100 IFs
    switch(score) {
        case 1:  return "northSide";
        case 2:  return "westSide";
        case 4:  return "eastSide";
        case 8:  return "southSide";

        case 9:  return "northSouthPassage";
        case 6:  return "eastWestPassage";

        case 3:  return "northWestElbow";
        case 5:  return "northEastElbow";
        case 10: return "southWestElbow";
        case 12: return "southEastElbow";

        case 7: return "westNorthEastElbow"
        case 13: return "northEastSouthElbow"
        case 14: return "westSouthEastElbow"
        case 11: return "northWestSouthElbow"

        case 16: return "northWestCorner"
        case 32: return "northEastCorner"
        case 64: return "southWestCorner"
        case 128:return "southEastCorner"

        case 48: return "northTwoCorners"
        case 80: return "westTwoCorners"
        case 160:return "eastTwoCorners"
        case 192:return "southTwoCorners"

        case 96: return "northEastCrossCorners"
        case 144:return "northWestCrossCorners"

        case 176:return "northEastThreeCorners"
        case 112:return "northWestThreeCorners"
        case 224:return "southEastThreeCorners"
        case 208:return "southWestThreeCorners"

        case 240:return "allFourCorners"

        case 65: return "northSideSWCorner"
        case 129:return "northSideSECorner"
        case 193:return "northSideBothCorners"
        case 34: return "westSideNECorner"
        case 130:return "westSideSECorner"
        case 162:return "westSideBothCorners"
        case 20: return "eastSideNWCorner"
        case 68: return "eastSideSWCorner"
        case 84: return "eastSideBothCorners"
        case 24: return "southSideNWCorner"
        case 40: return "southSideNECorner"
        case 56: return "southSideBothCorners"

        case 131:return "northWestElbowCorner";
        case 69: return "northEastElbowCorner";
        case 42: return "southWestElbowCorner";
        case 28: return "southEastElbowCorner";

        
        case 15: return "completelyEnclosed";


        default: return "openWater";
    }
        */
