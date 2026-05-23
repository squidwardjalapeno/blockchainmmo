// src/blockchainManager.js
import { hero } from './entities.js';

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("blockchainManager.js loaded");
}

let bankUNI_ADDRESS = "0xb762c3B3f544B04D0eAD51Fa1883Ee0f0Ec87cE4";

const bankUNI_ABI = [
    "function cashOut(uint256 amount, uint256 nonce, bytes signature) external"
];

// UNICHAIN INFO
// Ensure the hex ID is exactly this for Mainnet
const UNICHAIN_CHAIN_ID = '0x82';


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
    const UNI_TOKEN_ADDRESS = "0x8f187aA05619a017077f5308904739877ce9eA21";
    if (!bankUNI_ADDRESS) return 0;
    try {
        const ethers = await getEthers(); 
        // 👈 MATCHING STABLE LINK
        const provider = new ethers.JsonRpcProvider('https://unichain.drpc.org');
        
        // Use the ERC20 balanceOf function instead of provider.getBalance
        const tokenAbi = ["function balanceOf(address) view returns (uint256)"];
        const tokenContract = new ethers.Contract(UNI_TOKEN_ADDRESS, tokenAbi, provider);
        
        const balance = await tokenContract.balanceOf(bankUNI_ADDRESS);
        return parseFloat(ethers.formatEther(balance));
    } catch (err) {
        return 0;
    }
}

// Restore the Voucher Submission Logic
export async function submitVoucherToChain(voucher) {
    if (!window.ethereum) {
        alert("MetaMask is required to withdraw!");
        return;
    }

    // Inside submitVoucherToChain(voucher)... replace the try block:
    try {
        const ethers = await getEthers();
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(bankUNI_ADDRESS, bankUNI_ABI, signer);

        console.log("--- 🛰️ SENDING TO BLOCKCHAIN ---");
        console.log("Target Contract:", bankUNI_ADDRESS);
        console.log("Arg 1 (Amount):", voucher.amount);
        console.log("Arg 2 (Nonce):", voucher.nonce);
        console.log("Arg 3 (Sig):", voucher.signature);

        const tx = await contract.cashOut(
            BigInt(voucher.amount), 
            BigInt(voucher.nonce), 
            voucher.signature,
            { gasLimit: 250000 }
        );
        
        console.log("Transaction Hash:", tx.hash);
        await tx.wait();
        console.log("✅ CONFIRMED ON-CHAIN");

    } catch (err) {
        console.error("Withdrawal failed on-chain:", err);
        
        // 👈 THE FIX: Ensure the refund is sent as a flat string, not "1e-7"
        const refundAmountString = parseFloat(voucher.humanAmount).toFixed(18);
        
        alert("Transaction failed or was rejected. Refunding your points!");
        
        import('./multiplayer.js').then(m => {
            if (m.socket) m.socket.emit('refundWithdrawal', refundAmountString);
        });
    }
}