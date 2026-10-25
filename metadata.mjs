import fs from "node:fs";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey, none } from "@metaplex-foundation/umi";
import {
  mplTokenMetadata,
  createMetadataAccountV3,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";

// Metaplex ships its own client ("umi") instead of web3.js. Same idea:
// an RPC connection + an identity (keypair) that signs and pays.
const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());

// Load the same wallet.json, but as a umi keypair this time.
const secret = Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf8")));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

const mint = publicKey(JSON.parse(fs.readFileSync("mint.json", "utf8")).mint);

// The metadata lives in a *separate* account whose address is derived from
// the mint: hash("metadata", programId, mint). That's a PDA (Program Derived
// Address). Think: `metadataByMint[mint]`, where the key is computed, not stored.
// Wallets and explorers look up this exact address to find a token's name.
const metadataPda = findMetadataPda(umi, { mint });
console.log("metadata account:", metadataPda[0]);

const NAME = "NoSleep";
const SYMBOL = "NOSLEEP";
const URI = ""; // will point to a JSON { name, symbol, description, image } later

// Only the mintAuthority can create metadata for a mint, which is why this
// has to be your wallet. updateAuthority = who may edit it later.
await createMetadataAccountV3(umi, {
  mint,
  mintAuthority: umi.identity,
  payer: umi.identity,
  updateAuthority: umi.identity,
  data: {
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
    sellerFeeBasisPoints: 0, // NFT royalty field, irrelevant for a fungible token
    creators: none(),
    collection: none(),
    uses: none(),
  },
  isMutable: true,           // lets us update the URI later. set false to lock forever.
  collectionDetails: none(),
}).sendAndConfirm(umi);

console.log("done:", `https://explorer.solana.com/address/${mint}?cluster=devnet`);
