// chunkStorage.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNKS_DIR = path.join(__dirname, 'data', 'chunks');

// Ensure directory exists on disk
if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
    console.log(`📁 Created binary chunks directory at: ${CHUNKS_DIR}`);
}

// In-memory binary cache
const loadedChunks = new Map(); // key: "cx_cy", value: { bacteria: Uint32Array, fertility: Uint8Array, dirty: boolean, lastUpdated: number }

export function getChunkPath(cx, cy) {
    return path.join(CHUNKS_DIR, `chunk_${cx}_${cy}.bin`);
}

/**
 * Loads a chunk's binary buffer from disk or creates a baseline chunk.
 */
export function getOrCreateServerChunk(cx, cy) {
    const key = `${cx}_${cy}`;
    if (loadedChunks.has(key)) {
        return loadedChunks.get(key);
    }

    const filePath = getChunkPath(cx, cy);
    let bacteria;
    let fertility;

    if (fs.existsSync(filePath)) {
        // Read raw 50,000 bytes directly from disk
        const rawBuffer = fs.readFileSync(filePath);
        
        // Wrap slices in TypedArrays
        bacteria = new Uint32Array(rawBuffer.buffer, rawBuffer.byteOffset, 10000);
        fertility = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset + 40000, 10000);
        console.log(`💾 Loaded binary chunk [${cx}, ${cy}] (50.0 KB) from disk.`);
    } else {
        // Initialize fresh baseline: 0 bacteria, baseline fertility (12 for land)
        bacteria = new Uint32Array(10000);
        fertility = new Uint8Array(10000).fill(12);
    }

    const chunkData = {
        cx,
        cy,
        bacteria,
        fertility,
        dirty: false,
        lastUpdated: Date.now()
    };

    loadedChunks.set(key, chunkData);
    return chunkData;
}

/**
 * Marks chunk as dirty so it will be saved to disk on the next sync interval.
 */
export function markChunkDirty(cx, cy) {
    const chunk = loadedChunks.get(`${cx}_${cy}`);
    if (chunk) {
        chunk.dirty = true;
        chunk.lastUpdated = Date.now();
    }
}

/**
 * Writes all modified chunks to disk as pure 50 KB .bin files.
 */
export function flushDirtyChunksToDisk() {
    let savedCount = 0;
    for (let [key, chunk] of loadedChunks) {
        if (chunk.dirty) {
            const filePath = getChunkPath(chunk.cx, chunk.cy);
            
            // Allocate 50 KB raw Buffer (40,000 bytes bacteria + 10,000 bytes fertility)
            const combinedBuffer = Buffer.concat([
                Buffer.from(chunk.bacteria.buffer, chunk.bacteria.byteOffset, chunk.bacteria.byteLength),
                Buffer.from(chunk.fertility.buffer, chunk.fertility.byteOffset, chunk.fertility.byteLength)
            ]);

            fs.writeFileSync(filePath, combinedBuffer);
            chunk.dirty = false;
            savedCount++;
        }
    }
    if (savedCount > 0) {
        console.log(`💾 Flushed ${savedCount} dirty chunk(s) to binary disk files.`);
    }
}

// Auto-save dirty chunks every 10 seconds
setInterval(flushDirtyChunksToDisk, 10000);