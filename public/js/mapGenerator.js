// 1. THE SEED ENGINE
let currentSeed = 1;

/**
 * A Deterministic Random function.
 * Given the same seed, it will ALWAYS return the same sequence of numbers.
 */
function seededRandom() {
    // LCG (Linear Congruential Generator) algorithm
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
    return currentSeed / 4294967296;
}

/**
 * Call this when receiving the 'secret' event from the server
 */
export function setWorldSeed(seed) {
    currentSeed = seed;
    console.log(`🌱 World Seed Locked to: ${seed}`);
}

/**
 * Initializes a 2D array with seeded values.
 */
export function generateInitialMap(width, height) {
    let map = [];
    for (let i = 0; i < width; i++) {
        map[i] = [];
        for (let j = 0; j < height; j++) {
            // Use seededRandom instead of Math.random
            map[i][j] = Math.floor(seededRandom() * 100) + 1;
        }
    }
    return map;
}

/**
 * Optimized Cellular Automata
 */
export function cellularAutomata(map) {
    const width = map.length;
    const height = map[0].length;
    
    // FASTER COPY: Avoids JSON.parse overhead
    const newMap = map.map(row => [...row]);

    for (let i = 1; i < width - 1; i++) {
        for (let j = 1; j < height - 1; j++) {
            const neighbors = [
                map[i-1][j], map[i+1][j], map[i][j-1], map[i][j+1],
                map[i+1][j+1], map[i-1][j+1], map[i-1][j-1], map[i+1][j-1]
            ];
            
            // Use seededRandom to pick the neighbor
            const idx = Math.floor(seededRandom() * neighbors.length);
            newMap[i][j] = neighbors[idx];
        }
    }
    return newMap;
}

/**
 * Cleans up isolated tiles using seeded randoms
 */
export function cleanUpMap(map) {
    const width = map.length;
    const height = map[0].length;

    for (let i = 1; i < width - 1; i++) {
        for (let j = 1; j < height - 1; j++) {
            const isLand = map[i][j] >= 67;
            const neighbors = [map[i-1][j], map[i][j-1], map[i+1][j], map[i][j+1]];
            const landNeighbors = neighbors.filter(v => v >= 67).length;

            if (isLand && landNeighbors === 0) {
                map[i][j] = Math.floor(seededRandom() * 66) + 1; 
            } else if (!isLand && landNeighbors === 4) {
                map[i][j] = Math.floor(seededRandom() * 33) + 67;
            }
        }
    }
    return map;
}

/**
 * Runs the full generation sequence.
 */
export function generateWorld(width, height, iterations = 8) {
    // Note: With seeded neighbors, 8-10 iterations is usually enough!
    let map = generateInitialMap(width, height);
    for (let i = 0; i < iterations; i++) {
        map = cellularAutomata(map);
    }
    return cleanUpMap(map);
}
