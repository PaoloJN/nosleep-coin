// Terminal dashboard for the pump.fun paper trader. Run: node dash.mjs
// No TUI library: we redraw the whole screen with ANSI escape codes 10x/sec.
// Each escape is just a string the terminal interprets, like inline CSS.
// Press q to quit.

import { createEngine, RULES } from "./engine.mjs";

const ESC = "\x1b[";
const c = {
  reset: ESC + "0m", bold: ESC + "1m", dim: ESC + "2m",
  red: ESC + "31m", green: ESC + "32m", yellow: ESC + "33m",
  blue: ESC + "34m", magenta: ESC + "35m", cyan: ESC + "36m", gray: ESC + "90m",
  bgGreen: ESC + "42m", bgRed: ESC + "41m",
  altOn: ESC + "?1049h", altOff: ESC + "?1049l",       // alternate screen buffer
  hideCur: ESC + "?25l", showCur: ESC + "?25h",
  home: ESC + "H", clear: ESC + "2J",
};
const paint = (color, s) => color + s + c.reset;

// ---- live firehose stats (every pump.fun trade, not just new coins) -----
const tape = [];                 // last N trades for the scrolling ticker
const perSec = new Array(60).fill(0); // events per second, ring buffer
const volPerSec = new Array(60).fill(0);
let secIdx = 0, lastSec = Math.floor(Date.now() / 1000);
let biggest = { sol: 0, symbol: "", type: "buy", at: 0 };
const symbols = new Map(); // mint -> symbol, so the tape can name old coins
let tapeOffset = 0;

function tick() {
  const now = Math.floor(Date.now() / 1000);
  while (lastSec < now) { lastSec++; secIdx = (secIdx + 1) % 60; perSec[secIdx] = 0; volPerSec[secIdx] = 0; }
}
function onRaw(e) {
  tick();
  perSec[secIdx]++;
  if (e.type === "create") { symbols.set(e.mint, e.symbol); return; }
  volPerSec[secIdx] += e.solAmount;
  const sym = symbols.get(e.mint) || e.mint.slice(0, 4) + "…";
  tape.push({ type: e.type, sol: e.solAmount, sym });
  if (tape.length > 400) tape.shift();
  if (e.solAmount > biggest.sol || Date.now() - biggest.at > 60_000)
    biggest = { sol: e.solAmount, symbol: sym, type: e.type, at: Date.now() };
}

// ---- engine events -> log -------------------------------------------------
const log = [];
const { state } = createEngine({
  onRaw,
  onEvent: (e) => {
    const ts = new Date().toTimeString().slice(0, 8);
    let line;
    if (e.type === "new")
      line = `${paint(c.cyan, "NEW ")} ${pad(e.token.symbol, 10)} ${paint(c.gray, e.token.name.slice(0, 32))}`;
    else if (e.type === "buy")
      line = `${paint(c.yellow + c.bold, "BUY ")} ${pad(e.token.symbol, 10)} @ ${e.token.mcap.toFixed(1)} SOL mcap  buyers ${e.token.buyers.size}  dev ${e.token.devBuySol.toFixed(2)}  age ${e.age.toFixed(0)}s`;
    else if (e.type === "sell") {
      const col = e.trade.profit >= 0 ? c.green : c.red;
      line = `${paint(col + c.bold, "SELL")} ${pad(e.token.symbol, 10)} ${e.trade.reason.padEnd(4)} ${e.trade.ratio.toFixed(2)}x  ${paint(col, signed(e.trade.profit, 4) + " SOL")}  held ${Math.round(e.trade.heldSec)}s`;
    } else line = paint(c.gray, e.text);
    log.push(`${paint(c.gray, ts)}  ${line}`);
    if (log.length > 200) log.shift();
  },
});

// ---- helpers -------------------------------------------------------------
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const rpad = (s, n) => String(s).slice(0, n).padStart(n);
const signed = (x, d) => (x >= 0 ? "+" : "") + x.toFixed(d);
const fmtAge = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const BARS = "▁▂▃▄▅▆▇█";
function spark(hist, width, color = c.cyan) {
  const h = hist.slice(-width);
  const lo = Math.min(...h), hi = Math.max(...h);
  return paint(color, h.map((v) => BARS[hi === lo ? 0 : Math.round(((v - lo) / (hi - lo)) * 7)]).join("").padEnd(width));
}
function ring(arr, n) { // last n seconds, oldest first, excluding current partial second
  const out = [];
  for (let i = n; i >= 1; i--) out.push(arr[(secIdx - i + 120) % 60]);
  return out;
}
function pct(x) {
  const p = (x - 1) * 100;
  const s = (Math.abs(p) >= 1000 ? signed(p / 1000, 1) + "k" : signed(p, 0)) + "%";
  return paint(p > 0 ? c.green : p < 0 ? c.red : c.gray, rpad(s, 6));
}
const PULSE = ["◐", "◓", "◑", "◒"];

