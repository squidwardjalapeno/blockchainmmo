// js/blockchainManager.js
// Change your import to this:
// This specific cdnjs link is the "Gold Standard" for Ethers v6 in browsers
import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js';

import { hero } from './entities.js';
import { playerWallet, pendingVouchers } from './multiplayer.js';

const WELL_BANK_ADDRESS = "0xf3Abb89fE45059cc0AE267c40FB172cFBb49F9A6";
const WELL_BANK_ABI = [
    "function redeemVoucher(address player, uint256 amount, uint256 nonce, bytes signature) external",
    "function withdraw(uint256 _pointAmount) external",
    "function points(address) view returns (uint256)",
    "function getMasterBalance() view returns (uint256)"
];

const AMOY_CHAIN_ID = '0x13882';

/**
 * 📊 Syncs hero's on-chain points with the smart contract
 */
export async function refreshOnChainPoints() {
    if (!window.ethereum || !playerWallet) return;
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(WELL_BANK_ADDRESS, WELL_BANK_ABI, provider);
        const p = await contract.points(playerWallet);
        hero.onChainPoints = Number(p);
        console.log(`📊 On-Chain Sync: ${hero.onChainPoints} points`);
    } catch (err) {
        console.error("Sync failed:", err);
    }
}

/**
 * 🏦 Redeems all signed vouchers currently in the player's queue
 */
export async function redeemAllVouchers() {
    if (!window.ethereum || pendingVouchers.length === 0) return;

    try {
        // Ensure we are on the right chain
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: AMOY_CHAIN_ID }],
        }).catch(async (err) => {
            if (err.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: AMOY_CHAIN_ID,
                        chainName: 'Polygon Amoy',
                        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                        rpcUrls: ['https://rpc-amoy.polygon.technology'],
                        blockExplorerUrls: ['https://amoy.polygonscan.com']
                    }]
                });
            }
        });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(WELL_BANK_ADDRESS, WELL_BANK_ABI, signer);

        for (let i = pendingVouchers.length - 1; i >= 0; i--) {
            const v = pendingVouchers[i];
            const tx = await contract.redeemVoucher(v.player, v.amount, v.nonce, v.signature);
            await tx.wait();
            pendingVouchers.splice(i, 1);
        }

        await refreshOnChainPoints();
        console.log("✅ All vouchers banked!");
    } catch (err) {
        console.error("Redemption failed:", err);
    }
}

/**
 * 💰 Withdraws points back into real POL tokens
 */
export async function withdrawPoints(amount) {
    if (!window.ethereum || !playerWallet || amount <= 0) return;

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(WELL_BANK_ADDRESS, WELL_BANK_ABI, signer);

        const tx = await contract.withdraw(amount);
        await tx.wait();
        
        await refreshOnChainPoints();
        console.log("💰 Withdrawal Successful!");
    } catch (err) {
        console.error("Withdrawal failed:", err);
    }
}
