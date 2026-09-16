// plantWorker.js
import { parentPort } from 'worker_threads';
import { PLANT_DEFS } from './src/plantDefs.js';
import { CONFIG } from './src/config.js';

function createSeededPRNG(seed) {
    let s = seed | 0;
    return function() {
        s = (Math.imul(s, 1664525) + 1013904223) | 0;
        return (s >>> 0) / 4294967296;
    };
}

const ID_TO_TYPE = [
    'grass', 'turnip', 'tomato', 'eggplant', 'strawberry',
    'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato',
    'wheat', 'rose', 'violet', 'sunflower'
];

parentPort.on('message', (job) => {
    const { cx, cy, rawBuffer, deltaSeconds, worldSeed } = job;
    const buffer = Buffer.from(rawBuffer);

    if (buffer.length < 12) {
        parentPort.postMessage({ cx, cy, buffer: rawBuffer, elapsedGenerations: 0, plantCount: 0 }, [rawBuffer]);
        return;
    }

    const plantCount = buffer.readUInt32LE(8);
    const prng = createSeededPRNG(worldSeed + ((cx * 73856093) ^ (cy * 19349663)));
    const speed = CONFIG.PLANT_LIFECYCLE_SPEED || 1.0;

    const existingPlants = [];
    let offset = 12;

    for (let i = 0; i < plantCount; i++) {
        if (offset + 8 > buffer.length) break;

        const localIdx = buffer.readUInt16LE(offset);
        const typeId = buffer.readUInt8(offset + 2);
        const growth = buffer.readUInt8(offset + 3);
        const seedsRemaining = buffer.readUInt8(offset + 4);
        const generation = buffer.readUInt8(offset + 5) |
                          (buffer.readUInt8(offset + 6) << 8) |
                          (buffer.readUInt8(offset + 7) << 16);

        existingPlants.push({
            localIdx,
            typeId,
            growth,
            seedsRemaining,
            generation
        });

        offset += 8;
    }

    const finalPlants = new Map();
    let maxGenerations = 0;

    // 🎯 INDIVIDUAL PER-PLANT CONTINUOUS MATHEMATICAL CATCH-UP
    for (const p of existingPlants) {
        const typeName = ID_TO_TYPE[p.typeId] || 'grass';
        const def = PLANT_DEFS[typeName];
        const growthRate = def?.growthRate || 0.5;
        const rate = growthRate * 0.1 * speed; // Growth units per second

        // 1. Cyclical crops (tomatoes, etc.) stay mature indefinitely
        if (def && def.isCyclical) {
            p.growth = Math.min(100, Math.floor(p.growth + (rate * deltaSeconds)));
            finalPlants.set(p.localIdx, p);
            continue;
        }

        // 2. Wild flora: compute individual timeline from starting growth
        const neededGrowth = Math.max(0, 100 - p.growth);
        const timeToMature = neededGrowth / rate;
        const seedingDuration = (Math.max(1, p.seedsRemaining) * 20.0) / speed;
        const parentLifespan = timeToMature + seedingDuration;

        if (deltaSeconds < timeToMature) {
            // Parent has not reached 100% yet
            p.growth = Math.min(99, Math.floor(p.growth + (rate * deltaSeconds)));
            finalPlants.set(p.localIdx, p);
        } 
        else if (deltaSeconds < parentLifespan) {
            // Parent is mature (100%) and currently dropping seeds
            p.growth = 100;
            finalPlants.set(p.localIdx, p);
        } 
        else {
            // Parent matured, completed seeding, and withered away.
            const seedDroppedTime = timeToMature + (seedingDuration * 0.5);
            const childGrowTime = deltaSeconds - seedDroppedTime;
            const fullGenTime = (100 / rate) + seedingDuration;

            const childGenerations = Math.floor(childGrowTime / fullGenTime);
            const totalGens = childGenerations + 1;
            if (totalGens > maxGenerations) {
                maxGenerations = totalGens;
            }

            const childRemainder = childGrowTime % fullGenTime;
            const childTimeToMature = 100 / rate;

            let childGrowth = 0;
            if (childRemainder >= childTimeToMature) {
                childGrowth = 100; // Mature child plant!
            } else {
                childGrowth = Math.min(99, Math.floor(rate * childRemainder));
            }

            // Disperse child 1-2 tiles (respecting spreadRange)
            const range = def?.spreadRange || 2;
            const angle = prng() * Math.PI * 2;
            const dist = Math.floor(prng() * (range + 1));
            const lx = p.localIdx % 100;
            const ly = Math.floor(p.localIdx / 100);

            const offLX = Math.max(0, Math.min(99, lx + Math.floor(Math.cos(angle) * dist)));
            const offLY = Math.max(0, Math.min(99, ly + Math.floor(Math.sin(angle) * dist)));
            const targetIdx = (offLY * 100) + offLX;

            // Place child at targetIdx if empty, else reuse parent tile if empty
            const placeIdx = !finalPlants.has(targetIdx) ? targetIdx : (!finalPlants.has(p.localIdx) ? p.localIdx : null);

            if (placeIdx !== null) {
                finalPlants.set(placeIdx, {
                    localIdx: placeIdx,
                    typeId: p.typeId,
                    growth: childGrowth,
                    seedsRemaining: 3,
                    generation: p.generation + totalGens
                });
            }
        }
    }

    // Re-pack into binary output buffer
    const plantList = Array.from(finalPlants.values());
    const outBufferSize = 12 + (plantList.length * 8);
    const outBuffer = Buffer.alloc(outBufferSize);

    outBuffer.writeBigInt64LE(BigInt(Date.now()), 0);
    outBuffer.writeUInt32LE(plantList.length, 8);

    let writeOffset = 12;
    for (const p of plantList) {
        outBuffer.writeUInt16LE(p.localIdx, writeOffset);
        outBuffer.writeUInt8(p.typeId, writeOffset + 2);
        outBuffer.writeUInt8(p.growth, writeOffset + 3);
        outBuffer.writeUInt8(p.seedsRemaining, writeOffset + 4);
        outBuffer.writeUInt8(p.generation & 0xFF, writeOffset + 5);
        outBuffer.writeUInt8((p.generation >> 8) & 0xFF, writeOffset + 6);
        outBuffer.writeUInt8((p.generation >> 16) & 0xFF, writeOffset + 7);
        writeOffset += 8;
    }

    const transferBuffer = outBuffer.buffer.slice(outBuffer.byteOffset, outBuffer.byteOffset + outBuffer.byteLength);
    parentPort.postMessage({ 
        cx, 
        cy, 
        buffer: transferBuffer,
        elapsedGenerations: Math.max(1, maxGenerations),
        plantCount: plantList.length
    }, [transferBuffer]);
});