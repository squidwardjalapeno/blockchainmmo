// 1. Modern Imports
import { ethers } from "ethers";
import dotenv from "dotenv";

// Initialize dotenv to read your .env file
dotenv.config();

// 2. Setup Provider and Wallet
const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC);
const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

if (!adminPrivateKey) {
    console.error("❌ ERROR: ADMIN_PRIVATE_KEY is missing from .env!");
    // In ES Modules, we don't use process.exit(1) globally as often, 
    // but it's fine for a boot-up safety check.
}

const adminWallet = new ethers.Wallet(adminPrivateKey, provider);

// 3. EIP-712 Domain & Types
const domain = {
    name: "WellBank",
    version: "1",
    chainId: 80002, // Polygon Amoy
    verifyingContract: "0xf3Abb89fE45059cc0AE267c40FB172cFBb49F9A6"
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
