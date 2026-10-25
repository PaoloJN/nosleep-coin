import fs from "node:fs";
import { Keypair, Connection } from "@solana/web3.js";

// CLUSTER=mainnet node mint.mjs  -> real chain, real SOL
// node mint.mjs                  -> devnet (default)
export const CLUSTER = process.env.CLUSTER === "mainnet" ? "mainnet" : "devnet";

export const RPC_URL =
  CLUSTER === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

// Separate wallet + mint files per cluster so we never mix them up.
export const WALLET_FILE = CLUSTER === "mainnet" ? "wallet-mainnet.json" : "wallet.json";
export const MINT_FILE = CLUSTER === "mainnet" ? "mint-mainnet.json" : "mint.json";

export const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_FILE, "utf8")));
export const wallet = Keypair.fromSecretKey(secretKey);
export const connection = new Connection(RPC_URL, "confirmed");

export const explorer = (kind, id) =>
  `https://explorer.solana.com/${kind}/${id}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;

export const readMint = () => JSON.parse(fs.readFileSync(MINT_FILE, "utf8")).mint;

console.log(`[${CLUSTER}] wallet ${wallet.publicKey.toBase58()}`);
