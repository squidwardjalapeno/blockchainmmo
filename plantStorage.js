// plantStorage.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { PLANT_DEFS } from './src/plantDefs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLANTS_DIR = path.join(__dirname, 'data', 'plants');

// Ensure storage directory exists
if (!fs.existsSync(PLANTS_DIR)) {
    fs.mkdirSync(PLANTS_DIR, { recursive: true });
}

export const TYPE_TO_ID = {
    grass: 0, turnip: 1, tomato: 2, eggplant: 3, strawberry: 4,
    pumpkin: 5, watermelon: 6, corn: 7, pineapple: 8, potato: 9,
    wheat: 10, rose: 11, violet: 12, sunflower: 13
};

export const ID_TO_TYPE = Object.fromEntries(
    Object.entries(TYPE_TO_ID).map(([k, v]) => [v, k])
);

export function getPlantChunkPath(cx, cy) {
    return path.join(PLANTS_DIR, `plants_${cx}_${cy}.bin`);
}

/**
 * Appends a single pioneer seed directly into a chunk file.
 */
export function appendPioneerSeedToDisk(cx, cy, lx, ly, typeId, generation = 1) {
    const filePath = getPlantChunkPath(cx, cy);
    const localIdx = (ly * 100) + lx;

    if (!fs.existsSync(filePath)) {
        const buffer = Buffer.alloc(20);
        buffer.writeBigInt64LE(BigInt(Date.now()), 0);
        buffer.writeUInt32LE(1, 8); // plantCount = 1

        buffer.writeUInt16LE(localIdx, 12);
        buffer.writeUInt8(typeId, 14);
        buffer.writeUInt8(0, 15);   // growth = 0
        buffer.writeUInt8(3, 16);   // seedsRemaining = 3
        buffer.writeUInt8(generation & 0xFF, 17);
        buffer.writeUInt8((generation >> 8) & 0xFF, 18);
        buffer.writeUInt8((generation >> 16) & 0xFF, 19);

        fs.writeFileSync(filePath, buffer);
        return;
    }

    const existing = fs.readFileSync(filePath);
    if (existing.length < 12) return;

    const count = existing.readUInt32LE(8);
    const updated = Buffer.alloc(existing.length + 8);
    existing.copy(updated, 0);

    updated.writeUInt32LE(count + 1, 8);

    const offset = existing.length;
    updated.writeUInt16LE(localIdx, offset);
    updated.writeUInt8(typeId, offset + 2);
    updated.writeUInt8(0, offset + 3);
    updated.writeUInt8(3, offset + 4);
    updated.writeUInt8(generation & 0xFF, offset + 5);
    updated.writeUInt8((generation >> 8) & 0xFF, offset + 6);
    updated.writeUInt8((generation >> 16) & 0xFF, offset + 7);

    fs.writeFileSync(filePath, updated);
}

/**
 * Serializes a Map of plants directly into the 8-byte-per-plant binary format.
 */
export function savePlantChunk(cx, cy, plantsMap, timestamp = Date.now()) {
    const filePath = getPlantChunkPath(cx, cy);
    const plantList = [];

    for (let [key, plant] of plantsMap) {
        const pCX = Math.floor(plant.gx / 100);
        const pCY = Math.floor(plant.gy / 100);
        if (pCX === cx && pCY === cy) {
            plantList.push(plant);
        }
    }

    const bufferSize = 12 + (plantList.length * 8);
    const buffer = Buffer.alloc(bufferSize);

    // 12-byte header: [timestamp (8 bytes), plantCount (4 bytes)]
    buffer.writeBigInt64LE(BigInt(timestamp), 0);
    buffer.writeUInt32LE(plantList.length, 8);

    let offset = 12;
    for (let p of plantList) {
        const lx = ((p.gx % 100) + 100) % 100;
        const ly = ((p.gy % 100) + 100) % 100;
        const localIdx = (ly * 100) + lx;

        const typeId = TYPE_TO_ID[p.type] !== undefined ? TYPE_TO_ID[p.type] : 0;
        const growth = Math.min(100, Math.max(0, Math.floor(p.growth || 0)));
        const seedsRemaining = Math.min(3, Math.max(0, p.seedsRemaining !== undefined ? p.seedsRemaining : 3));
        const generation = Math.min(16777215, Math.max(0, p.generation || 0));

        buffer.writeUInt16LE(localIdx, offset);
        buffer.writeUInt8(typeId, offset + 2);
        buffer.writeUInt8(growth, offset + 3);
        buffer.writeUInt8(seedsRemaining, offset + 4);
        buffer.writeUInt8(generation & 0xFF, offset + 5);
        buffer.writeUInt8((generation >> 8) & 0xFF, offset + 6);
        buffer.writeUInt8((generation >> 16) & 0xFF, offset + 7);

        offset += 8;
    }

    fs.writeFileSync(filePath, buffer);
}

/**
 * Loads a chunk's binary data. If enough time has passed, invokes
 * plantWorker.js to simulate the offline delta.
 */
export function loadPlantChunkWithCatchUpAsync(cx, cy, worldSeed) {
    return new Promise((resolve) => {
        const filePath = getPlantChunkPath(cx, cy);

        // File does not exist yet; signal server to generate initial baseline
        if (!fs.existsSync(filePath)) {
            resolve(null);
            return;
        }

        const rawBuffer = fs.readFileSync(filePath);
        if (rawBuffer.length < 12) {
            resolve(null);
            return;
        }

        const savedTimestamp = Number(rawBuffer.readBigInt64LE(0));
        const deltaSeconds = Math.max(0, (Date.now() - savedTimestamp) / 1000);

        // If the chunk was updated less than 15 seconds ago, skip thread overhead
        if (deltaSeconds <= 15.0) {
            resolve(rawBuffer);
            return;
        }

        // Delegate mathematical catch-up to the worker thread
        const workerPath = path.join(__dirname, 'plantWorker.js');
        const worker = new Worker(workerPath);
        const transfer = rawBuffer.buffer.slice(rawBuffer.byteOffset, rawBuffer.byteOffset + rawBuffer.byteLength);

        worker.postMessage({
            cx,
            cy,
            rawBuffer: transfer,
            deltaSeconds,
            worldSeed
        }, [transfer]);

        worker.on('message', (result) => {
            const finalBuf = Buffer.from(result.buffer);
            
            // Persist the caught-up generation directly to disk
            fs.writeFileSync(filePath, finalBuf);
            
            console.log(`🌾 Generational Catch-Up: Chunk [${result.cx}, ${result.cy}] advanced through ${result.elapsedGenerations} generation(s). Total lineage: ${result.plantCount} plants.`);

            worker.terminate();
            resolve(finalBuf);
        });

        worker.on('error', (err) => {
            console.error(`Worker error in chunk [${cx}, ${cy}]:`, err);
            worker.terminate();
            resolve(rawBuffer);
        });
    });
}