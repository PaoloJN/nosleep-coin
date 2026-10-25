import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { wallet, connection, readMint, explorer } from "./config.mjs";
import { getAssociatedTokenAddressSync, closeAccount } from "@solana/spl-token";

// Usage: node refund.mjs <recipient>
const recipient = new PublicKey(process.argv[2]);
const mint = new PublicKey(readMint());

// 1. Our token account is empty now. Closing it refunds its rent (~0.002 SOL)
//    to whoever we name. Rent is a deposit, not a fee: delete the row, get it back.
const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
await closeAccount(connection, wallet, ata, wallet.publicKey, wallet);
console.log("closed token account, rent refunded to script wallet");

// 2. Send everything left minus the tx fee. A SOL transfer is a SystemProgram
//    instruction, the most basic one on the chain: `from -= x; to += x`.
const balance = await connection.getBalance(wallet.publicKey);
const FEE = 5000; // lamports, base fee for a 1-signature tx
const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: recipient,
    lamports: balance - FEE,
  })
);
const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
console.log("refunded:", (balance - FEE) / LAMPORTS_PER_SOL, "SOL");
console.log("tx:", explorer("tx", sig));
