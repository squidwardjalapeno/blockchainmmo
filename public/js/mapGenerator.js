let currentSeed = 1;

export function seededRandom() {
    // Bitwise ops keep this fast and within 32-bit range
    currentSeed = (Math.imul(currentSeed, 1664525) + 1013904223) | 0;
    return (currentSeed >>> 0) / 4294967296;
}

export function setWorldSeed(seed) {
    currentSeed = seed | 0;
}

/**
 * Uses a flat Uint8Array for high performance
 */
export function generateWorld(width, height, iterations = 8) {
    const size = width * height;
    let map = new Uint8Array(size);
    let nextMap = new Uint8Array(size);

    // Initial Random Fill
    for (let i = 0; i < size; i++) {
        map[i] = (seededRandom() * 100) + 1;
    }

    for (let iter = 0; iter < iterations; iter++) {
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                
                // Directly pick a random neighbor index without creating an array
                const offsetX = (seededRandom() * 3 | 0) - 1; // -1, 0, or 1
                const offsetY = (seededRandom() * 3 | 0) - 1;
                
                // Deterministic neighbor picking
                nextMap[i] = map[(y + offsetY) * width + (x + offsetX)];
            }
        }
        // Swap buffers instead of copying
        let temp = map;
        map = nextMap;
        nextMap = temp;
    }

    return cleanUpMap(map, width, height);
}

function cleanUpMap(map, width, height) {
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const isLand = map[i] >= 67;

            // Direct neighbor check (North, South, West, East)
            let landNeighbors = 0;
            if (map[i - width] >= 67) landNeighbors++;
            if (map[i + width] >= 67) landNeighbors++;
            if (map[i - 1]     >= 67) landNeighbors++;
            if (map[i + 1]     >= 67) landNeighbors++;

            if (isLand && landNeighbors === 0) {
                map[i] = (seededRandom() * 66) + 1;
            } else if (!isLand && landNeighbors === 4) {
                map[i] = (seededRandom() * 33) + 67;
            }
        }
    }
    return map;
}
