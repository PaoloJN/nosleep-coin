// Live pump.fun feed read straight from the chain. No third-party API.
//
// Every pump.fun transaction logs its events as base64 in a "Program data:"
// log line. We subscribe to all logs that mention the pump.fun program and
// decode two Anchor events: CreateEvent (new coin) and TradeEvent (buy/sell).
//
// An Anchor event is: 8-byte discriminator (sha256("event:Name")[0..8]) then
// the struct fields packed little-endian with no padding, like a C struct.
// Decoding it is just walking a Buffer with an offset. Think DataView.

import { Connection, PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const DISC_CREATE = "1b72a94ddeeb6376";
const DISC_TRADE = "bddb7fd34ee661ee";
const TOKEN_DECIMALS = 6;      // pump.fun tokens use 6 decimals
const TOTAL_SUPPLY = 1e9;      // every pump.fun coin mints 1 billion

// Tiny cursor over a Buffer. Each read advances the offset.
function reader(buf) {
  let o = 8; // skip discriminator
  return {
    u64: () => { const v = buf.readBigUInt64LE(o); o += 8; return v; },
    i64: () => { const v = buf.readBigInt64LE(o); o += 8; return v; },
    bool: () => buf[o++] === 1,
    pubkey: () => { const v = new PublicKey(buf.subarray(o, o + 32)).toBase58(); o += 32; return v; },
    string: () => { const len = buf.readUInt32LE(o); o += 4; const s = buf.toString("utf8", o, o + len); o += len; return s; },
  };
}

const lamports = (n) => Number(n) / 1e9;
const tokens = (n) => Number(n) / 10 ** TOKEN_DECIMALS;

// Spot price in SOL per token from the virtual reserves; market cap in SOL.
function curve(vSol, vTokens) {
  const price = lamports(vSol) / tokens(vTokens);
  return { price, mcapSol: price * TOTAL_SUPPLY };
}

export function decodeCreate(buf) {
  const r = reader(buf);
  const name = r.string(), symbol = r.string(), uri = r.string();
  const mint = r.pubkey(), bondingCurve = r.pubkey(), user = r.pubkey(), creator = r.pubkey();
  const timestamp = Number(r.i64());
  const vTokens = r.u64(), vSol = r.u64();
  return { type: "create", name, symbol, uri, mint, bondingCurve, user, creator, timestamp, ...curve(vSol, vTokens) };
}

export function decodeTrade(buf) {
  const r = reader(buf);
  const mint = r.pubkey();
  const solAmount = lamports(r.u64());
  const tokenAmount = tokens(r.u64());
  const isBuy = r.bool();
  const user = r.pubkey();
  const timestamp = Number(r.i64());
  const vSol = r.u64(), vTokens = r.u64();
  return { type: isBuy ? "buy" : "sell", mint, solAmount, tokenAmount, user, timestamp, ...curve(vSol, vTokens) };
}

export function decodeLogs(logs) {
  const events = [];
  for (const line of logs) {
    if (!line.startsWith("Program data: ")) continue;
    const buf = Buffer.from(line.slice(14), "base64");
    const disc = buf.subarray(0, 8).toString("hex");
    try {
      if (disc === DISC_CREATE) events.push(decodeCreate(buf));
      else if (disc === DISC_TRADE) events.push(decodeTrade(buf));
    } catch { /* truncated or foreign event, skip */ }
  }
  return events;
}

// Subscribe. onEvent gets {type:"create"|"buy"|"sell", ...}. Returns an
// object with .connected and .close(). "processed" = fastest, unconfirmed.
export function subscribe(onEvent, { rpc = "https://api.mainnet-beta.solana.com" } = {}) {
  const wsEndpoint = rpc.replace(/^http/, "ws");
  const connection = new Connection(rpc, { wsEndpoint, commitment: "processed" });
  const handle = { connected: true, close: () => connection.removeOnLogsListener(id) };
  const id = connection.onLogs(PUMP_PROGRAM, (l) => {
    if (l.err) return; // failed tx, events didn't happen
    for (const e of decodeLogs(l.logs)) onEvent({ ...e, signature: l.signature });
  }, "processed");
  return handle;
}
