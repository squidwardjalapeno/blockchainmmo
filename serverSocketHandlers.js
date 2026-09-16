// serverSocketHandlers.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

import { CONFIG } from './src/config.js';
import { ITEM_TYPES, createItem } from './src/items.js';
import { PLANT_DEFS } from './src/plantDefs.js';
import { createVoucher } from './src/voucherSystem.js';
import { getOrCreateServerChunk, markChunkDirty } from './chunkStorage.js';
import { 
    savePlantChunk, 
    loadPlantChunkWithCatchUpAsync, 
    appendPioneerSeedToDisk, 
    TYPE_TO_ID, 
    ID_TO_TYPE 
} from './plantStorage.js';

import { 
    players, 
    serverVillages, 
    serverHobbits, 
    serverAnimals, 
    serverPlants, 
    serverBacteria, 
    registeredServerRanches, 
    fishingStates, 
    activeJobs, 
    activeOverseers, 
    inputBuffers, 
    projectiles, 
    userDb, 
    chestDb, 
    storeDb, 
    cellarDb, 
    hayDb, 
    oreDb, 
    doorDb, 
    authDb, 
    activityLog, 
    globalDebt, 
    globalFishCount, 
    worldSeed, 
    POINT_VALUES, 
    BACTERIA_TYPES, 
    EXTRACTION_DELAY_MS, 
    saveVillages, 
    saveChickens, 
    saveDoors, 
    saveStores, 
    saveAuth, 
    saveDebt, 
    logActivity, 
    syncPlayerAndSave, 
    giveItemToServerInventory, 
    isServerPlantMature, 
    getRandomServerFish, 
    getJobConfig, 
    calculateProportionalHobbits, 
    spawnVillageChickens, 
    spawnDatabaseHobbit, 
    markPlantChunkDirty, 
    generateServerFloraForChunk,
    getChickenTelemetrySummary,
    printChickenTelemetry

} from './serverState.js';

import { 
    provider, 
    adminWalletSigner, 
    spawnerInterface, 
    deedContract, 
    spawnerContract, 
    currentTVL, 
    broadcastEffectiveTGV, 
    settleTreasuryToTBA, 
    queryOnChainHobbitCount, 
    getItemTypeId, 
    activeExtractionQueues 
} from './serverBlockchain.js';

import { computeWorldTime } from './src/clock.js';

