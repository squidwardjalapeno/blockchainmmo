// serverBlockchain.js
import { ethers } from 'ethers';
import { getContractTVL } from './src/voucherSystem.js';
import { 
    serverVillages, 
    serverHobbits, 
    chestDb, 
    globalDebt, 
    saveVillages, 
    EXTRACTION_DELAY_MS, 
    HOBBIT_EXPORT_DELAY 
} from './serverState.js';

// ==========================================
// 1. RPC PROVIDERS & WALLET SIGNERS
// ==========================================
export const provider = new ethers.JsonRpcProvider(process.env.UNICHAIN_MAINNET_RPC);
export const adminProvider = new ethers.JsonRpcProvider(process.env.UNICHAIN_MAINNET_RPC, 130);
export const adminWalletSigner = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, adminProvider);

// ==========================================
// 2. CONTRACT INTERFACES & INSTANCES
// ==========================================
export const spawnerInterface = new ethers.Interface([
    "event VillageSpunIntact(address indexed owner, uint256 indexed deedTokenId, address indexed tbaAddress, uint256 hobbitCount)"
]);

export const deedContract = new ethers.Contract(
    process.env.SOVEREIGN_DEED_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    provider
);

export const spawnerContract = new ethers.Contract(
    process.env.SOVEREIGN_SPAWNER_ADDRESS,
    ["function claimVillagePeacefully(bytes32 salt, uint256 hobbitCount) external returns (uint256, address)"],
    adminWalletSigner
);

export const stakedStorageContract = new ethers.Contract(
    process.env.STAKED_STORAGE_ADDRESS,
    [
        "function balanceOfBatch(address[] memory accounts, uint256[] memory ids) view returns (uint256[] memory)",
        "function mint(address to, uint256 id, uint256 amount, bytes memory data) external",
        "function melt(address from, uint256 id, uint256 amount) external"
    ],
    adminWalletSigner
);

export const hobbitContract = new ethers.Contract(
    process.env.SOVEREIGN_HOBBIT_ADDRESS,
    [
        "function balanceOf(address owner) view returns (uint256)",
        "function mintHobbit(address to) external returns (uint256)"
    ],
    adminWalletSigner
);

export const registryContract = new ethers.Contract(
    process.env.ERC6551_REGISTRY_ADDRESS || "0x000000006551c194871ba60050eb3ccac985d062",
    [
        "function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) external view returns (address)"
    ],
    provider
);

// ==========================================
// 3. TVL & ECONOMY SYNC
// ==========================================
export let currentTVL = 0.0;

export function broadcastEffectiveTGV(io) {
    if (!io) return;
    const effectiveTGV = Math.max(0, currentTVL - globalDebt);
    io.emit('tgvUpdate', { tgv: effectiveTGV });
}

export async function syncTVLWithBlockchain(io) {
    const rawTvl = await getContractTVL();

    if (rawTvl === null) {
        console.log("⚠️ RPC Query failed. Keeping last known TGV.");
        return;
    }

    currentTVL = parseFloat(rawTvl) || 0;
    const debt = parseFloat(globalDebt) || 0;
    const effectiveTGV = Math.max(0, currentTVL - debt);

    broadcastEffectiveTGV(io);
    console.log(`📊 ECONOMY SYNC | Raw: ${currentTVL.toFixed(8)} | Debt: ${debt.toFixed(8)} | Final TGV: ${effectiveTGV.toFixed(8)}`);
}

// ==========================================
// 4. ON-CHAIN ACTIONS & JIT SETTLEMENT
// ==========================================

/**
 * Queries the ERC-20 UNI token balance of a specific TBA on Unichain.
 */
export async function queryTbaUniBalance(tbaAddress) {
    if (!tbaAddress) return 0.0;
    try {
        const uniAbi = ["function balanceOf(address) view returns (uint256)"];
        const uniContract = new ethers.Contract(
            process.env.UNI_TOKEN_ADDRESS || "0x8f187aA05619a017077f5308904739877ce9eA21", 
            uniAbi, 
            provider
        );
        const rawBal = await uniContract.balanceOf(tbaAddress);
        return parseFloat(ethers.formatEther(rawBal));
    } catch (e) {
        console.warn("⚠️ Failed to fetch TBA balance from Unichain:", e.message);
        return 0.0;
    }
}

