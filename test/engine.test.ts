import { describe, expect, it } from "vitest";
import { calculatePnl, type Asset, type LedgerEvent, type TradeEvent } from "../src/index";

const token: Asset = { id: "base:token", symbol: "TOKEN", role: "subject" };
const quote: Asset = { id: "base:weth", symbol: "WETH", role: "quote" };
const buy = (id: string, quantity: number, grossUsd: number, timestamp = "2026-09-01T10:00:00Z"): TradeEvent =>
  ({ id, timestamp, kind: "trade", subject: token, side: "buy", quantity, grossUsd, feeUsd: 0 });
const sell = (id: string, quantity: number, grossUsd: number, timestamp = "2026-09-02T10:00:00Z"): TradeEvent =>
  ({ id, timestamp, kind: "trade", subject: token, side: "sell", quantity, grossUsd, feeUsd: 0 });

describe("calculatePnl", () => {
  it("matches FIFO lots", () => {
    const report = calculatePnl([buy("a", 10, 100), buy("b", 10, 200), sell("c", 15, 300)]);
    expect(report.exits[0]?.costUsd).toBe(200);
    expect(report.verifiedPnlUsd).toBe(100);
  });

  it("includes buy and sell fees once", () => {
    const report = calculatePnl([
      { ...buy("a", 10, 100), feeUsd: 2 },
      { ...sell("b", 10, 150), feeUsd: 3 }
    ]);
    expect(report.verifiedPnlUsd).toBe(45);
  });

  it("does not assign zero cost to an incoming transfer", () => {
    const report = calculatePnl([
      { id: "in", timestamp: "2026-09-01T00:00:00Z", kind: "transfer", subject: token, direction: "in", quantity: 10 },
      sell("out", 10, 500)
    ]);
    expect(report.exits[0]?.status).toBe("unknown-cost");
    expect(report.exits[0]?.pnlUsd).toBeNull();
    expect(report.coverage.ratio).toBe(0);
  });

  it("accepts transferred inventory when provenance supplies cost", () => {
    const report = calculatePnl([
      { id: "in", timestamp: "2026-09-01T00:00:00Z", kind: "transfer", subject: token, direction: "in", quantity: 10, knownCostUsd: 250 },
      sell("out", 10, 500)
    ]);
    expect(report.verifiedPnlUsd).toBe(250);
  });

  it("marks sales beyond indexed inventory as oversold", () => {
    const report = calculatePnl([buy("a", 5, 50), sell("b", 10, 200)]);
    expect(report.exits[0]?.status).toBe("oversold");
    expect(report.verifiedPnlUsd).toBe(0);
  });

  it("ignores quote assets as PnL subjects", () => {
    const report = calculatePnl([
      { id: "weth", timestamp: "2026-09-01T00:00:00Z", kind: "transfer", subject: quote, direction: "in", quantity: 1 }
    ]);
    expect(report.exits).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it("aggregates verified exits by UTC date", () => {
    const report = calculatePnl([
      buy("a", 20, 200),
      sell("b", 5, 100, "2026-09-02T23:30:00-02:00"),
      sell("c", 5, 80, "2026-09-03T18:00:00Z")
    ]);
    expect(report.calendar).toEqual([{ date: "2026-09-03", verifiedPnlUsd: 80, exitCount: 2, classifiedExitCount: 2 }]);
  });

  it("sorts out-of-order events deterministically", () => {
    const report = calculatePnl([sell("z", 10, 150), buy("a", 10, 100)]);
    expect(report.verifiedPnlUsd).toBe(50);
  });

  it("rejects duplicate event identifiers", () => {
    expect(() => calculatePnl([buy("same", 1, 1), buy("same", 1, 1)])).toThrow("Duplicate event");
  });
});