import { applyMagicSpellDamage } from './serverSimulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerSocketHandlers(io, socket) {

    // Send immediate authoritative clock sync on handshake
    socket.emit('timeSync', computeWorldTime(Date.now()));
    // ==========================================
    // 🕹️ INPUT & MOVEMENT
    // ==========================================
    socket.on('player_input', (data) => {
        if (!inputBuffers.has(socket.id)) {
            inputBuffers.set(socket.id, []);
        }
        const buffer = inputBuffers.get(socket.id);
        if (buffer.length < 10) {
            buffer.push(data);
        }
    });

    socket.on('movement', (data) => {
        const player = players[socket.id];
        if (!player) return;
        player.x = data.x;
        player.y = data.y;
        player.dir = data.dir;
        player.animFrame = data.animFrame;
        player.isMoving = data.isMoving;
        player.isWindingUp = data.isWindingUp;
        player.currentTileID = data.currentTileID;
    });

    socket.on('rts_camera_move', (data) => {
        const p = players[socket.id];
        if (p) {
            p.x = data.x;
            p.y = data.y;
        }
    });

    // ==========================================
    // 🔐 AUTHENTICATION & SOVEREIGNTY
    // ==========================================
    socket.on('registerUser', (data) => {
        const { username, password } = data;
        const safeUser = username.trim().toLowerCase();

        if (authDb[safeUser]) {
            socket.emit('authResponse', { success: false, message: "Username already taken." });
            return;
        }

        authDb[safeUser] = password;
        saveAuth();
        socket.emit('authResponse', { success: true, wallet: `User_${safeUser}` });
    });

    socket.on('loginUser', (data) => {
        const { username, password } = data;
        const safeUser = username.trim().toLowerCase();

        if (authDb[safeUser] && authDb[safeUser] === password) {
            socket.emit('authResponse', { success: true, wallet: `User_${safeUser}` });
        } else {
            socket.emit('authResponse', { success: false, message: "Invalid username or password." });
        }
    });

    socket.on('verifySovereignty', async (data) => {
        const { address, requestedMode } = data;
        if (!address) return;

        try {
            const cleanAddress = ethers.getAddress(address);
            const deedBalance = await deedContract.balanceOf(cleanAddress);
            const ownedCount = parseInt(deedBalance.toString());
            const ownsNFT = (ownedCount > 0);

            let hasActiveVillage = false;
            for (let [key, village] of serverVillages) {
                if (village.owner) {
                    try {
                        const cleanOwner = ethers.getAddress(village.owner);
                        if (cleanOwner === cleanAddress) {
                            hasActiveVillage = true;
                            break;
                        }
                    } catch (e) {}
                }
            }

            const isAdmin = (process.env.ADMIN_ADDRESS && cleanAddress.toLowerCase() === process.env.ADMIN_ADDRESS.toLowerCase());
            const isAuthorized = (ownsNFT && hasActiveVillage) || isAdmin;

            if (isAuthorized) {
                socket.wallet = cleanAddress;
                activeOverseers.set(socket.id, cleanAddress);

                players[socket.id] = {
                    id: socket.id,
                    wallet: cleanAddress,
                    charClass: (requestedMode === 'RTS') ? 'Overseer' : 'Strategist',
                    skills: [],
                    x: 80800,
                    y: 80800,
                    hp: 100,
                    maxHp: 100,
                    shield: 0,
                    inventory: [],
                    isOffline: false,
                    energy: 100,
                    maxEnergy: 100
                };

                socket.emit('sovereigntyVerified', {
                    success: true,
                    address: cleanAddress,
                    mode: requestedMode
                });

                socket.emit('restoreHero', players[socket.id]);
                console.log(`🏰 Sovereign Session Authorized: ${cleanAddress} entered ${requestedMode} mode.`);
            } else {
                if (requestedMode === 'RTS' || requestedMode === 'TERMINAL') {
                    const msg = !ownsNFT 
                        ? "ACCESS DENIED: No Deed owned on-chain. Restricting to Hero Mode."
                        : "ACCESS DENIED: Your Deed has expired or is inactive in this session. Re-claim your village to activate.";
                    socket.emit('sovereigntyVerified', { success: false, message: msg });
                } else {
                    socket.wallet = cleanAddress;
                    socket.emit('sovereigntyVerified', { success: true, address: cleanAddress, mode: 'MOBA' });
                }
            }
        } catch (err) {
            console.error("Handshake failed:", err);
            socket.emit('sovereigntyVerified', { success: false, message: "Unichain connection latency. Retry." });
        }
    });

    socket.on('identifyWallet', (data) => {
        const rawAddress = (typeof data === 'object') ? data.address : data;
        if (!rawAddress) return;
        const address = (rawAddress.startsWith('0x')) ? ethers.getAddress(rawAddress) : rawAddress;
        socket.wallet = address;

        if (address.startsWith('Overseer_')) {
            if (!userDb[address]) {
                userDb[address] = {
                    wallet: address,
                    charClass: "Overseer",
                    skills: [],
                    x: 80800,
                    y: 80800,
                    hp: 100,
                    maxHp: 100,
                    energy: 100
                };
                fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
            }

            players[socket.id] = { 
                ...players[socket.id], 
                ...userDb[address], 
                id: socket.id, 
                isOffline: false 
            };

            socket.emit('restoreHero', players[socket.id]);
            return;
        }

        if (userDb[address]) {
            console.log(`💾 Restore: ${address} (${userDb[address].inventory?.length || 0} items)`);
            players[socket.id] = { ...players[socket.id], ...userDb[address], id: socket.id, isOffline: false };
            socket.emit('restoreHero', players[socket.id]);
        } else {
            socket.emit('needsCharacterCreation');
        }
    });

    socket.on('createCharacter', (data) => {
        const { wallet, charClass, skills } = data;
        const address = (wallet.startsWith('0x')) ? ethers.getAddress(wallet) : wallet;

        players[socket.id].wallet = address;
        players[socket.id].charClass = charClass;
        players[socket.id].skills = skills;

        if (!userDb[address] || !userDb[address].inventory) {
            players[socket.id].inventory = [];
        } else {
            players[socket.id].inventory = userDb[address].inventory;
        }

        syncPlayerAndSave(socket.id);
        socket.emit('restoreHero', players[socket.id]);
    });

    socket.on('requestBurnAuthorization', (data) => {
        const { tokenId, tbaAddress } = data;
        const cleanAddress = socket.wallet;

        if (!cleanAddress || !tokenId) return;

        let isActive = false;
        for (let [key, village] of serverVillages) {
            if (village.deedTokenId === parseInt(tokenId) && village.owner) {
                isActive = true;
                break;
            }
        }

        if (isActive) {
            socket.emit('burnAuthorizationResponse', { 
                success: false, 
                message: "ABORT: This Deed belongs to an active village in this session! You cannot burn live properties." 
            });
        } else {
            socket.emit('burnAuthorizationResponse', { 
                success: true, 
                tokenId: tokenId,
                tbaAddress: tbaAddress,
                message: "AUTHORIZATION GRANTED: Deed is expired. Initiating on-chain reclaim and burn." 
            });
        }
    });

    // ==========================================
    // 💬 CHAT & TELEMETRY
    // ==========================================
    socket.on('chatMessage', (data) => {
        const senderName = socket.wallet || `Guest_${socket.id.substring(0, 4)}`;
        io.emit('chatMessage', { sender: senderName, message: data.message });
    });

    socket.on('requestActivityLog', () => {
        socket.emit('activityData', activityLog);
    });

    // ==========================================
    // 🎒 INVENTORY, EQUIPMENT & DROPS
    // ==========================================
    socket.on('syncInventory', (data) => {
        const player = players[socket.id];
        if (!player) return;

        player.inventory = data.inventory || [];
        player.equipment = data.equipment || { mainHand: null };

        syncPlayerAndSave(socket.id);
    });

    socket.on('requestEquip', (data) => {
        const { index, currentEnergy } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (currentEnergy !== undefined) {
            player.energy = parseFloat(currentEnergy) || 100;
        }

        if (!player.equipment) player.equipment = { mainHand: null };
        const itemToEquip = player.inventory[index];
        if (!itemToEquip) return;

        if (player.equipment.mainHand) {
            const currentInHand = player.equipment.mainHand;
            player.equipment.mainHand = itemToEquip;
            player.inventory[index] = currentInHand;
        } else {
            player.equipment.mainHand = itemToEquip;
            player.inventory.splice(index, 1);
        }

        player.ad = CONFIG.HERO_ATTACK;
        if (player.equipment.mainHand && player.equipment.mainHand.isWeapon) {
            player.ad += (player.equipment.mainHand.ad || 0);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('updateEquipment', player.equipment);
        socket.emit('restoreHero', player);
    });

    socket.on('requestUnequip', (data) => {
        const { currentEnergy } = data || {};
        const player = players[socket.id];
        if (!player || !player.inventory || !player.equipment || !player.equipment.mainHand) return;

        if (player.inventory.length >= 10) {
            socket.emit('inventoryFull');
            return;
        }

        if (currentEnergy !== undefined) {
            player.energy = parseFloat(currentEnergy) || 100;
        }

        player.inventory.push(player.equipment.mainHand);
        player.equipment.mainHand = null;
        player.ad = CONFIG.HERO_ATTACK;

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('updateEquipment', player.equipment);
        socket.emit('restoreHero', player);
    });

    socket.on('requestDrop', (data) => {
        const { index, amount, tx, ty } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const item = player.inventory[index];
        if (!item || item.count < amount) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        const typeId = BACTERIA_TYPES[item.seedType] || 0;
        let packedTraits = 0;

        if (typeId === 61) {
            packedTraits = ((item.houseId & 0xFFFF) | ((typeId & 0xFF) << 20)) >>> 0;
        } else {
            const hVal = item.health !== undefined ? item.health : (item.baseHealth || 100);
            const vVal = item.virulence !== undefined ? item.virulence : (item.baseVirulence || 0);
            packedTraits = ((Math.floor(hVal) & 0xFF) | ((Math.floor(vVal) & 0xFF) << 8) | ((2 & 0x0F) << 16) | ((typeId & 0xFF) << 20)) >>> 0;
        }

        const cx = Math.floor(tx / 100);
        const cy = Math.floor(ty / 100);
        const lx = ((tx % 100) + 100) % 100;
        const ly = ((ty % 100) + 100) % 100;
        const idx = (ly * 100) + lx;

        const chunk = getOrCreateServerChunk(cx, cy);
        chunk.bacteria[idx] = packedTraits;
        markChunkDirty(cx, cy);

        io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });

        item.count -= amount;
        if (item.count <= 0) {
            player.inventory.splice(index, 1);
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
    });

    socket.on('requestPickup', (itemData) => {
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - itemData.tx) + Math.abs(py - itemData.ty) > 5) return;

        const seedTypeToKeyMap = {};
        for (let key in ITEM_TYPES) {
            seedTypeToKeyMap[ITEM_TYPES[key].seedType] = key;
        }

        const templateKey = seedTypeToKeyMap[itemData.seedType];
        const template = ITEM_TYPES[templateKey];
        if (!template) return;

        const newItem = createItem(template);
        const key = `${itemData.tx}_${itemData.ty}`;
        if (serverBacteria.has(key)) {
            const traits = serverBacteria.get(key);
            const hTraits = traits & 0xFF;
            if (hTraits > 0) newItem.health = hTraits;
        }

        if (template.isKey) {
            newItem.houseId = itemData.houseId;
            newItem.name = `Key to House #${itemData.houseId}`;
        }

        const success = giveItemToServerInventory(player, newItem);
        if (success) {
            const cx = Math.floor(itemData.tx / 100);
            const cy = Math.floor(itemData.ty / 100);
            const lx = ((itemData.tx % 100) + 100) % 100;
            const ly = ((itemData.ty % 100) + 100) % 100;
            const idx = (ly * 100) + lx;

            const chunk = getOrCreateServerChunk(cx, cy);
            chunk.bacteria[idx] = 0;
            markChunkDirty(cx, cy);

            io.emit('syncTile', { gx: itemData.tx, gy: itemData.ty, traits: 0 });
            syncPlayerAndSave(socket.id);
            socket.emit('updateInventory', player.inventory);
        } else {
            socket.emit('inventoryFull');
        }
    });

    // ==========================================
    // 🏛️ VILLAGE, WELL & LAND INTERACTION
    // ==========================================
    // serverSocketHandlers.js (inside registerSocketHandlers(io, socket))

    socket.on('requestWellState', async (data) => {
        const key = `${data.wellX}_${data.wellY}`;

        // 1. Initialize village record if missing from database
        if (!serverVillages.has(key)) {
            serverVillages.set(key, { 
                x: data.wellX, 
                y: data.wellY, 
                owner: null, 
                captureProgress: 0, 
                capturer: null,
                treasury: 0.0,
                structures: [],
                isSpawning: false,
                isWorkforceSpawned: false // Permanent workforce spawning guard
            });
            saveVillages();
        }

        const v = serverVillages.get(key);

        // 2. Save client's transmitted planned structures if provided
        if (data.structures && data.structures.length > 0) {
            v.structures = data.structures;
            saveVillages();
        }

        let existingHobbits = serverHobbits.filter(h => h.villageId === key);

        // 🎯 3. ATOMIC SPAWNING GUARD: Runs on initial discovery or memory recovery
        if ((!v.isWorkforceSpawned || existingHobbits.length === 0) && !v.isSpawning) {
            v.isSpawning = true; // Set concurrency lock

            if (v.owner && v.tbaAddress) {
                // Path A: Owned Village. Query Unichain and restore exact on-chain workforce
                try {
                    const onChainCount = await queryOnChainHobbitCount(v.tbaAddress);
                    console.log(`📡 SATELLITE RESTORATION: Spawning ${onChainCount} on-chain workers for TBA [${v.tbaAddress}]...`);
                    const spawnCount = Math.min(onChainCount, v.structures.length);
                    for (let i = 0; i < spawnCount; i++) {
                        spawnDatabaseHobbit(io, v.x, v.y, key, 'Forager', v.structures[i]);
                    }
                } catch (restoreErr) {
                    console.warn("⚠️ Failed to restore on-chain workforce:", restoreErr.message);
                }
            } else {
                // Path B: Neutral / Unclaimed Village. Spawn structural workers
                const spawnCount = v.structures.length;
                console.log(`📡 NEUTRAL SATELLITE: Spawning ${spawnCount} structural workers for village [${key}]...`);
                for (let i = 0; i < spawnCount; i++) {
                    const assignedStruct = v.structures[i] || null;
                    const fallbackJob = (i === 0) ? 'Forager' : (i === 1) ? 'Farmer' : 'Trader';
                    spawnDatabaseHobbit(io, v.x, v.y, key, fallbackJob, assignedStruct);
                }
            }

            // 🐓 4. Spawn 3 Free-Range Village Chickens around the well
            spawnVillageChickens(v.x, v.y, 3);
            
            v.isWorkforceSpawned = true; // Set permanent database guard
            saveVillages();
            v.isSpawning = false; // Release concurrency lock

            existingHobbits = serverHobbits.filter(h => h.villageId === key);
        }

        // 📊 5. COMPILE & PRINT TELEMETRY (CMD Terminal + Chrome DevTools)
        const summaries = getChickenTelemetrySummary();
        printChickenTelemetry(summaries, `VILLAGE [${data.wellX}, ${data.wellY}] CHICKEN REPORT`);
        socket.emit('chickenTelemetryReport', { summaries });

        // 6. Targeted Sync: Send workforce and animals directly to connecting client
        socket.emit('hobbits_update', { hobbits: existingHobbits });
        socket.emit('animals', { animals: serverAnimals });

        const dynamicCount = calculateProportionalHobbits(data.wellX, data.wellY);

        // 7. Only send menu popup response if request was NOT silent
        if (!data.isSilent) {
            socket.emit('wellStateResponse', { 
                wellX: data.wellX, 
                wellY: data.wellY, 
                owner: v.owner, 
                progress: v.captureProgress,
                hobbitCount: dynamicCount
            });
        }
    });

    socket.on('requestWellInteraction', (data) => {
        const { wellX, wellY } = data;
        const key = `${wellX}_${wellY}`;
        const player = players[socket.id];
        if (!player) return;

        const pTX = Math.floor(player.x / 16);
        const pTY = Math.floor(player.y / 16);
        const distanceToWell = Math.hypot(pTX - wellX, pTY - wellY);

        if (distanceToWell > 3) {
            console.log(`🚨 CHEAT BLOCKED: ${player.wallet} tried to interact with well [${key}] from ${distanceToWell.toFixed(1)} tiles.`);
            return;
        }

        if (!serverVillages.has(key)) {
            serverVillages.set(key, {
                x: wellX, y: wellY, owner: null,
                captureProgress: 0, capturer: null, contested: false
            });
        }

        const village = serverVillages.get(key);
        if (village.owner !== null) {
            const counts = getVillagePlayerCounts(wellX, wellY, village.owner);
            if (counts.enemies > counts.allies) {
                village.capturer = player.wallet || `Guest_${player.id.substring(0, 4)}`;
                io.emit('villageCaptureProgress', { wellX, wellY, progress: village.captureProgress, capturer: village.capturer });
                console.log(`⚔️ SIEGE LAUNCHED: ${village.capturer} initiated a siege on village [${key}]!`);
            } else {
                socket.emit('wellInteractionMessage', { message: "🔒 Siege Blocked: Defenders still hold the perimeter. Outnumber them to capture." });
            }
        }
    });

    socket.on('requestGaslessVillageClaim', async (data) => {
        const { wellX, wellY } = data;
        const key = `${wellX}_${wellY}`;
        const player = players[socket.id];
        if (!player) return;

        const pTX = Math.floor(player.x / 16);
        const pTY = Math.floor(player.y / 16);
        if (Math.hypot(pTX - wellX, pTY - wellY) > 5) {
            socket.emit('oreMessage', "🔒 CLAIM BLOCKED: You are too far from the village well.");
            return;
        }

        const activeDefenders = serverHobbits.filter(h => h.villageId === key && h.hp > 0 && h.job === 'Military');
        if (activeDefenders.length > 0) {
            socket.emit('oreMessage', "🔒 CLAIM BLOCKED: Clear all active military defenders first!");
            return;
        }

        const existingVillage = serverVillages.get(key);
        if (existingVillage && existingVillage.owner !== null) {
            socket.emit('oreMessage', "🔒 CLAIM REJECTED: This village is already owned by another player.");
            return;
        }

        const cleanPlayerWallet = socket.wallet || `Guest_${socket.id.substring(0, 4)}`;
        const isWeb3 = cleanPlayerWallet.startsWith('0x');
        const recipientOnChainAddress = isWeb3 ? ethers.getAddress(cleanPlayerWallet) : adminWalletSigner.address;

        try {
            console.log(`⚡ RELAYING GASLESS CLAIM for village [${key}] on behalf of ${cleanPlayerWallet}...`);
            socket.emit('oreMessage', "⚡ Claiming territory on Unichain (Gasless)...");

            const salt = ethers.solidityPackedKeccak256(["uint256", "uint256"], [wellX, wellY]);
            const hobbitCount = calculateProportionalHobbits(wellX, wellY);

            const tx = await spawnerContract.claimVillagePeacefully(salt, hobbitCount, { gasLimit: 600000 });
            const receipt = await tx.wait();

            let tbaAddress = null;
            let deedTokenId = null;

            for (let log of receipt.logs) {
                try {
                    const parsed = spawnerInterface.parseLog(log);
                    if (parsed && parsed.name === "VillageSpunIntact") {
                        tbaAddress = parsed.args.tbaAddress;
                        deedTokenId = parseInt(parsed.args.deedTokenId.toString());
                        break;
                    }
                } catch (e) {}
            }

            if (!tbaAddress || deedTokenId === null) {
                throw new Error("Failed to decode VillageSpunIntact event from receipt.");
            }

            if (isWeb3 && recipientOnChainAddress !== adminWalletSigner.address) {
                const deedContractWithSigner = new ethers.Contract(
                    process.env.SOVEREIGN_DEED_ADDRESS,
                    ["function transferFrom(address from, address to, uint256 tokenId) external"],
                    adminWalletSigner
                );
                const transferTx = await deedContractWithSigner.transferFrom(
                    adminWalletSigner.address,
                    recipientOnChainAddress,
                    BigInt(deedTokenId),
                    { gasLimit: 120000 }
                );
                await transferTx.wait();
            }

            for (let i = serverHobbits.length - 1; i >= 0; i--) {
                if (serverHobbits[i].villageId === key) {
                    serverHobbits.splice(i, 1);
                }
            }

            const existingStructures = existingVillage ? existingVillage.structures : [];

            serverVillages.set(key, {
                x: wellX, y: wellY, owner: cleanPlayerWallet,
                tbaAddress: tbaAddress, deedTokenId: deedTokenId,
                captureProgress: 0, capturer: null, treasury: 0.0,
                isWorkforceSpawned: true, structures: existingStructures
            });
            saveVillages();

            for (let i = 0; i < hobbitCount; i++) {
                const assignedStruct = existingStructures[i] || null;
                const fallbackJob = (i === 0) ? 'Forager' : (i === 1) ? 'Farmer' : 'Trader';
                spawnDatabaseHobbit(io, wellX, wellY, key, fallbackJob, assignedStruct);
            }

            io.emit('villageOwnerUpdated', { wellX, wellY, owner: cleanPlayerWallet, progress: 0 });
            io.emit('hobbits_update', { hobbits: serverHobbits.filter(h => h.villageId === key) });
            socket.emit('oreMessage', "🎉 Territory secured! You are now the sovereign owner.");
        } catch (err) {
            console.error("❌ Gasless Claim Relay failed:", err);
            socket.emit('oreMessage', "Claim failed due to network latency. Please try again.");
        }
    });

    socket.on('requestSyncVillage', async (data) => {
        const key = `${data.wellX}_${data.wellY}`;
        const village = serverVillages.get(key);
        if (!village || !village.owner) {
            socket.emit('oreMessage', "Sync Aborted: Village is unclaimed or uninitialized.");
            return;
        }

        try {
            console.log(`\n🌀 SATELLITE SYNC: Village ${key} | TBA: ${village.tbaAddress} | Owner: ${village.owner}`);

            // 1. Sync Treasury
            const virtualTreasury = parseFloat(village.treasury) || 0.0;
            if (virtualTreasury > 0 && village.tbaAddress) {
                await settleTreasuryToTBA(village.tbaAddress, virtualTreasury);
                village.treasury = 0.0;
            }

            // 2. Sync Workforce
            const livingHobbits = serverHobbits.filter(h => h.villageId === key && h.hp > 0);
            const hobbitContract = new ethers.Contract(
                process.env.SOVEREIGN_HOBBIT_ADDRESS,
                ["function balanceOf(address owner) view returns (uint256)", "function mintHobbit(address to) external returns (uint256)"],
                adminWalletSigner
            );
            const onChainHobbitCount = parseInt((await hobbitContract.balanceOf(village.tbaAddress)).toString());

            if (livingHobbits.length > onChainHobbitCount) {
                const diff = livingHobbits.length - onChainHobbitCount;
                for (let i = 0; i < diff; i++) {
                    const tx = await hobbitContract.mintHobbit(village.tbaAddress, { gasLimit: 200000 });
                    await tx.wait();
                }
            }

            // 3. Sync Net Delta Vault Items
            const vaultId = `vault_${data.wellX}_${data.wellY}`;
            const dbItems = chestDb[vaultId] || [];
            const syncedItemTypes = ["iron_ore", "iron_ingot", "weapon_dagger", "tool_pickaxe"];
            const tbaAccounts = Array(syncedItemTypes.length).fill(village.tbaAddress);
            const tokenIds = syncedItemTypes.map(type => getItemTypeId(type));

            const stakedStorageContract = new ethers.Contract(
                process.env.STAKED_STORAGE_ADDRESS,
                [
                    "function balanceOfBatch(address[] memory accounts, uint256[] memory ids) view returns (uint256[] memory)",
                    "function mint(address to, uint256 id, uint256 amount, bytes memory data) external",
                    "function melt(address from, uint256 id, uint256 amount) external"
                ],
                adminWalletSigner
            );

            const rawOnChainBalances = await stakedStorageContract.balanceOfBatch(tbaAccounts, tokenIds);
            const onChainBalances = rawOnChainBalances.map(b => parseInt(b.toString()));

            for (let i = 0; i < syncedItemTypes.length; i++) {
                const itemType = syncedItemTypes[i];
                const tokenId = tokenIds[i];
                const onChainCount = onChainBalances[i];
                const dbCount = dbItems
                    .filter(item => item.seedType === itemType)
                    .reduce((sum, item) => sum + (item.count !== undefined ? item.count : 1), 0);

                const delta = dbCount - onChainCount;
                if (delta > 0) {
                    const tx = await stakedStorageContract.mint(village.tbaAddress, tokenId, delta, "0x", { gasLimit: 120000 });
                    await tx.wait();
                } else if (delta < 0) {
                    const tx = await stakedStorageContract.melt(village.tbaAddress, tokenId, Math.abs(delta), { gasLimit: 120000 });
                    await tx.wait();
                }
            }

            saveVillages();

            io.emit('villageOwnerUpdated', {
                wellX: village.x,
                wellY: village.y,
                owner: village.owner,
                progress: village.captureProgress,
                treasury: 0.0
            });

            socket.emit('villageSyncCompleted', { success: true });
        } catch (err) {
            console.error("❌ Satellite Sync failed:", err);
            socket.emit('oreMessage', "Sync failed due to RPC or contract timeout. Try again.");
        }
    });

    socket.on('requestUniExchangeData', async (data) => {
        const key = `${data.wellX}_${data.wellY}`;

        if (!serverVillages.has(key)) {
            serverVillages.set(key, { 
                x: data.wellX, y: data.wellY, owner: null, 
                captureProgress: 0, capturer: null, treasury: 0.0 
            });
        }

        const village = serverVillages.get(key);
        let tbaBalance = "0.0";
        if (village.tbaAddress) {
            try {
                const uniAbi = ["function balanceOf(address) view returns (uint256)"];
                const uniContract = new ethers.Contract(process.env.UNI_TOKEN_ADDRESS || "0x8f187aA05619a017077f5308904739877ce9eA21", uniAbi, provider);
                const rawBal = await uniContract.balanceOf(village.tbaAddress);
                tbaBalance = ethers.formatEther(rawBal);
            } catch (e) {}
        }

        socket.emit('uniExchangeData', {
            wellX: data.wellX,
            wellY: data.wellY,
            owner: village.owner,
            treasury: village.treasury || 0.0,
            tbaBalance: parseFloat(tbaBalance)
        });
    });

    socket.on('claimVillageTreasury', async (data) => {
        const key = `${data.wellX}_${data.wellY}`;
        const village = serverVillages.get(key);
        if (!village || !village.owner) return;

        if (socket.wallet !== village.owner) {
            socket.emit('oreMessage', "Unauthorized: Only the sovereign owner can extract village funds!");
            return;
        }

        let tbaBalance = 0.0;
        if (village.tbaAddress) {
            try {
                const uniAbi = ["function balanceOf(address) view returns (uint256)"];
                const uniContract = new ethers.Contract(process.env.UNI_TOKEN_ADDRESS || "0x8f187aA05619a017077f5308904739877ce9eA21", uniAbi, provider);
                const rawBal = await uniContract.balanceOf(village.tbaAddress);
                tbaBalance = parseFloat(ethers.formatEther(rawBal));
            } catch (e) {}
        }

        const available = (village.treasury || 0.0) + tbaBalance;
        const fee = 0.05;

        if (available <= fee) {
            socket.emit('oreMessage', "Treasury balance is too low to cover the 0.05 UNI processing fee.");
            return;
        }

        const payout = available - fee;
        village.treasury = 0.0;
        saveVillages();

        const queueId = 'payout_' + Math.random().toString(36).substr(2, 9);
        const now = Date.now();

        activeExtractionQueues.set(queueId, {
            id: queueId,
            owner: village.owner,
            itemType: 'UNI_PAYOUT',
            count: payout,
            startTime: now,
            endTime: now + EXTRACTION_DELAY_MS,
            villageId: key,
            status: 'PROCESSING'
        });

        socket.emit('oreMessage', `Withdrawal initiated! ${payout.toFixed(4)} UNI will arrive in your wallet in 2 hours.`);
    });

    // ==========================================
    // 🚪 DOORS & RANCHES
    // ==========================================
    socket.emit('initDoorStates', doorDb);

    socket.on('requestDoorState', (data) => {
        const key = `${data.gx}_${data.gy}`;
        const door = doorDb[key] || { locked: true };
        socket.emit('doorState', { gx: data.gx, gy: data.gy, locked: door.locked });
    });

    socket.on('setDoorLock', (data) => {
        const key = `${data.gx}_${data.gy}`;
        doorDb[key] = { locked: data.locked };
        saveDoors();
        io.emit('doorStateUpdated', { gx: data.gx, gy: data.gy, locked: data.locked });
    });

    socket.on('registerRanch', (data) => {
        const { gx, gy, w, h } = data;
        const ranchKey = `${gx}_${gy}`;
        if (registeredServerRanches.has(ranchKey)) return;
        registeredServerRanches.add(ranchKey);

        const numChickens = Math.floor(Math.random() * 2) + 2;
        for (let i = 0; i < numChickens; i++) {
            const rx = (gx + 1 + Math.random() * (w - 2)) * 16;
            const ry = (gy - h + 2 + Math.random() * (h - 2)) * 16;

            serverAnimals.push({
                id: 'animal_' + Math.random().toString(36).substr(2, 9),
                x: rx, y: ry,
                tx: Math.floor(rx / 16), ty: Math.floor(ry / 16),
                speed: 35, hp: 30, maxHp: 30, energy: 100,
                goal: 'wander', state: 'idle', dir: 'East',
                moveTimer: Math.random() * 3,
                targetX: undefined, targetY: undefined,
                eggTimer: 15 + Math.random() * 20,
                poopTimer: 10 + Math.random() * 20
            });
        }
        saveChickens();
    });

    // ==========================================
    // 🌾 AGRICULTURE & SEEDS
    // ==========================================
    socket.on('requestPlantSeed', (data) => {
        const { tx, ty, index } = data;
        const player = players[socket.id];
        if (!player) return;

        let item = player.equipment?.mainHand;
        let isEquipped = true;

        if (!item || !(item.seedType.includes("_seed") || item.seedType === "potato_item")) {
            item = player.inventory[index];
            isEquipped = false;
        }

        if (!item || !(item.seedType.includes("_seed") || item.seedType === "potato_item")) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        const plantKey = `${tx}_${ty}`;
        if (serverPlants.has(plantKey)) return;

        const plantType = item.seedType.replace("_seed", "").replace("_item", "");
        const def = PLANT_DEFS[plantType];

        serverPlants.set(plantKey, {
            gx: tx, gy: ty,
            type: plantType,
            growth: 0,
            growthRate: def ? def.growthRate : 0.4,
            timestamp: Date.now()
        });

        savePlantChunk(Math.floor(tx / 100), Math.floor(ty / 100), serverPlants);

        if (isEquipped) {
            player.equipment.mainHand.count--;
            if (player.equipment.mainHand.count <= 0) player.equipment.mainHand = null;
            socket.emit('updateEquipment', player.equipment);
        } else {
            item.count--;
            if (item.count <= 0) player.inventory.splice(index, 1);
            socket.emit('updateInventory', player.inventory);
        }

        syncPlayerAndSave(socket.id);
        io.emit('plantCreated', { gx: tx, gy: ty, type: plantType, growth: 0 });
    });

    socket.on('requestHarvest', (data) => {
        const { tx, ty } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const plantKey = `${tx}_${ty}`;
        const plant = serverPlants.get(plantKey);
        if (!plant) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        if (player.inventory.length >= 10) {
            socket.emit('inventoryFull');
            return;
        }

        const def = PLANT_DEFS[plant.type];
        const elapsedSeconds = plant.timestamp ? (Date.now() - plant.timestamp) / 1000 : 0;
        const startGrowth = parseFloat(plant.growth) || 0;
        const gRate = parseFloat(plant.growthRate) || (def?.growthRate || 0.4);
        const speed = CONFIG.PLANT_LIFECYCLE_SPEED || 1.0;
        const currentGrowth = startGrowth + (gRate * 0.1 * speed * elapsedSeconds);
        const isMature = isServerPlantMature(plant, currentGrowth);

        if (isMature) {
            const yieldMap = {
                'turnip': 'TURNIP_ITEM', 'tomato': 'TOMATO_ITEM',
                'eggplant': 'EGGPLANT_ITEM', 'strawberry': 'STRAWBERRY_ITEM',
                'pumpkin': 'PUMPKIN_ITEM', 'watermelon': 'WATERMELON_ITEM',
                'corn': 'CORN_ITEM', 'pineapple': 'PINEAPPLE_ITEM',
                'potato': 'POTATO_ITEM', 'wheat': 'WHEAT_ITEM',
                'grass': 'PLANT_MATTER', 'rose': 'PLANT_MATTER',
                'violet': 'PLANT_MATTER', 'sunflower': 'PLANT_MATTER'
            };

            const itemTypeName = yieldMap[plant.type] || 'PLANT_MATTER';
            const cropTemplate = ITEM_TYPES[itemTypeName];
            if (cropTemplate) {
                giveItemToServerInventory(player, createItem(cropTemplate));
            }

            const farmCrops = ['turnip', 'tomato', 'eggplant', 'strawberry', 'pumpkin', 'watermelon', 'corn', 'pineapple', 'potato', 'wheat'];
            if (!farmCrops.includes(plant.type)) {
                const seedConstName = `${plant.type.toUpperCase()}_SEED`;
                const seedTemplate = ITEM_TYPES[seedConstName];
                if (seedTemplate) {
                    const seedItem = createItem(seedTemplate);
                    seedItem.count = Math.floor(Math.random() * 2) + 1;
                    giveItemToServerInventory(player, seedItem);
                }
            }

            if (def && def.isCyclical) {
                plant.growth = def.resetGrowth;
                plant.timestamp = Date.now();
                io.emit('plantReset', { gx: tx, gy: ty, growth: def.resetGrowth });
            } else {
                serverPlants.delete(plantKey);
                io.emit('plantRemoved', { gx: tx, gy: ty });
            }
        } else {
            const template = ITEM_TYPES.PLANT_MATTER;
            if (template) giveItemToServerInventory(player, createItem(template));
            serverPlants.delete(plantKey);
            savePlantChunk(Math.floor(tx / 100), Math.floor(ty / 100), serverPlants);
            io.emit('plantRemoved', { gx: tx, gy: ty });
        }

        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
    });

    socket.on('requestChunkPlants', async (data) => {
        const { cx, cy } = data;
        let binaryBuffer = await loadPlantChunkWithCatchUpAsync(cx, cy, worldSeed);

        if (binaryBuffer === null) {
            generateServerFloraForChunk(cx, cy);
            binaryBuffer = fs.readFileSync(path.join(__dirname, 'data', 'plants', `plants_${cx}_${cy}.bin`));
        }

        for (const [key, p] of serverPlants) {
            if (Math.floor(p.gx / 100) === cx && Math.floor(p.gy / 100) === cy) {
                serverPlants.delete(key);
            }
        }

        if (binaryBuffer && binaryBuffer.length >= 12) {
            const count = binaryBuffer.readUInt32LE(8);
            let offset = 12;
            for (let i = 0; i < count; i++) {
                if (offset + 8 > binaryBuffer.length) break;
                const localIdx = binaryBuffer.readUInt16LE(offset);
                const typeId = binaryBuffer.readUInt8(offset + 2);
                const growth = binaryBuffer.readUInt8(offset + 3);
                const seedsRemaining = binaryBuffer.readUInt8(offset + 4);
                const generation = binaryBuffer.readUInt8(offset + 5) |
                                  (binaryBuffer.readUInt8(offset + 6) << 8) |
                                  (binaryBuffer.readUInt8(offset + 7) << 16);

                const lx = localIdx % 100;
                const ly = Math.floor(localIdx / 100);
                const gx = cx * 100 + lx;
                const gy = cy * 100 + ly;

                serverPlants.set(`${gx}_${gy}`, {
                    gx, gy,
                    type: ID_TO_TYPE[typeId] || 'grass',
                    growth,
                    seedsRemaining,
                    generation,
                    growthRate: PLANT_DEFS[ID_TO_TYPE[typeId] || 'grass']?.growthRate || 0.4
                });
                offset += 8;
            }
        }

        const arrayBuf = binaryBuffer.buffer.slice(binaryBuffer.byteOffset, binaryBuffer.byteOffset + binaryBuffer.byteLength);
        socket.emit('chunkPlantsBinary', { cx, cy, buffer: arrayBuf });
    });

    socket.on('registerWildPlant', (data) => {
        const { gx, gy, type, growth } = data;
        const targetCX = Math.floor(gx / 100);
        const targetCY = Math.floor(gy / 100);
        const plantKey = `${gx}_${gy}`;
        const def = PLANT_DEFS[type];

        serverPlants.set(plantKey, {
            gx, gy, type,
            growth: growth || 0,
            growthRate: def ? def.growthRate : 0.4,
            timestamp: Date.now()
        });

        markPlantChunkDirty(targetCX, targetCY);
    });

    socket.on('plantWithered', (data) => {
        const key = `${data.gx}_${data.gy}`;
        if (serverPlants.has(key)) {
            serverPlants.delete(key);
            markPlantChunkDirty(Math.floor(data.gx / 100), Math.floor(data.gy / 100));
            socket.broadcast.emit('plantRemoved', { gx: data.gx, gy: data.gy });
        }
    });

    // serverSocketHandlers.js (inside registerSocketHandlers)

    // 🧹 PURGE PHANTOM ROAD PLANTS
    socket.on('purgePhantomPlants', (data) => {
        const { cx, cy, tiles } = data;
        if (!tiles || !Array.isArray(tiles)) return;

        let deletedCount = 0;
        tiles.forEach(t => {
            const key = `${t.gx}_${t.gy}`;
            if (serverPlants.has(key)) {
                serverPlants.delete(key);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            markPlantChunkDirty(cx, cy);
            savePlantChunk(cx, cy, serverPlants); // Permanently clean the .bin file on disk
            console.log(`🧹 Purged ${deletedCount} phantom road plants from chunk [${cx}, ${cy}] and saved to disk.`);
        }
    });

    socket.on('requestChunkBacteria', (data) => {
        const { cx, cy } = data;
        const chunk = getOrCreateServerChunk(cx, cy);

        const payload = new Uint8Array(50000);
        payload.set(new Uint8Array(chunk.bacteria.buffer, chunk.bacteria.byteOffset, 40000), 0);
        payload.set(chunk.fertility, 40000);

        socket.emit('chunkBacteriaData', { cx, cy, buffer: payload.buffer });
    });

    // ==========================================
    // 📦 STORAGE (CHESTS, VAULTS, CELLARS, HAY)
    // ==========================================
    socket.on('requestChest', (chestId) => {
        if (!chestDb[chestId]) {
            const pick = createItem(ITEM_TYPES.PICKAXE);
            const ingot = createItem(ITEM_TYPES.IRON_INGOT);
            ingot.count = 8;
            const dagger = createItem(ITEM_TYPES.DAGGER);
            dagger.count = 1;
            chestDb[chestId] = [pick, ingot, dagger];
        }
        socket.emit('chestData', { chestId, items: chestDb[chestId] });
    });

    socket.on('updateChest', (data) => {
        const limit = data.chestId.startsWith('vault_') ? 16 : 8;
        if (data.items && data.items.length > limit) {
            data.items = data.items.slice(0, limit);
        }
        chestDb[data.chestId] = data.items;
        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));
        socket.broadcast.emit('chestUpdated', data);
    });

    socket.on('requestChestTransfer', (data) => {
        const { chestId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const cx = Math.floor(player.x / 16);
        const cy = Math.floor(player.y / 16);
        const coords = chestId.split('_');
        const tx = parseInt(coords[1]);
        const ty = parseInt(coords[2]);

        const isVault = chestId.startsWith('vault_');
        const maxAllowedDistance = isVault ? 100 : 5;

        if (Math.abs(cx - tx) + Math.abs(cy - ty) > maxAllowedDistance) return;

        if (isVault) {
            const key = `${tx}_${ty}`;
            const village = serverVillages.get(key);
            if (village && village.owner !== null) {
                const playerWalletAddress = player.wallet || `Guest_${player.id.substring(0, 4)}`;
                if (village.owner !== playerWalletAddress) {
                    socket.emit('oreMessage', "🔒 ACCESS DENIED: This village belongs to another sovereign owner!");
                    return;
                }
            }
        }

        if (!chestDb[chestId]) chestDb[chestId] = [];
        const chestItems = chestDb[chestId];

        if (direction === 'to_chest') {
            const item = player.inventory[index];
            if (!item) return;

            const limit = isVault ? 16 : 8;
            if (chestItems.length >= limit) {
                socket.emit('oreMessage', "This storage is full!");
                return;
            }

            player.inventory.splice(index, 1);
            let merged = false;
            if (item.maxStack > 1) {
                const existing = chestItems.find(i => i.seedType === item.seedType && i.count < item.maxStack);
                if (existing) {
                    const space = item.maxStack - existing.count;
                    if (item.count <= space) {
                        existing.count += item.count;
                        merged = true;
                    } else {
                        existing.count = item.maxStack;
                        item.count -= space;
                    }
                }
            }
            if (!merged) chestItems.push(item);
        } else if (direction === 'to_hero') {
            const item = chestItems[index];
            if (!item) return;
            chestItems.splice(index, 1);

            const success = giveItemToServerInventory(player, item);
            if (!success) {
                chestItems.push(item);
                socket.emit('inventoryFull');
                return;
            }
        }

        fs.writeFileSync('chests.json', JSON.stringify(chestDb, null, 2));
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        io.emit('chestUpdated', { chestId, items: chestItems });
    });

    socket.on('requestCellar', (cellarId) => {
        if (!cellarDb[cellarId]) cellarDb[cellarId] = [];
        socket.emit('cellarData', { cellarId, items: cellarDb[cellarId] });
    });

    socket.on('updateCellar', (data) => {
        cellarDb[data.cellarId] = data.items;
        fs.writeFileSync('cellars.json', JSON.stringify(cellarDb, null, 2));
        socket.broadcast.emit('cellarUpdated', data);
    });

    socket.on('requestCellarTransfer', (data) => {
        const { cellarId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (!cellarDb[cellarId]) cellarDb[cellarId] = [];
        const cellarItems = cellarDb[cellarId];

        if (direction === 'to_cellar') {
            const item = player.inventory[index];
            if (!item) return;
            player.inventory.splice(index, 1);
            cellarItems.push(item);
        } else if (direction === 'to_hero') {
            if (player.inventory.length >= 10) {
                socket.emit('inventoryFull');
                return;
            }
            const item = cellarItems[index];
            if (!item) return;
            cellarItems.splice(index, 1);
            player.inventory.push(item);
        }

        fs.writeFileSync('cellars.json', JSON.stringify(cellarDb, null, 2));
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        io.emit('cellarUpdated', { cellarId, items: cellarItems });
    });

    socket.on('requestHayStorage', (hayStorageId) => {
        if (!hayDb[hayStorageId]) hayDb[hayStorageId] = [];
        socket.emit('hayStorageData', { hayStorageId, items: hayDb[hayStorageId] });
    });

    socket.on('updateHayStorage', (data) => {
        hayDb[data.hayStorageId] = data.items;
        fs.writeFileSync('hay.json', JSON.stringify(hayDb, null, 2));
        socket.broadcast.emit('hayStorageUpdated', data);
    });

    socket.on('requestHayTransfer', (data) => {
        const { hayStorageId, index, direction } = data;
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        if (!hayDb[hayStorageId]) hayDb[hayStorageId] = [];
        const hayItems = hayDb[hayStorageId];

        if (direction === 'to_storage') {
            const item = player.inventory[index];
            if (!item || (item.seedType !== 'hay' && item.seedType !== 'plant_matter')) return;
            player.inventory.splice(index, 1);
            hayItems.push(item);
        } else if (direction === 'to_hero') {
            if (player.inventory.length >= 10) {
                socket.emit('inventoryFull');
                return;
            }
            const item = hayItems[index];
            if (!item) return;
            hayItems.splice(index, 1);
            player.inventory.push(item);
        }

        fs.writeFileSync('hay.json', JSON.stringify(hayDb, null, 2));
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        io.emit('hayStorageUpdated', { hayStorageId, items: hayItems });
    });

    // ==========================================
    // 🏪 GENERAL STORE MARKET
    // ==========================================
    socket.on('requestStore', (storeId) => {
        if (!storeDb[storeId]) {
            storeDb[storeId] = { listings: [], storage: {} };
        }
        socket.emit('storeData', { storeId, data: storeDb[storeId] });
    });

    socket.on('createListing', (data) => {
        const { storeId, wallet, offeredItem, wantedType } = data;
        storeDb[storeId].listings.push({
            id: Date.now().toString(),
            seller: wallet,
            offeredItem: offeredItem,
            wantedType: wantedType,
            counterOffer: null
        });
        saveStores();
        io.emit('storeUpdated', { storeId, data: storeDb[storeId] });
    });

    socket.on('buyListing', (data) => {
        const { storeId, listingId, buyerWallet, paymentItem, isHobbit } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);

        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            if (!isHobbit) {
                if (!store.storage[buyerWallet]) store.storage[buyerWallet] = [];
                store.storage[buyerWallet] = store.storage[buyerWallet].concat(listing.offeredItem);
            }
            if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
            store.storage[listing.seller] = store.storage[listing.seller].concat(paymentItem);

            store.listings.splice(listIdx, 1);
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('makeCounterOffer', (data) => {
        const { storeId, listingId, buyerWallet, counterItem } = data;
        const store = storeDb[storeId];
        const listing = store.listings.find(l => l.id === listingId);
        if (listing) {
            listing.counterOffer = { buyer: buyerWallet, item: counterItem };
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('resolveCounterOffer', (data) => {
        const { storeId, listingId, accept } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);

        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            if (accept) {
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer] = store.storage[listing.counterOffer.buyer].concat(listing.offeredItem);

                if (!store.storage[listing.seller]) store.storage[listing.seller] = [];
                store.storage[listing.seller] = store.storage[listing.seller].concat(listing.counterOffer.item);

                store.listings.splice(listIdx, 1);
            } else {
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer] = store.storage[listing.counterOffer.buyer].concat(listing.counterOffer.item);
                listing.counterOffer = null;
            }
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('cancelListing', (data) => {
        const { storeId, listingId, wallet } = data;
        const store = storeDb[storeId];
        const listIdx = store.listings.findIndex(l => l.id === listingId);

        if (listIdx !== -1) {
            const listing = store.listings[listIdx];
            if (!store.storage[wallet]) store.storage[wallet] = [];
            store.storage[wallet] = store.storage[wallet].concat(listing.offeredItem);

            if (listing.counterOffer) {
                if (!store.storage[listing.counterOffer.buyer]) store.storage[listing.counterOffer.buyer] = [];
                store.storage[listing.counterOffer.buyer] = store.storage[listing.counterOffer.buyer].concat(listing.counterOffer.item);
            }

            store.listings.splice(listIdx, 1);
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    socket.on('claimStorage', (data) => {
        const { storeId, wallet } = data;
        const store = storeDb[storeId];
        if (store.storage[wallet]) {
            socket.emit('storageClaimed', { items: store.storage[wallet] });
            store.storage[wallet] = [];
            saveStores();
            io.emit('storeUpdated', { storeId, data: store });
        }
    });

    // ==========================================
    // 🛠️ WORKSTATION JOBS & CRAFTING
    // ==========================================
    socket.on('request_job', (jobId) => {
        const config = getJobConfig(jobId);
        if (!activeJobs.has(jobId)) {
            activeJobs.set(jobId, {
                workLeft: config ? config.maxWork : 100,
                maxWork: config ? config.maxWork : 100,
                active: false,
                ready: false,
                recipe: null
            });
        }
        socket.emit('job_data', { jobId, data: activeJobs.get(jobId) });
    });

    socket.on('start_job', (data) => {
        const { jobId, recipe } = data;
        const player = players[socket.id];
        const job = activeJobs.get(jobId);
        if (!player || !job || job.active || job.ready) return;

        const config = getJobConfig(jobId, recipe);
        if (!config) return;

        const itemIdx = player.inventory.findIndex(item => item.seedType === config.inputItem);
        if (itemIdx === -1 || player.inventory[itemIdx].count < config.inputCount) return;

        player.inventory[itemIdx].count -= config.inputCount;
        if (player.inventory[itemIdx].count <= 0) player.inventory.splice(itemIdx, 1);

        job.maxWork = config.maxWork;
        job.workLeft = config.maxWork;
        job.active = true;
        job.ready = false;
        job.recipe = recipe;

        io.emit('job_updated', { jobId, data: job });
        socket.emit('updateInventory', player.inventory);
    });

    socket.on('work_job_strike', (data) => {
        const job = activeJobs.get(data.jobId);
        if (job && job.active && job.workLeft > 0) {
            job.workLeft--;
            if (job.workLeft <= 0) job.ready = true;
            if (job.workLeft % 5 === 0 || job.workLeft === 0) {
                io.emit('job_updated', { jobId: data.jobId, data: job });
            }
        }
    });

    socket.on('speed_up_job', (data) => {
        const player = players[socket.id];
        const job = activeJobs.get(data.jobId);
        if (!player || !job || !job.active) return;

        const config = getJobConfig(data.jobId, job.recipe);
        if (!config) return;

        if (player.inGameUni >= config.speedUpCost) {
            player.inGameUni -= config.speedUpCost;
            saveDebt();
            logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${config.speedUpCost} UNI to speed up ${data.jobId}`);

            job.workLeft = 0;
            job.ready = true;

            io.emit('job_updated', { jobId: data.jobId, data: job });
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            broadcastEffectiveTGV(io);
            syncPlayerAndSave(socket.id);
        } else {
            socket.emit('oreMessage', `Insufficient funds! You need ${config.speedUpCost} UNI.`);
        }
    });

    socket.on('collect_job', (data) => {
        const player = players[socket.id];
        const job = activeJobs.get(data.jobId);
        if (!player || !job || !job.ready) return;

        const config = getJobConfig(data.jobId, job.recipe);
        if (!config) return;

        job.active = false;
        job.ready = false;
        job.workLeft = config.maxWork;

        io.emit('job_updated', { jobId: data.jobId, data: job });
        socket.emit('receive_job_loot', { recipe: job.recipe, tableType: data.jobId.split('_')[0] });
        job.recipe = null;
    });

    // ==========================================
    // 🎣 FISHING & ⛏️ MINING
    // ==========================================
    socket.on('requestCastLine', (data) => {
        const { tx, ty } = data;
        const player = players[socket.id];
        if (!player) return;

        const px = Math.floor(player.x / 16);
        const py = Math.floor(player.y / 16);
        if (Math.abs(px - tx) + Math.abs(py - ty) > 5) return;

        const safeCount = Math.max(1, globalFishCount);
        const multiplier = Math.sqrt(10000 / safeCount);
        const scarcityMod = Math.min(30.0, multiplier);
        const waitTime = (2 + Math.random() * 3) * scarcityMod * 1000;

        fishingStates.set(socket.id, {
            startTime: Date.now(),
            waitTime: waitTime,
            active: true
        });

        socket.emit('fishingCastConfirmed', { waitTime });
    });

    socket.on('requestReelIn', () => {
        const state = fishingStates.get(socket.id);
        const player = players[socket.id];
        if (!state || !state.active || !player) return;

        const elapsed = Date.now() - state.startTime;
        if (elapsed < state.waitTime) return;

        const caughtFishTemplate = getRandomServerFish();
        const fishItem = createItem(caughtFishTemplate);

        if (!giveItemToServerInventory(player, fishItem)) {
            socket.emit('inventoryFull');
        }

        fishingStates.delete(socket.id);
        syncPlayerAndSave(socket.id);
        socket.emit('updateInventory', player.inventory);
        socket.emit('fishingFinished');
    });

    socket.on('requestOre', (oreId) => {
        if (!oreDb[oreId]) {
            oreDb[oreId] = { workLeft: 3600, maxWork: 3600, lastSpeedUp: 0, claimed: false };
        }
        socket.emit('oreData', { oreId, data: oreDb[oreId] });
    });

    socket.on('mineOreStrike', (data) => {
        const { oreId } = data;
        if (!oreDb[oreId]) {
            io.emit('oreUpdated', { oreId, data: oreDb[oreId] });
            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
        }
    });

    socket.on('collectOre', (data) => {
        const { oreId } = data;
        const ore = oreDb[oreId];
        if (ore && ore.workLeft === 0 && !ore.claimed) {
            ore.claimed = true;
            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
            io.emit('oreUpdated', { oreId, data: ore });
            socket.emit('receiveOreLoot');
        }
    });

    socket.on('speedUpOre', (data) => {
        const { oreId } = data;
        const player = players[socket.id];
        const ore = oreDb[oreId];
        if (!ore || !player) return;

        const SPEEDUP_COST = 1.22;
        const COOLDOWN_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (now - ore.lastSpeedUp < COOLDOWN_MS) {
            socket.emit('oreMessage', "The blast charges are still cooling down. Try again tomorrow!");
            return;
        }

        if (player.inGameUni >= SPEEDUP_COST) {
            player.inGameUni -= SPEEDUP_COST;
            ore.workLeft = 0;
            ore.lastSpeedUp = now;

            saveDebt();
            logActivity('SPEEDUP', socket.wallet || socket.id, `Paid ${SPEEDUP_COST} UNI to blast an Iron Vein`);

            fs.writeFileSync('ores.json', JSON.stringify(oreDb, null, 2));
            io.emit('oreUpdated', { oreId, data: ore });
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            broadcastEffectiveTGV(io);
            syncPlayerAndSave(socket.id);
        } else {
            socket.emit('oreMessage', `Insufficient funds! You need ${SPEEDUP_COST} UNI.`);
        }
    });

    // ==========================================
    // ⛩️ SACRIFICES & WITHDRAWALS
    // ==========================================
    socket.on('sacrificeItem', (data) => {
        const player = players[socket.id];
        if (!player || !player.inventory) return;

        const now = Date.now();
        if (player.lastSacrifice && now - player.lastSacrifice < 1000) return;
        player.lastSacrifice = now;

        const isValidSeed = POINT_VALUES[data.itemType];
        if (!isValidSeed) return;

        const requestedCount = Math.min(64, Math.max(1, data.count || 1));
        const itemIdx = player.inventory.findIndex(item => item.seedType === data.itemType);
        if (itemIdx === -1 || player.inventory[itemIdx].count < requestedCount) {
            socket.emit('oreMessage', "🔒 Offering Rejected: You do not possess those items in your backpack.");
            return;
        }

        player.inventory[itemIdx].count -= requestedCount;
        if (player.inventory[itemIdx].count <= 0) {
            player.inventory.splice(itemIdx, 1);
        }

        socket.emit('updateInventory', player.inventory);

        const effectiveTGV = Math.max(0, currentTVL - globalDebt);
        const pointsPerSeed = effectiveTGV / 640000;
        const totalPoints = pointsPerSeed * requestedCount;

        if (data.isVillageWalletFund && data.villageId) {
            const village = serverVillages.get(data.villageId);
            if (village && village.owner) {
                village.treasury = (parseFloat(village.treasury) || 0.0) + totalPoints;
                saveVillages();
                io.emit('villageOwnerUpdated', {
                    wellX: village.x, wellY: village.y,
                    owner: village.owner, progress: village.captureProgress,
                    treasury: village.treasury
                });
            }
        } else {
            player.inGameUni = (parseFloat(player.inGameUni) || 0.0) + totalPoints;
            saveDebt();
            syncPlayerAndSave(socket.id);
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        }

        broadcastEffectiveTGV(io);
        logActivity('SACRIFICE', socket.wallet || socket.id, `Sacrificed ${requestedCount}x ${data.itemType} for ${totalPoints.toFixed(8)} UNI`);
    });

    socket.on('requestWithdrawal', async (reqData) => {
        const player = players[socket.id];
        const amount = typeof reqData === 'object' ? reqData.amount : reqData;
        const targetAddress = (typeof reqData === 'object' && reqData.targetAddress) ? reqData.targetAddress : socket.wallet;

        if (!player || player.inGameUni < amount || !socket.wallet) return;

        player.inGameUni -= amount;
        saveDebt();
        syncPlayerAndSave(socket.id);

        socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        broadcastEffectiveTGV(io);

        const nonce = Math.floor(Math.random() * 1000000000);
        try {
            const voucher = await createVoucher(targetAddress, amount, nonce);
            socket.emit('receiveWithdrawalVoucher', voucher);
        } catch (err) {
            console.error("Voucher generation failed:", err);
            player.inGameUni += amount;
            saveDebt();
            syncPlayerAndSave(socket.id);
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
            broadcastEffectiveTGV(io);
        }
    });

    socket.on('requestWithdrawalRefund', (amountStr) => {
        const player = players[socket.id];
        const amount = parseFloat(amountStr);
        if (player && amount > 0) {
            player.inGameUni += amount;
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        }
        broadcastEffectiveTGV(io);
        syncPlayerAndSave(socket.id);
    });

    socket.on('refundWithdrawal', (amountStr) => {
        const player = players[socket.id];
        const amount = parseFloat(amountStr);
        if (player && amount > 0) {
            player.inGameUni += amount;
            socket.emit('balanceUpdated', { inGameUni: player.inGameUni });
        }
        broadcastEffectiveTGV(io);
        syncPlayerAndSave(socket.id);
    });

    // ==========================================
    // ⚔️ COMBAT, PVP & SPELLS
    // ==========================================
    socket.on('pvpAttack', (data) => {
        const attacker = players[socket.id];
        if (!attacker) return;

        // Route A: Chicken Target
        if (data.targetId && data.targetId.startsWith('animal_')) {
            const victimIndex = serverAnimals.findIndex(a => a.id === data.targetId);
            if (victimIndex !== -1) {
                const victim = serverAnimals[victimIndex];
                const finalDamage = attacker.ad || 10;
                victim.hp = Math.max(0, victim.hp - finalDamage);

                if (victim.hp <= 0) {
                    const tx = Math.floor((victim.x || victim.tx * 16 + 8) / 16);
                    const ty = Math.floor((victim.y || victim.ty * 16 + 8) / 16);
                    const packedTraits = ((50 & 0xFF) | ((50 & 0xFF) << 20)) >>> 0;
                    serverBacteria.set(`${tx}_${ty}`, packedTraits);
                    io.emit('syncTile', { gx: tx, gy: ty, traits: packedTraits });

                    serverAnimals.splice(victimIndex, 1);
                    saveChickens();
                }
                io.emit('animals', { animals: serverAnimals });
            }
            return;
        }

        // Route B: Hobbit Target
        if (data.targetId && data.targetId.startsWith('hobbit_')) {
            const victim = serverHobbits.find(h => h.id === data.targetId);
            if (victim && victim.hp > 0) {
                const victimArmor = Math.max(1, victim.armor || 1);
                const armorReduction = Math.pow(0.5, Math.log10(victimArmor));
                const finalDamage = Math.max(1, Math.floor((attacker.ad || 10) * armorReduction));

                victim.hp = Math.max(0, victim.hp - finalDamage);

                const hTX = Math.floor(victim.x / 16);
                const hTY = Math.floor(victim.y / 16);
                for (let [key, village] of serverVillages) {
                    if (Math.hypot(village.x - hTX, village.y - hTY) <= 40) {
                        io.emit('villageIntruderAggro', { wellX: village.x, wellY: village.y, intruderId: socket.id });
                    }
                }

                io.emit('hobbitHit', {
                    targetId: victim.id,
                    newHp: victim.hp,
                    damage: finalDamage,
                    attackerId: attacker.id
                });
            }
            return;
        }

        // Route C: Remote Player Target
        const victim = players[data.targetId];
        if (victim && attacker && victim.hp > 0) {
            if (victim.isInvincible) return;

            const victimArmor = Math.max(1, victim.armor || 1);
            const armorReduction = Math.pow(0.5, Math.log10(victimArmor));
            let finalDamage = Math.max(1, Math.floor(attacker.ad * armorReduction));

            if (victim.hasDivineBubble) {
                victim.hasDivineBubble = false;
                io.emit('playerHit', { victimId: victim.id, newHp: victim.hp, newShield: victim.shield, bubblePopped: true, attackerId: attacker.id });
                return;
            }

            if (victim.shield > 0) {
                const damageToShield = Math.min(victim.shield, finalDamage);
                victim.shield -= damageToShield;
                finalDamage -= damageToShield;
            }

            victim.hp -= finalDamage;

            const victimName = victim.wallet || `Guest_${victim.id.substring(0, 4)}`;
            for (let [key, village] of serverVillages) {
                if (village.owner === victimName) {
                    io.emit('villageIntruderAggro', { wellX: village.x, wellY: village.y, intruderId: attacker.id });
                }
            }

            io.emit('playerHit', { victimId: victim.id, newHp: victim.hp, newShield: victim.shield, attackerId: attacker.id });

            if (victim.hp <= 0) {
                victim.hp = 0;
                const xpGain = (victim.xp || 0) * 0.30;
                attacker.xp = (attacker.xp || 0) + xpGain;
                if (victim.wallet && userDb[victim.wallet]) {
                    userDb[victim.wallet].hp = 0;
                    userDb[victim.wallet].xp = victim.xp;
                    fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
                }
                io.emit('playerKilled', { victimId: victim.id, killerId: attacker.id, xpGained: xpGain, newAttackerXp: attacker.xp });
            }
        }
    });

    socket.on('abilityAoE', (data) => {
        const attacker = players[socket.id];
        if (!attacker) return;

        for (let vid in players) {
            if (vid === socket.id) continue;
            const victim = players[vid];
            const dx = victim.x - data.x;
            const dy = victim.y - data.y;
            const distSq = (dx * dx) + (dy * dy);
            const radiusSq = data.radius * data.radius;

            if (distSq <= radiusSq && victim.hp > 0) {
                if (data.type === 'divineBubbleExplosion') {
                    const dist = Math.sqrt(distSq) || 1;
                    victim.x += (dx / dist) * 32;
                    victim.y += (dy / dist) * 32;
                    io.emit('forcedMovement', { id: victim.id, x: victim.x, y: victim.y });
                    applyMagicSpellDamage(io, attacker, victim, data.damage);
                } else if (data.type === 'radiantNovaExplosion') {
                    io.emit('playerCC', { victimId: victim.id, ccType: 'slow', duration: 2.0 });
                    applyMagicSpellDamage(io, attacker, victim, data.damage);
                } else if (data.type === 'ringOfPenance') {
                    const IMPRISON_MASK = 1 | 4 | 8;
                    io.emit('playerCC', { victimId: victim.id, ccMask: IMPRISON_MASK, duration: 1.5 });
                    applyMagicSpellDamage(io, attacker, victim, data.damage);
                } else if (data.type === 'consecrationTick') {
                    applyMagicSpellDamage(io, attacker, victim, data.damage);
                } else if (data.type === 'zenithGuardianSpawn') {
                    const BIND_MASK = 1 | 2;
                    io.emit('playerCC', { victimId: victim.id, ccMask: BIND_MASK, duration: 1.5 });
                    applyMagicSpellDamage(io, attacker, victim, data.damage);
                }
            }
        }
    });

    socket.on('healPlayer', (data) => {
        const target = players[data.targetId];
        if (target && target.hp > 0) {
            target.hp = Math.min(target.maxHp || 100, target.hp + data.amount);
            io.emit('playerHealed', { targetId: target.id, newHp: target.hp, amount: data.amount });
        }
    });

    socket.on('castBuffOnAlly', (data) => {
        io.to(data.targetId).emit('receiveAllyBuff', data);
    });

    socket.on('fireProjectile', (data) => {
        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id,
            type: data.type,
            x: data.x, y: data.y,
            dx: data.dx, dy: data.dy,
            speed: data.speed,
            life: data.life,
            radius: data.radius,
            damage: data.damage
        });
    });

    socket.on('fireHomingProjectile', (data) => {
        const attacker = players[socket.id];
        const target = players[data.targetId];
        if (!attacker || !target) return;

        projectiles.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: socket.id,
            type: data.type,
            targetId: data.targetId,
            x: attacker.x + 8,
            y: attacker.y + 8,
            speed: 350,
            life: 2.0,
            damage: data.damage,
            skillIndex: data.skillIndex
        });
    });

    socket.on('syncTile', (data) => {
        socket.broadcast.emit('syncTile', data);
        if (data.traits === 0) {
            serverBacteria.delete(`${data.gx}_${data.gy}`);
        } else {
            serverBacteria.set(`${data.gx}_${data.gy}`, data.traits);
        }
    });

    socket.on('dropItem', (data) => {
        socket.broadcast.emit('remoteDrop', data);
    });

    socket.on('updateStats', (data) => {
        const p = players[socket.id];
        if (!p) return;
        if (data.inventory) delete data.inventory;
        Object.assign(p, data);

        if (socket.wallet && userDb[socket.wallet]) {
            userDb[socket.wallet] = { ...userDb[socket.wallet], ...data, id: undefined, target: null };
            fs.writeFileSync('persistence.json', JSON.stringify(userDb, null, 2));
        }
    });

    // ==========================================
    // 🚪 DISCONNECT CLEANUP
    // ==========================================
    socket.on('disconnect', () => {
        activeOverseers.delete(socket.id);
        const p = players[socket.id];
        if (!p) return;

        if (socket.wallet) {
            syncPlayerAndSave(socket.id);
        }

        if (p.wallet && p.wallet.startsWith('Guest_')) {
            const abandonedUNI = p.inGameUni || 0;
            if (abandonedUNI > 0) {
                saveDebt();
                broadcastEffectiveTGV(io);
            }
        }

        const safeTiles = [60, 61, 42, 48, 50];
        const isOnSafeTile = safeTiles.includes(p.currentTileID);

        if (isOnSafeTile) {
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
        } else {
            p.isOffline = true;
            p.isMoving = false;
        }
    });
}