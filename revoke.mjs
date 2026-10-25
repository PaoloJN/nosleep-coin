import fs from "node:fs";
import { Keypair, Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { setAuthority, AuthorityType, getMint } from "@solana/spl-token";

const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf8")))
);
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const mint = new PublicKey(JSON.parse(fs.readFileSync("mint.json", "utf8")).mint);

const before = await getMint(connection, mint);
console.log("mint authority before:", before.mintAuthority?.toBase58() ?? "none");

// setAuthority changes who controls one of the mint's authority slots.
// Passing `null` as the new authority is a one-way door: the slot becomes
// empty and the Token Program has no instruction to fill it again.
// Think: `Object.freeze(mint.mintAuthority = null)`. Supply is now fixed forever.
await setAuthority(
  connection,
  wallet,                    // payer
  mint,                      // which mint
  wallet,                    // current authority, must sign
  AuthorityType.MintTokens,  // which slot: MintTokens or FreezeAccount
  null                       // new authority: nobody
);

const after = await getMint(connection, mint);
console.log("mint authority after:", after.mintAuthority?.toBase58() ?? "none");
console.log("supply (fixed):", Number(after.supply) / 1e9);