/**
 * Queries the blockchain directly to find out how many worker NFTs 
 * are held inside a village's Token Bound Account (TBA) address.
 */
export async function queryOnChainHobbitCount(tbaAddress) {
    if (!tbaAddress) return 0;
    try {
        const balance = await hobbitContract.balanceOf(tbaAddress);
        return parseInt(balance.toString());
    } catch (err) {
        console.error("❌ Failed to query on-chain hobbit count:", err.message);
        return 0;
    }
}

/**
 * Authoritatively settles virtual treasury balance from Bank contract to the village TBA.
 */
export async function settleTreasuryToTBA(tbaAddress, amount) {
    if (!tbaAddress || amount <= 0) return;

    try {
        console.log(`🏦 JIT BANK SETTLEMENT: Settling ${amount.toFixed(8)} UNI from Bank to TBA [${tbaAddress}]...`);

        const bankUNIContract = new ethers.Contract(
            process.env.BANK_UNI_ADDRESS,
            ["function settleToTBA(address tba, uint256 amount) external"],
            adminWalletSigner
        );

        const weiAmount = ethers.parseEther(amount.toFixed(18));
        const tx = await bankUNIContract.settleToTBA(tbaAddress, weiAmount, { gasLimit: 120000 });
        await tx.wait();

        console.log(`✅ On-chain JIT bank settlement confirmed for ${amount.toFixed(8)} UNI.`);
    } catch (err) {
        console.error("❌ JIT Bank Settlement failed:", err.message);
        throw err;
    }
}

/**
 * Force-transfers an on-chain Sovereign Deed NFT from the defeated player to the conqueror.
 */
export async function executeOnChainForceTransfer(io, fromAddress, toAddress, tokenId) {
    if (!tokenId) {
        console.warn("⚠️ Aborting Force Transfer: No Deed Token ID is associated with this village record.");
        return;
    }

    try {
        console.log(`⚡ INITIATING ON-CHAIN FORCE TRANSFER: Moving Deed #${tokenId} from ${fromAddress} to ${toAddress}...`);

        const deedContractWithSigner = new ethers.Contract(
            process.env.SOVEREIGN_DEED_ADDRESS,
            ["function transferFrom(address from, address to, uint256 tokenId) external"],
            adminWalletSigner
        );

        const tx = await deedContractWithSigner.transferFrom(
            ethers.getAddress(fromAddress),
            ethers.getAddress(toAddress),
            BigInt(tokenId),
            { gasLimit: 150000 }
        );

        await tx.wait();
        console.log(`✅ On-Chain Force Transfer Confirmed for Deed #${tokenId}!`);

        if (io) {
            io.emit('chatMessage', { 
                sender: "SYSTEM", 
                message: `⚡ On-chain ownership of Deed #${tokenId} has been forcefully transferred to ${toAddress.substring(0, 8)}...` 
            });
        }
    } catch (err) {
        console.error("❌ On-Chain Force Transfer Failed:", err.message);
    }
}

/**
 * Maps game seedType string to the ERC-1155 StakedStorage Token ID.
 */
export function getItemTypeId(seedType) {
    const ids = {
        "iron_ore": 1,
        "iron_ingot": 2,
        "weapon_dagger": 3,
        "tool_pickaxe": 4
    };
    return ids[seedType] || 0;
}

// ==========================================
// 5. ASYNC EXTRACTION & HOBBIT PACKAGING QUEUES
// ==========================================
export const activeExtractionQueues = new Map(); // key: queueId, value: { id, owner, itemType, count, startTime, endTime, villageId, status }
export const activeHobbitQueues = new Map();     // key: queueId, value: { id, owner, hobbitData, packedItems, startTime, endTime, villageId, status }

/**
 * Sweeps active item extraction queues every 15s and mints on-chain ERC-1155s on completion.
 */
