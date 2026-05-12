// src/blockchainManager.js
import { hero } from './entities.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("blockchainManager.js loaded");
}

let bankUNI_ADDRESS = "0x2F7ec34A04faBBb8bC0AB138DD297511F846D936";
const bankUNI_ABI = [
    "function cashOut(uint256 amountToCashOut, uint256 nonce, bytes signature) external"
];

// UNICHAIN SEPOLIA INFO
const UNICHAIN_CHAIN_ID = '0x515'; // Hex for 1301

export function setContractAddress(address) {
    bankUNI_ADDRESS = address;
}

// 🆕 Dynamically import Ethers v6 directly from the CDN (No bundler needed!)
async function getEthers() {
    const module = await import("https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js");
    return module.ethers;
}

// src/blockchainManager.js

export async function connectWallet() {
    if (!window.ethereum) {
        console.warn("MetaMask is not installed. Defaulting to Guest Mode.");
        return null; // Return null silently instead of alerting
    }
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        return accounts[0];
    } catch (err) {
        console.error("Wallet connection failed or rejected:", err);
        return null;
    }
}

// Add this back into src/blockchainManager.js

export async function getMasterBalance() {
    if (!window.ethereum || !bankUNI_ADDRESS) return 0;
    try {
        const ethers = await getEthers(); 
        const provider = new ethers.BrowserProvider(window.ethereum);
        const balance = await provider.getBalance(bankUNI_ADDRESS);
        return parseFloat(ethers.formatEther(balance));
    } catch (err) {
        console.warn("Failed to get TVL:", err);
        return 0;
    }
}

// Restore the Voucher Submission Logic
export async function submitVoucherToChain(voucher) {
    if (!window.ethereum) {
        alert("MetaMask is required to withdraw!");
        return;
    }

    try {
        const ethers = await getEthers();

        // Force MetaMask to Unichain Sepolia
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: UNICHAIN_CHAIN_ID }],
        }).catch(async (err) => {
            if (err.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: UNICHAIN_CHAIN_ID,
                        chainName: 'Unichain Sepolia',
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['https://sepolia.unichain.org'],
                        blockExplorerUrls: ['https://sepolia.uniscan.xyz']
                    }]
                });
            }
        });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(bankUNI_ADDRESS, bankUNI_ABI, signer);

        console.log("⏳ Processing withdrawal to Unichain...");
        
        // Call the cashOut function on the smart contract
        const tx = await contract.cashOut(voucher.amount, voucher.nonce, voucher.signature);
        
        await tx.wait();
        console.log("💰 Withdrawal Successful!");
        alert(`Successfully cashed out ${voucher.amount} UNI to your wallet!`);

    } catch (err) {
        console.error("Withdrawal failed on-chain:", err);
        alert("Transaction failed. You rejected the transaction, or the RPC is busy.");
    }
}