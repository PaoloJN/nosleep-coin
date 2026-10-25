import fs from "node:fs";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey, none, some } from "@metaplex-foundation/umi";
import {
  mplTokenMetadata,
  updateMetadataAccountV2,
  findMetadataPda,
  fetchMetadata,
} from "@metaplex-foundation/mpl-token-metadata";

const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());
const secret = Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf8")));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

const mint = publicKey(JSON.parse(fs.readFileSync("mint.json", "utf8")).mint);
const metadataPda = findMetadataPda(umi, { mint });

// The URI is the only thing stored on-chain about the image. Wallets fetch
// this JSON off-chain and read .image from it. So "on-chain metadata" is
// really just name + symbol + a URL. The picture lives on GitHub.
const URI = "https://raw.githubusercontent.com/PaoloJN/nosleep-coin/main/metadata.json";

// Read the current on-chain data so we only change the uri field.
// Think: `{ ...current, uri: URI }`.
const current = await fetchMetadata(umi, metadataPda);

// Only the updateAuthority (us) can sign this. Anyone else gets rejected
// by the program, which is the whole point of authorities.
await updateMetadataAccountV2(umi, {
  metadata: metadataPda,
  updateAuthority: umi.identity,
  data: some({
    name: current.name,
    symbol: current.symbol,
    uri: URI,
    sellerFeeBasisPoints: current.sellerFeeBasisPoints,
    creators: current.creators,
    collection: current.collection,
    uses: current.uses,
  }),
  newUpdateAuthority: none(),
  primarySaleHappened: none(),
  isMutable: none(),
}).sendAndConfirm(umi);

const after = await fetchMetadata(umi, metadataPda);
console.log("name:", after.name, "symbol:", after.symbol);
console.log("uri:", after.uri);
console.log("explorer:", `https://explorer.solana.com/address/${mint}?cluster=devnet`);
