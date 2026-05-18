import { CONFIG } from "./config.js";

// To this:
if (typeof window !== 'undefined') {
    logStep("mapGenerator.js");
}

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
    let finalMap = cleanUpMap(map, width, height);

    // Define Oceans, Lakes, and Continents
    finalMap = analyzeGeography(finalMap, width, height);

    // 👇 NEW: Paint the Biomes!
    finalMap = markBiomes(finalMap, width, height);

    return finalMap;
}


export function analyzeGeography(map, width, height) {
    const size = width * height;
    const visited = new Uint8Array(size);
    const lakes = [];
    const continents = [];

    // Pre-allocate a fast stack array to prevent browser memory crashes
    const stack = new Int32Array(size);

    // Helper: Iterative Flood Fill
    function fill(startIdx, checkCondition) {
        let stackPtr = 0;
        stack[stackPtr++] = startIdx;
        visited[startIdx] = 1;
        const group = [];

        while (stackPtr > 0) {
            const idx = stack[--stackPtr];
            group.push(idx);

            const x = idx % width;
            const y = Math.floor(idx / width);

            // Check neighbors (North, South, West, East)
            if (y > 0 && !visited[idx - width] && checkCondition(map[idx - width])) {
                visited[idx - width] = 1;
                stack[stackPtr++] = idx - width;
            }
            if (y < height - 1 && !visited[idx + width] && checkCondition(map[idx + width])) {
                visited[idx + width] = 1;
                stack[stackPtr++] = idx + width;
            }
            if (x > 0 && !visited[idx - 1] && checkCondition(map[idx - 1])) {
                visited[idx - 1] = 1;
                stack[stackPtr++] = idx - 1;
            }
            if (x < width - 1 && !visited[idx + 1] && checkCondition(map[idx + 1])) {
                visited[idx + 1] = 1;
                stack[stackPtr++] = idx + 1;
            }
        }
        return group;
    }

    // 1. FILL THE OCEAN (Starts at 0,0 which is guaranteed to be border water)
    const oceanTiles = fill(0, (val) => val < CONFIG.LAND_THRESHOLD);
    for (let i = 0; i < oceanTiles.length; i++) {
        map[oceanTiles[i]] = 10; // Tile 10 = Ocean
    }

    // 2. FIND LAKES & CONTINENTS
    for (let i = 0; i < size; i++) {
        if (!visited[i]) {
            const isLand = map[i] >= CONFIG.LAND_THRESHOLD;
            
            if (!isLand) {
                // Unvisited Water = Lake
                const lakeTiles = fill(i, (val) => val < CONFIG.LAND_THRESHOLD);
                lakes.push(lakeTiles);
                for (let j = 0; j < lakeTiles.length; j++) {
                    map[lakeTiles[j]] = 11; // Tile 11 = Lake
                }
            } else {
                // Unvisited Land = Continent
                const contTiles = fill(i, (val) => val >= CONFIG.LAND_THRESHOLD);
                continents.push(contTiles);
            }
        }
    }

    // Sort by size (largest first) so Continent 0 is the main landmass
    continents.sort((a, b) => b.length - a.length);
    lakes.sort((a, b) => b.length - a.length);

    console.log(`🌍 Geography Analyzed: 1 Ocean, ${lakes.length} Lakes, ${continents.length} Continents.`);
    
    // We attach the geography data to the window so we can easily use it for rivers later!
    window.geography = { lakes, continents };

    return map;
}

