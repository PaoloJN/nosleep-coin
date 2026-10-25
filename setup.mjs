import fs from "node:fs";
import {
  Keypair,
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// 1. A keypair = { publicKey, secretKey }. publicKey is the address,
//    secretKey signs transactions. Phantom holds one of these for you.
//    Reuse wallet.json if it exists so re-runs keep the same address.
let wallet;
if (fs.existsSync("wallet.json")) {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf8")));
  wallet = Keypair.fromSecretKey(secret);
} else {
  wallet = Keypair.generate();
  // 2. Persist the secret so the next scripts use the same wallet.
  //    Uint8Array -> plain array so JSON can hold it.
  fs.writeFileSync("wallet.json", JSON.stringify(Array.from(wallet.secretKey)));
}

// 3. Connection = an RPC client (basically fetch) aimed at a cluster.
//    devnet is the free test network. "confirmed" = wait until a majority voted on it.
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

console.log("address:", wallet.publicKey.toBase58());

// 4. Only ask the faucet if we're empty. Amounts are in lamports
//    (1 SOL = 1e9 lamports), like cents vs dollars but with 9 decimals.
let balance = await connection.getBalance(wallet.publicKey);
if (balance === 0) {
  const sig = await connection.requestAirdrop(wallet.publicKey, 1 * LAMPORTS_PER_SOL);
  // 5. requestAirdrop returns a tx signature immediately. confirmTransaction
  //    blocks until the network has actually processed it.
  await connection.confirmTransaction(sig, "confirmed");
  balance = await connection.getBalance(wallet.publicKey);
}

// 6. Read the balance back from the chain.
console.log("balance:", balance / LAMPORTS_PER_SOL, "SOL");
