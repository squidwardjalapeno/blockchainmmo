// 1. Modern Imports
import { ethers } from "ethers";
import dotenv from "dotenv";
// To this:
if (typeof window !== 'undefined') {
    logStep("voucherSystem.js");
}

// Initialize dotenv to read your .env file
dotenv.config();

// 2. Setup Provider and Wallet for UNICHAIN SEPOLIA
// 2. Setup Provider and Wallet for UNICHAIN SEPOLIA
const rpcUrl = "https://130.rpc.thirdweb.com"; // 👈 Hardcode this for a stable server link
const provider = new ethers.JsonRpcProvider(rpcUrl);
const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

if (!adminPrivateKey) {
    console.error("❌ ERROR: ADMIN_PRIVATE_KEY is missing from .env!");
    // In ES Modules, we don't use process.exit(1) globally as often, 
    // but it's fine for a boot-up safety check.
}

const adminWallet = new ethers.Wallet(adminPrivateKey, provider);

// src/voucherSystem.js
const domain = {
    name: "bankUNI",
    version: "1",
    chainId: 130, // Unichain Mainnet
    verifyingContract: "0xb762c3B3f544B04D0eAD51Fa1883Ee0f0Ec87cE4" 
};

const types = {
    Voucher: [
        { name: "player", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" }
    ]
};

export async function createVoucher(playerAddress, amount, nonce) {
    try {
        console.log("--- 📝 GENERATING VOUCHER ---");
        
        // 1. Log Raw Inputs
        console.log("Raw Player:", playerAddress);
        console.log("Raw Amount (float):", amount);
        console.log("Raw Nonce:", nonce);

        // 2. Normalize and Log
        const cleanPlayer = ethers.getAddress(playerAddress);
        const amountStr = amount.toFixed(18);
        const weiAmount = ethers.parseEther(amountStr);
        const bigNonce = BigInt(nonce);

        console.log("Checksummed Player:", cleanPlayer);
        console.log("Wei String:", weiAmount.toString());
        console.log("Nonce BigInt:", bigNonce.toString());

        const voucher = { player: cleanPlayer, amount: weiAmount, nonce: bigNonce };

        // 3. Log Domain and Types
        console.log("Domain Target:", domain.verifyingContract);
        console.log("Domain ChainID:", domain.chainId);

        // 4. Generate Signature
        const signature = await adminWallet.signTypedData(domain, types, voucher);
        console.log("Signature Generated:", signature.substring(0, 20) + "...");

        // 5. Local Verification Check
        const recovered = ethers.verifyTypedData(domain, types, voucher, signature);
        console.log("Local Recovered Signer:", recovered);
        console.log("Match Admin Wallet?", recovered.toLowerCase() === adminWallet.address.toLowerCase());
        console.log("----------------------------");

        return {
            player: cleanPlayer,
            amount: weiAmount.toString(),
            nonce: bigNonce.toString(),
            signature,
            humanAmount: amountStr
        };
    } catch (err) {
        console.error("❌ SIGNING FAILED:", err);
        throw err;
    }
}

// Add this to the bottom of src/voucherSystem.js
// Inside src/voucherSystem.js -> getContractTVL()
export async function getContractTVL() {
    const UNI_TOKEN_ADDRESS = "0x8f187aA05619a017077f5308904739877ce9eA21";
    try {
        const tokenAbi = ["function balanceOf(address) view returns (uint256)"];
        const tokenContract = new ethers.Contract(UNI_TOKEN_ADDRESS, tokenAbi, provider);
        
        // 👈 THE FIX: Adding { blockTag: 'latest' } forces the RPC to be snappy
        const balance = await tokenContract.balanceOf(domain.verifyingContract, { blockTag: 'latest' });
        
        return parseFloat(ethers.formatEther(balance));
    } catch (err) {
        console.error("Server TVL fetch error:", err.message);
        return null;
    }
}
