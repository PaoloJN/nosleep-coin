import fs from "node:fs";
import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
} from "@solana/spl-token";

// Same wallet as setup.mjs. It will pay fees and be the token's authority.
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf8")))
);
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

const DECIMALS = 9; // like SOL: 1 token = 1e9 base units
const SUPPLY = 1_000_000; // how many whole tokens to print

// ---- 1. Create the MINT -------------------------------------------------
// The mint is the token's *definition*: decimals, total supply, and who is
// allowed to print more (mintAuthority) or freeze holders (freezeAuthority).
// Think: `class Coin { static decimals; static supply; static owner }`.
// Under the hood this creates a new account, pays its rent, and asks the
// Token Program to initialize it as a mint.
const mint = await createMint(
  connection,
  wallet,           // payer: who pays rent + fees
  wallet.publicKey, // mintAuthority: who can call mintTo later
  null,             // freezeAuthority: null = nobody can freeze accounts. keep it honest.
  DECIMALS
);
console.log("mint address:", mint.toBase58());

// ---- 2. Create a TOKEN ACCOUNT for your wallet --------------------------
// A wallet can't hold tokens directly. Each (wallet, mint) pair gets its own
// balance account: `{ mint, owner, amount }`. "Associated" means its address
// is derived deterministically from (wallet, mint), so anyone can compute it.
// Think: `balances[wallet][mint] ??= 0`.
const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet,           // payer
  mint,             // which token
  wallet.publicKey  // owner of the balance
);
console.log("token account:", tokenAccount.address.toBase58());

// ---- 3. MINT supply into it ---------------------------------------------
// Only the mintAuthority can do this. Amount is in base units, hence the
// multiply by 10^decimals. BigInt because 1e15 overflows safe integers.
await mintTo(
  connection,
  wallet,              // payer
  mint,                // which token
  tokenAccount.address,// destination balance account
  wallet,              // mintAuthority (must sign)
  BigInt(SUPPLY) * 10n ** BigInt(DECIMALS)
);

// ---- 4. Read it back from chain -----------------------------------------
const info = await getMint(connection, mint);
console.log("supply:", Number(info.supply) / 10 ** DECIMALS);
console.log("decimals:", info.decimals);
console.log("explorer:", `https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);

// Save the mint address for the next script (metadata).
fs.writeFileSync("mint.json", JSON.stringify({ mint: mint.toBase58() }));
