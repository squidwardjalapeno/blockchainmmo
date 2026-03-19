const { ethers } = require("ethers");
require("dotenv").config();

// 1. Add a provider so the wallet is "connected" to the network
const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC);

// 1. Setup the Admin Wallet (The Private Key for your ADMIN_ADDRESS)
const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

// Safety check: ensure the key exists before creating the wallet
if (!adminPrivateKey) {
    console.error("❌ ERROR: ADMIN_PRIVATE_KEY is missing from .env!");
    process.exit(1);
}

const adminWallet = new ethers.Wallet(adminPrivateKey, provider);

// 2. Define the "Domain" (Must match your Solidity constructor exactly!)
const domain = {
    name: "WellBank",
    version: "1",
    chainId: 80002, // Polygon Amoy
    verifyingContract: "0xf3Abb89fE45059cc0AE267c40FB172cFBb49F9A6"
};

// 3. Define the "Types" (Must match the Solidity struct)
const types = {
    Voucher: [
        { name: "player", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" }
    ]
};

/**
 * Creates a signed voucher for a player
 */
async function createVoucher(playerAddress, amount, nonce) {
    const voucher = { player: playerAddress, amount: amount, nonce: nonce };
    
    // This creates the EIP-712 Signature
    const signature = await adminWallet.signTypedData(domain, types, voucher);

    return {
        ...voucher,
        signature
    };
}

module.exports = { createVoucher };
