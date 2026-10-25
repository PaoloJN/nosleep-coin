import fs from "node:fs";
import { Keypair, Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  getAccount,
} from "@solana/spl-token";

const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf8")))
);
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const mint = new PublicKey(JSON.parse(fs.readFileSync("mint.json", "utf8")).mint);

// Usage: node send.mjs <recipient> <amount>
const [, , to, amountArg] = process.argv;
const recipient = new PublicKey(to);
const DECIMALS = 9;
const amount = BigInt(amountArg ?? "1000") * 10n ** BigInt(DECIMALS);

// 1. Our own balance row for this mint (already exists from mint.mjs).
const from = await getOrCreateAssociatedTokenAccount(connection, wallet, mint, wallet.publicKey);

// 2. The recipient's balance row. Phantom has never seen NOSLEEP, so this
//    account doesn't exist yet. getOrCreate makes it, and *we* pay its rent
//    (~0.002 SOL) because we're the payer. This is why sending a new token
//    to someone costs the sender a little more than a plain transfer.
//    Think: `balances[recipient][mint] ??= 0` — the `??=` isn't free here.
const toAccount = await getOrCreateAssociatedTokenAccount(connection, wallet, mint, recipient);
console.log("recipient token account:", toAccount.address.toBase58());

// 3. Move amount from our row to theirs. Signed by the *owner* of the source
//    account (us). Just `from.amount -= x; to.amount += x`, enforced by the
//    Token Program so only the owner can decrement.
const sig = await transfer(
  connection,
  wallet,            // payer
  from.address,      // source balance account
  toAccount.address, // destination balance account
  wallet,            // owner of source, must sign
  amount
);
console.log("tx:", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

// 4. Read both balances back.
const a = await getAccount(connection, from.address);
const b = await getAccount(connection, toAccount.address);
console.log("sender now:", Number(a.amount) / 10 ** DECIMALS);
console.log("recipient now:", Number(b.amount) / 10 ** DECIMALS);