// 🌲 BIOME GENERATOR (Adds Forests, Rivers, and Deserts)
export function markBiomes(map, width, height) {
    if (!window.geography || !window.geography.lakes) return map;

    const lakes = window.geography.lakes;
    const lakeCenters = [];

    // 1. Get Lake Centers
    for (let i = 0; i < lakes.length; i++) {
        let sumX = 0, sumY = 0;
        for (let idx of lakes[i]) {
            sumX += idx % width;
            sumY += Math.floor(idx / width);
        }
        lakeCenters.push({
            x: Math.floor(sumX / lakes[i].length),
            y: Math.floor(sumY / lakes[i].length)
        });
    }

    // 2. Mark Rivers on the Macro Map (Tile 12)
    for (let i = 0; i < lakeCenters.length; i++) {
        const lakeA = lakeCenters[i];
        let closestLake = null;
        let shortestDist = Infinity;

        for (let j = 0; j < lakeCenters.length; j++) {
            if (i === j) continue;
            const dist = Math.abs(lakeA.x - lakeCenters[j].x) + Math.abs(lakeA.y - lakeCenters[j].y);
            if (dist < shortestDist) {
                shortestDist = dist;
                closestLake = lakeCenters[j];
            }
        }

        if (closestLake) {
            let curX = lakeA.x;
            let curY = lakeA.y;
            let steps = 0;
            while ((curX !== closestLake.x || curY !== closestLake.y) && steps < 5000) {
                steps++;
                if (Math.abs(curX - closestLake.x) > Math.abs(curY - closestLake.y)) {
                    if (curX < closestLake.x) curX++; else curX--;
                } else {
                    if (curY < closestLake.y) curY++; else curY--;
                }

                if (curX > 0 && curX < width - 1 && curY > 0 && curY < height - 1) {
                    const pIdx = curY * width + curX;
                    if (map[pIdx] >= CONFIG.LAND_THRESHOLD && map[pIdx] < 100) {
                        map[pIdx] = 12; // 12 = River
                    }
                }
            }
        }
    }

    // ==========================================
    // 3. DISTANCE FIELD (Find the Deserts!)
    // ==========================================
    const distMap = new Int32Array(width * height).fill(9999);
    let queue = [];
    
    // Seed the queue with EVERY water tile (Ocean=10, Lake=11, River=12)
    for (let i = 0; i < width * height; i++) {
        if (map[i] === 10 || map[i] === 11 || map[i] === 12) {
            distMap[i] = 0;
            queue.push(i);
        }
    }

    // Expand outward mathematically
    let currentDist = 0;
    while (queue.length > 0) {
        currentDist++;
        let nextQueue = [];
        for (let i = 0; i < queue.length; i++) {
            const idx = queue[i];
            const x = idx % width;
            const y = Math.floor(idx / width);

            // Check North, South, West, East
            if (y > 0 && distMap[idx - width] > currentDist) { distMap[idx - width] = currentDist; nextQueue.push(idx - width); }
            if (y < height - 1 && distMap[idx + width] > currentDist) { distMap[idx + width] = currentDist; nextQueue.push(idx + width); }
            if (x > 0 && distMap[idx - 1] > currentDist) { distMap[idx - 1] = currentDist; nextQueue.push(idx - 1); }
            if (x < width - 1 && distMap[idx + 1] > currentDist) { distMap[idx + 1] = currentDist; nextQueue.push(idx + 1); }
        }
        queue = nextQueue;
    }

   // ==========================================
    // 4. PAINT BIOMES (Forests, Deserts, & Mountains)
    // ==========================================
    const newMap = new Uint8Array(map); 
    const DESERT_THRESHOLD = 12;   // 12 to 23 cells from water
    const MOUNTAIN_THRESHOLD = 24; // 24+ cells from water (Deepest interior!)
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            // Only affect basic land
            if (map[idx] >= CONFIG.LAND_THRESHOLD && map[idx] < 100) {
                
                // 🏔️ Check Mountain (Deepest interior!)
                if (distMap[idx] >= MOUNTAIN_THRESHOLD) {
                    newMap[idx] = 106; // 106 = Snowy Mountain Biome
                }
                // 🏜️ Check Desert (Mid-interior)
                else if (distMap[idx] >= DESERT_THRESHOLD) {
                    newMap[idx] = 105; // 105 = Desert Biome
                } 
                // 🌲 Check Forest (Within 3 cells of ANY water 10, 11, or 12)
                else {
                    let nearWater = false;
                    for (let oy = -3; oy <= 3; oy++) {
                        for (let ox = -3; ox <= 3; ox++) {
                            const nx = x + ox;
                            const ny = y + oy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nIdx = ny * width + nx;
                                // 👇 ADDED 10 (Ocean) to the water check!
                                if (map[nIdx] === 10 || map[nIdx] === 11 || map[nIdx] === 12) {
                                    nearWater = true; break;
                                }
                            }
                        }
                        if (nearWater) break;
                    }
                    if (nearWater) {
                        newMap[idx] = 104; // 104 = Forest Biome
                    }
                }
            }
        }
    }

    console.log("🌍 Biomes Generated: Forests, Deserts, and Mountains added.");
    return newMap;
}

function cleanUpMap(map, width, height) {
    // 1. THE ISLAND MASK: Force a 1-chunk wide ocean around the entire map
    const borderThickness = 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x < borderThickness || x >= width - borderThickness || y < borderThickness || y >= height - borderThickness) {
                map[y * width + x] = 10; // 10 = Deep Water
            }
        }
    }

    // 2. YOUR SMOOTHING LOGIC
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const i = row + x;
            
            // Skip smoothing the deep ocean border we just made
            if (x < borderThickness || x >= width - borderThickness || y < borderThickness || y >= height - borderThickness) {
                continue; 
            }

            const isLand = map[i] >= CONFIG.LAND_THRESHOLD;

            let landNeighbors = 0;
            let totalNeighbors = 0; 

            // Safely check North
            if (y > 0) {
                totalNeighbors++;
                if (map[i - width] >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            }
            // Safely check South
            if (y < height - 1) {
                totalNeighbors++;
                if (map[i + width] >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            }
            // Safely check West
            if (x > 0) {
                totalNeighbors++;
                if (map[i - 1] >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            }
            // Safely check East
            if (x < width - 1) {
                totalNeighbors++;
                if (map[i + 1] >= CONFIG.LAND_THRESHOLD) landNeighbors++;
            }

            // If ALL available neighbors are water, become water (Erodes the sharp square edges!)
            if (isLand && landNeighbors === 0) {
                map[i] = (seededRandom() * (CONFIG.LAND_THRESHOLD - 1)) + 1 | 0;
            } 
            // If ALL available neighbors are land, become land (Fills in puddles)
            else if (!isLand && landNeighbors === totalNeighbors) {
                map[i] = (seededRandom() * (100 - CONFIG.LAND_THRESHOLD)) + CONFIG.LAND_THRESHOLD | 0;
            }
        }
    }
    
    return map;
}
