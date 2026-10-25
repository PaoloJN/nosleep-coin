
import { PublicKey } from "@solana/web3.js";
import { wallet, connection, readMint } from "./config.mjs";
import { setAuthority, AuthorityType, getMint } from "@solana/spl-token";

const mint = new PublicKey(readMint());

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
