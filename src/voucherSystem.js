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
const provider = new ethers.JsonRpcProvider(process.env.UNICHAIN_SEPOLIA_RPC);
const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

if (!adminPrivateKey) {
    console.error("❌ ERROR: ADMIN_PRIVATE_KEY is missing from .env!");
    // In ES Modules, we don't use process.exit(1) globally as often, 
    // but it's fine for a boot-up safety check.
}

const adminWallet = new ethers.Wallet(adminPrivateKey, provider);

// 3. EIP-712 Domain & Types
const domain = {
    name: "bankUNI",
    version: "1",
    chainId: 1301,
    verifyingContract: "0x2F7ec34A04faBBb8bC0AB138DD297511F846D936"
};

const types = {
    Voucher: [
        { name: "player", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" }
    ]
};

/**
 * Creates a signed voucher for a player
 * Now using 'export' so server.js can import it!
 */
export async function createVoucher(playerAddress, amount, nonce) {
    const voucher = { player: playerAddress, amount: amount, nonce: nonce };
    
    // Create the EIP-712 Signature
    const signature = await adminWallet.signTypedData(domain, types, voucher);

    return {
        ...voucher,
        signature
    };
}
