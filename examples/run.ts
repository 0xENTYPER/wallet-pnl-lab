import { calculatePnl, type Asset, type LedgerEvent } from "../src/index";

const meme: Asset = { id: "base:0xexample", symbol: "MEME", role: "subject" };
const wrappedEth: Asset = { id: "base:weth", symbol: "WETH", role: "quote" };
const events: LedgerEvent[] = [
  { id: "buy-1", timestamp: "2026-09-01T09:00:00Z", kind: "trade", subject: meme, side: "buy", quantity: 1000, grossUsd: 500, feeUsd: 2 },
  { id: "quote-leg", timestamp: "2026-09-01T09:00:00Z", kind: "transfer", subject: wrappedEth, direction: "out", quantity: 0.2 },
  { id: "sell-1", timestamp: "2026-09-03T18:30:00Z", kind: "trade", subject: meme, side: "sell", quantity: 400, grossUsd: 360, feeUsd: 3 }
];

console.log(JSON.stringify(calculatePnl(events), null, 2));
