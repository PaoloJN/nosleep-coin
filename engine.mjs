// pump.fun paper-trading engine. Pure state + rules, no rendering.
// Events come from feed.mjs (decoded straight from chain logs).
// Consumers: paper.mjs (plain log) and dash.mjs (terminal UI).

import { subscribe } from "./feed.mjs";

export const RULES = {
  stakeSol: 0.01,
  maxAgeSec: 90,
  maxDevBuySol: 1.5,
  minBuyers: 5,
  takeProfit: 2.0,
  stopLoss: 0.6,
  maxHoldSec: 300,
  feeRate: 0.02,
  watchSec: 600,
  historyLen: 40, // price points kept per token for sparklines
};

export function createEngine({ onEvent = () => {}, onRaw = () => {} } = {}) {
  const tokens = new Map();
  const trades = [];
  const state = { tokens, trades, pnl: 0, launches: 0, connected: false, startedAt: Date.now(), eventsSeen: 0 };

  // The RPC can deliver the same tx twice under "processed" commitment.
  const seen = new Set();
  const dedupe = (key) => {
    if (seen.has(key)) return true;
    seen.add(key);
    if (seen.size > 5000) seen.delete(seen.values().next().value);
    return false;
  };

  const feed = subscribe((e) => {
    state.connected = true;
    state.eventsSeen++;
    if (dedupe(e.signature + e.type + e.mint)) return;
    onRaw(e); // every pump.fun event, for the tape
    if (e.type === "create") onCreate(e);
    else onTrade(e);
  });
  onEvent({ type: "info", text: "subscribed to pump.fun program logs (mainnet)" });

  function onCreate(d) {
    // Only standard SOL-quoted curves (launch mcap ~28 SOL). Others use a
    // different quote asset and their numbers aren't SOL.
    if (d.mcapSol < 20 || d.mcapSol > 60) return;
    const t = {
      mint: d.mint, name: d.name || "", symbol: d.symbol || "?", creator: d.creator,
      createdAt: Date.now(), devBuySol: 0,
      buyers: new Set(), buys: 0, sells: 0, volSol: 0,
      price: d.price, startPrice: d.price, mcap: d.mcapSol,
      history: [d.price], position: null, status: "watch", lastTrade: Date.now(),
    };
    tokens.set(d.mint, t);
    state.launches++;
    onEvent({ type: "new", token: t });
    setTimeout(() => forget(t), RULES.watchSec * 1000);
  }

  function onTrade(d) {
    const t = tokens.get(d.mint);
    if (!t) return; // trade on a coin older than this session, ignore
    // A standard curve can't drop below ~28 SOL mcap (real SOL never goes
    // negative). If it does, this coin's numbers aren't SOL. Drop it.
    if (d.mcapSol < 15) { t.status = "odd"; t.position = null; tokens.delete(t.mint); return; }
    t.price = d.price;
    t.mcap = d.mcapSol;
    t.volSol += d.solAmount;
    t.lastTrade = Date.now();
    t.history.push(t.price);
    if (t.history.length > RULES.historyLen) t.history.shift();
    if (d.type === "buy") {
      // Creator's first buy is the "dev buy", usually in the create tx itself.
      if (t.buys === 0 && d.user === t.creator) t.devBuySol = d.solAmount;
      t.buys++;
      t.buyers.add(d.user);
    } else t.sells++;
    if (t.position) checkExit(t); else checkEntry(t);
  }

  function checkEntry(t) {
    if (t.status !== "watch") return; // one shot per coin, no revenge trading
    const age = (Date.now() - t.createdAt) / 1000;
    if (age > RULES.maxAgeSec) return;
    if (t.devBuySol > RULES.maxDevBuySol) return;
    if (t.buyers.size < RULES.minBuyers) return;
    if (t.buys <= t.sells) return;
    const solIn = RULES.stakeSol * (1 - RULES.feeRate);
    t.position = { entryPrice: t.price, tokens: solIn / t.price, openedAt: Date.now() };
    t.status = "hold";
    onEvent({ type: "buy", token: t, age });
  }

  function checkExit(t) {
    const p = t.position;
    const ratio = t.price / p.entryPrice;
    const held = (Date.now() - p.openedAt) / 1000;
    let reason = null;
    if (ratio >= RULES.takeProfit) reason = "TP";
    else if (ratio <= RULES.stopLoss) reason = "SL";
    else if (held >= RULES.maxHoldSec) reason = "TIME";
    if (!reason) return;
    const solOut = p.tokens * t.price * (1 - RULES.feeRate);
    const profit = solOut - RULES.stakeSol;
    state.pnl += profit;
    const trade = { symbol: t.symbol, mint: t.mint, reason, ratio, profit, heldSec: held, closedAt: Date.now() };
    trades.push(trade);
    t.position = null;
    t.status = profit >= 0 ? "won" : "lost";
    onEvent({ type: "sell", token: t, trade });
    setTimeout(() => forget(t), 60_000); // keep closed ones on screen a minute
  }

  function forget(t) {
    if (!tokens.has(t.mint) || t.position) return;
    tokens.delete(t.mint);
  }

  setInterval(() => { for (const t of tokens.values()) if (t.position) checkExit(t); }, 2000);

  return { state, feed };
}
