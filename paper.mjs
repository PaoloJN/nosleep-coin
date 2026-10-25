// Plain-log version of the paper trader. Run: node paper.mjs
// Same engine as dash.mjs, just prints lines. Good for leaving in a tmux
// pane overnight and reading paper-trades.json in the morning.

import fs from "node:fs";
import { createEngine } from "./engine.mjs";

const { state } = createEngine({
  onEvent: (e) => {
    const ts = new Date().toTimeString().slice(0, 8);
    if (e.type === "new")
      console.log(`${ts} NEW  ${e.token.symbol.padEnd(8)} dev ${e.token.devBuySol.toFixed(2)} SOL  mcap ${e.token.mcap.toFixed(1)} SOL`);
    else if (e.type === "buy")
      console.log(`${ts} BUY  ${e.token.symbol.padEnd(8)} @ mcap ${e.token.mcap.toFixed(1)} SOL  buyers ${e.token.buyers.size}  age ${e.age.toFixed(0)}s`);
    else if (e.type === "sell") {
      const { reason, ratio, profit } = e.trade;
      console.log(`${ts} SELL ${e.token.symbol.padEnd(8)} ${reason.padEnd(4)} ${ratio.toFixed(2)}x  ${profit >= 0 ? "+" : ""}${profit.toFixed(4)} SOL  | total ${state.pnl >= 0 ? "+" : ""}${state.pnl.toFixed(4)} over ${state.trades.length}`);
      fs.writeFileSync("paper-trades.json", JSON.stringify(state.trades, null, 2));
    } else console.log(`${ts} ${e.text}`);
  },
});

process.on("SIGINT", () => {
  console.log(`\nclosed ${state.trades.length} trades, P&L ${state.pnl.toFixed(4)} SOL`);
  process.exit(0);
});
