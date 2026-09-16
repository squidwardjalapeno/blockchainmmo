// src/plantDefs.js - Pure data, runs in both Node.js and Browser
export const PLANT_DEFS = {
    grass: { stages: [59, 58, 57, 56, 55], growthRate: 0.5, fertilityReq: 3, spreadRange: 2 },
    rose: { stages: [10, 9, 8, 7, 6], growthRate: 0.25, fertilityReq: 8, spreadRange: 2 },
    violet: { stages: [22, 21, 20, 19, 18], growthRate: 0.25, fertilityReq: 8, spreadRange: 2 },
    sunflower: { stages: [118, 117, 116, 115, 114], growthRate: 0.25, fertilityReq: 12, spreadRange: 2 },
    turnip: { stages: [4, 3, 2, 1], growthRate: 0.4, fertilityReq: 5, spreadRange: 1 },
    tomato: { 
        stages: [23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12], 
        tileset: 'cropTileset2', 
        growthRate: 0.2, 
        fertilityReq: 40, 
        spreadRange: 1,
        isCyclical: true,        
        resetGrowth: 26,         
        flowerGrowth: 34,        
        flowerFertilityCost: 15,  
        harvestWindow: 3 
    },
    eggplant: { 
        stages: [46, 45, 44, 43, 42, 41, 40, 39, 38, 37], 
        tileset: 'cropTileset2', 
        growthRate: 0.15, 
        fertilityReq: 85, 
        spreadRange: 1,
        isCyclical: true,        
        resetGrowth: 31,         
        flowerGrowth: 41,        
        flowerFertilityCost: 20  
    },
    strawberry: { 
        stages: [82, 81, 80, 79, 78, 77, 76, 75, 74, 73], 
        tileset: 'cropTileset2', 
        growthRate: 0.24, 
        fertilityReq: 45, 
        spreadRange: 1,
        isCyclical: true,        
        resetGrowth: 31,         
        flowerGrowth: 41,        
        flowerFertilityCost: 10  
    },
    pumpkin: { stages: [100, 99, 98, 97], growthRate: 0.35, fertilityReq: 25, spreadRange: 1 },
    watermelon: { stages: [34, 33, 32, 31], growthRate: 0.35, fertilityReq: 28, spreadRange: 1 },
    corn: { stages: [112, 111, 110, 109], growthRate: 0.35, fertilityReq: 8, spreadRange: 1 },
    wheat: { stages: [64, 63, 62, 61], growthRate: 0.4, fertilityReq: 6, spreadRange: 1 },
    pineapple: { stages: [53, 52, 51, 50, 49], growthRate: 0.05, fertilityReq: 25, spreadRange: 1 },
    potato: { stages: [89, 88, 87, 86, 85], growthRate: 0.15, fertilityReq: 32, spreadRange: 1 }
};