// ---- render --------------------------------------------------------------
let frame = 0;
function render() {
  tick();
  frame++;
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;
  const out = [];
  const rule = paint(c.gray, "─".repeat(cols));

  // 1. tape: scrolls one cell per frame, newest trades enter from the right
  tapeOffset = (tapeOffset + 1) % 4;
  const cells = tape.slice(-60).map((t) => {
    const col = t.type === "buy" ? c.green : c.red;
    const arrow = t.type === "buy" ? "▲" : "▼";
    const big = t.sol >= 1 ? c.bold : t.sol < 0.05 ? c.dim : "";
    return paint(col + big, `${arrow}${t.sol.toFixed(t.sol >= 1 ? 1 : 2)} ${t.sym}`);
  });
  const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  let line = "", len = 0;
  for (let i = cells.length - 1; i >= 0 && len < cols + 20; i--) { line = cells[i] + "  " + line; len += plain(cells[i]).length + 2; }
  // shift by offset so it visibly crawls between arrivals
  out.push(" " + paint(c.gray, "·".repeat(tapeOffset)) + line.slice(0, cols * 6));

  // 2. header
  const open = [...state.tokens.values()].filter((t) => t.position).length;
  const won = state.trades.filter((t) => t.profit >= 0).length;
  const pnlCol = state.pnl >= 0 ? c.green : c.red;
  const eps = ring(perSec, 5).reduce((a, b) => a + b, 0) / 5;
  const volMin = ring(volPerSec, 60).reduce((a, b) => a + b, 0);
  const pulse = paint(state.connected ? c.green : c.red, PULSE[Math.floor(frame / 2) % 4]);
  out.push(rule);
  out.push(
    ` ${pulse} ${paint(c.bold + c.magenta, "PUMP.FUN")} ${paint(c.gray, "paper")}  up ${fmtAge(Date.now() - state.startedAt)}` +
    `  ${paint(c.bold, eps.toFixed(0))} ${paint(c.gray, "tx/s")} ${spark(ring(perSec, 30), 30, c.blue)}` +
    `  ${paint(c.bold, volMin.toFixed(1))} ${paint(c.gray, "SOL/min")}` +
    `  big ${paint(biggest.type === "buy" ? c.green : c.red, `${biggest.type === "buy" ? "▲" : "▼"}${biggest.sol.toFixed(2)} ${biggest.symbol}`)}`
  );
  out.push(
    `   launches ${paint(c.bold, state.launches)}  open ${paint(c.yellow, open)}` +
    `  closed ${state.trades.length} ${paint(c.gray, `(${won}W/${state.trades.length - won}L)`)}` +
    `  P&L ${paint(pnlCol + c.bold, signed(state.pnl, 4) + " SOL")}` +
    `  ${paint(c.gray, `stake ${RULES.stakeSol}  tp ${RULES.takeProfit}x  sl ${RULES.stopLoss}x  hold ${RULES.maxHoldSec}s  q to quit`)}`
  );
  out.push(rule);

  // 3. table
  const sparkW = Math.max(10, Math.min(30, cols - 78));
  out.push(paint(c.bold + c.gray,
    ` ${pad("SYM", 10)} ${rpad("AGE", 5)} ${rpad("MCAP", 7)} ${rpad("Δ", 6)} ${rpad("BUYRS", 5)} ${rpad("B/S", 7)} ${rpad("DEV", 5)} ${rpad("VOL", 6)}  ${pad("PRICE", sparkW)}  STATUS`));
  const logRows = Math.max(5, Math.floor(rows * 0.28));
  const tableRows = rows - 6 - 2 - logRows;
  const list = [...state.tokens.values()]
    .sort((a, b) => (b.position ? 1 : 0) - (a.position ? 1 : 0) || b.createdAt - a.createdAt)
    .slice(0, tableRows);

  for (const t of list) {
    let status, rowCol = "";
    const fresh = Date.now() - t.lastTrade < 600; // flash rows that just traded
    if (t.position) {
      const r = t.price / t.position.entryPrice;
      status = paint((r >= 1 ? c.green : c.red) + c.bold, `HOLD ${r.toFixed(2)}x`) + paint(c.gray, ` ${fmtAge(Date.now() - t.position.openedAt)}`);
      rowCol = c.bold;
    } else if (t.status === "won") status = paint(c.green, "WON");
    else if (t.status === "lost") status = paint(c.red, "LOST");
    else if (Date.now() - t.lastTrade > 60_000) { status = paint(c.gray, "dead"); rowCol = c.dim; }
    else status = paint(c.gray, "watch");
    const sym = fresh ? paint(c.bold + c.yellow, pad(t.symbol, 10)) : pad(t.symbol, 10);
    out.push(
      rowCol + ` ${sym} ${rpad(fmtAge(Date.now() - t.createdAt), 5)} ${rpad(t.mcap.toFixed(1), 7)} ` +
      pct(t.price / t.startPrice) + ` ${rpad(t.buyers.size, 5)} ${rpad(`${t.buys}/${t.sells}`, 7)} ` +
      `${rpad(t.devBuySol.toFixed(2), 5)} ${rpad(t.volSol.toFixed(2), 6)}  ` +
      spark(t.history, sparkW) + c.reset + `  ${status}`
    );
  }
  for (let i = list.length; i < tableRows; i++) out.push("");

  // 4. log
  out.push(rule);
  for (const l of log.slice(-logRows)) out.push(" " + l);

  process.stdout.write(c.home + c.clear + out.slice(0, rows).join("\n"));
}

// ---- lifecycle -----------------------------------------------------------
process.stdout.write(c.altOn + c.hideCur);
const timer = setInterval(render, 100);
render();
const quit = () => {
  clearInterval(timer);
  process.stdout.write(c.showCur + c.altOff);
  console.log(`closed ${state.trades.length} trades, P&L ${signed(state.pnl, 4)} SOL`);
  process.exit(0);
};
process.on("SIGINT", quit);
process.on("SIGTERM", quit);
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on("data", (k) => { if (k.toString() === "q" || k[0] === 3) quit(); });