export async function tickExtractionQueues(io) {
    const now = Date.now();

    for (let [queueId, queue] of activeExtractionQueues) {
        if (queue.status === 'PROCESSING' && now >= queue.endTime) {
            queue.status = 'COMPLETED';

            try {
                // If it's a native UNI payout queue
                if (queue.itemType === 'UNI_PAYOUT') {
                    console.log(`🏦 Delivering delayed treasury payout of ${queue.count.toFixed(8)} UNI to ${queue.owner}...`);
                    await settleTreasuryToTBA(queue.owner, queue.count);
                } 
                // Standard ERC-1155 item extraction
                else {
                    const tokenId = getItemTypeId(queue.itemType);
                    const tx = await stakedStorageContract.mint(
                        queue.owner, 
                        tokenId, 
                        queue.count, 
                        "0x",
                        { gasLimit: 120000 }
                    );
                    await tx.wait();
                }

                activeExtractionQueues.delete(queueId);
                if (io) io.emit('extractionCompleted', { queueId, owner: queue.owner });
                console.log(`✅ Extraction Complete: Delivered ${queue.count}x ${queue.itemType} to ${queue.owner}.`);
            } catch (err) {
                console.error("❌ Failed to process extraction delivery:", err.message);
                queue.status = 'FAILED';
            }
        }
    }
}

/**
 * Sweeps active Hobbit packaging queues every 15s, mints the Hobbit NFA, and nests inventory into its TBA.
 */
export async function tickHobbitQueues(io) {
    const now = Date.now();

    for (let [queueId, queue] of activeHobbitQueues) {
        if (queue.status === 'PROCESSING' && now >= queue.endTime) {
            queue.status = 'COMPLETED';

            try {
                console.log(`⏳ Minting Hobbit NFT for ${queue.owner}...`);

                // 1. Mint the Hobbit NFT directly to the owner's personal wallet
                const tx = await hobbitContract.mintHobbit(queue.owner, { gasLimit: 200000 });
                const receipt = await tx.wait();

                const hobbitTokenId = extractTokenIdFromReceipt(receipt);

                // 2. Calculate the newly deployed Hobbit's TBA address
                const hobbitTBAAddress = await registryContract.account(
                    process.env.TBA_BLUEPRINT_ADDRESS,
                    ethers.zeroPadValue("0x00", 32),
                    130, // Unichain Mainnet
                    process.env.SOVEREIGN_HOBBIT_ADDRESS,
                    hobbitTokenId
                );

                // 3. Nest the packed items directly into the Hobbit's TBA wallet
                for (let itemType of queue.packedItems) {
                    console.log(`⏳ Nesting ${itemType} NFT into Hobbit TBA: ${hobbitTBAAddress}...`);
                    const gearTx = await stakedStorageContract.mint(
                        hobbitTBAAddress,
                        getItemTypeId(itemType),
                        1,
                        "0x",
                        { gasLimit: 120000 }
                    );
                    await gearTx.wait();
                }

                activeHobbitQueues.delete(queueId);
                if (io) io.emit('hobbitExportCompleted', { queueId, owner: queue.owner, tokenId: hobbitTokenId });
                console.log(`🎉 Web4 NFA Fully Packaged: Hobbit #${hobbitTokenId} delivered with ${queue.packedItems.length} items.`);
            } catch (err) {
                console.error("❌ Failed to complete on-chain Hobbit packaging:", err.message);
                queue.status = 'FAILED';
            }
        }
    }
}

/**
 * Conquest Hijack: Reassigns pending item extraction queues to the conqueror.
 */
export function handleVillageConquestQueues(villageId, newOwnerWalletAddress) {
    activeExtractionQueues.forEach((queue) => {
        if (queue.villageId === villageId && queue.status === 'PROCESSING') {
            console.log(`🎯 HIJACKED! ${queue.owner} lost pending queue ${queue.id} to new conqueror: ${newOwnerWalletAddress}`);
            queue.owner = newOwnerWalletAddress;
        }
    });
}

/**
 * Conquest Hijack: Reassigns pending Hobbit NFA export queues to the conqueror.
 */
export function handleVillageConquestHobbitQueues(villageId, newOwnerWalletAddress) {
    activeHobbitQueues.forEach((queue) => {
        if (queue.villageId === villageId && queue.status === 'PROCESSING') {
            console.log(`🎯 HIJACKED! Pending Hobbit NFA ${queue.hobbitData.name} transferred to: ${newOwnerWalletAddress}`);
            queue.owner = newOwnerWalletAddress;
        }
    });
}

/**
 * Helper to extract token ID from an ERC-721 Transfer log.
 */
function extractTokenIdFromReceipt(receipt) {
    for (const log of receipt.logs) {
        try {
            // ERC-721 Transfer topic: Transfer(address,address,uint256)
            if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
                return parseInt(BigInt(log.topics[3]).toString());
            }
        } catch (e) {}
    }
    return 0;
}