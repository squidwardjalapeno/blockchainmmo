import { CONFIG } from "./config.js";

let currentSeed = 1;

export function seededRandom() {
    // Bitwise ops keep this fast and within 32-bit range
    currentSeed = (Math.imul(currentSeed, 1664525) + 1013904223) | 0;
    return (currentSeed >>> 0) / 4294967296;
}

export function setWorldSeed(seed) {
    currentSeed = seed | 0;
}

export function generateWorld(width, height, iterations = 80) {
    const size = width * height;
    let map = new Uint8Array(size);
    let nextMap = new Uint8Array(size);

    // Initial Random Fill
    for (let i = 0; i < size; i++) {
        map[i] = (seededRandom() * 100) + 1 | 0;
    }

    for (let iter = 0; iter < iterations; iter++) {
        for (let y = 1; y < height - 1; y++) {
            const row = y * width; // Optimization: pre-calculate row start
            for (let x = 1; x < width - 1; x++) {
                const i = row + x;
                
                const offsetX = (seededRandom() * 3 | 0) - 1;
                const offsetY = (seededRandom() * 3 | 0) - 1;
                
                nextMap[i] = map[(y + offsetY) * width + (x + offsetX)];
            }
        }

        // Swap buffers
        let temp = map;
        map = nextMap;
        nextMap = temp;

        // Run cleanup every 10 iterations
        // We use (iter + 1) so it doesn't run on iteration 0
        if ((iter + 1) % 10 === 0) {
            map = cleanUpMap(map, width, height);
        }
    }

    // Final pass to ensure the returned map is tidy
    return cleanUpMap(map, width, height);
}

function cleanUpMap(map, width, height) {
    for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
            const i = row + x;
            const isLand = map[i] >= CONFIG.LAND_THRESHOLD;

            let landNeighbors = 0;
            if (map[i - width] >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            if (map[i + width] >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            if (map[i - 1]     >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            if (map[i + 1]     >= CONFIG.LAND_THRESHOLD) landNeighbors++;

            if (isLand && landNeighbors === 0) {
                map[i] = (seededRandom() * (CONFIG.LAND_THRESHOLD - 1)) + 1 | 0;
            } else if (!isLand && landNeighbors === 4) {
                map[i] = (seededRandom() * (100 - CONFIG.LAND_THRESHOLD)) + CONFIG.LAND_THRESHOLD | 0;
            }
        }
    }
    return map;
}

