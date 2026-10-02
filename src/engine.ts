import type { LedgerEvent, PnlReport, RealizedExit } from "./model";

interface Lot {
  quantity: number;
  unitCostUsd: number | null;
}

function finitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be positive`);
}

function utcDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${timestamp}`);
  return date.toISOString().slice(0, 10);
}

export function calculatePnl(input: LedgerEvent[]): PnlReport {
  const events = [...input].sort((a, b) => {
    const time = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return time || a.id.localeCompare(b.id);
  });
  const seen = new Set<string>();
  const lots = new Map<string, Lot[]>();
  const exits: RealizedExit[] = [];
  const warnings = new Set<string>();

  for (const event of events) {
    if (seen.has(event.id)) throw new Error(`Duplicate event: ${event.id}`);
    seen.add(event.id);
    utcDate(event.timestamp);
    finitePositive(event.quantity, "quantity");
    if (event.subject.role !== "subject") continue;

    const inventory = lots.get(event.subject.id) ?? [];
    lots.set(event.subject.id, inventory);

    if (event.kind === "transfer") {
      if (event.direction === "in") {
        inventory.push({
          quantity: event.quantity,
          unitCostUsd: event.knownCostUsd === undefined ? null : event.knownCostUsd / event.quantity
        });
        if (event.knownCostUsd === undefined) warnings.add("Incoming transfers with unknown cost basis are not treated as free inventory");
      } else {
        consume(inventory, event.quantity);
      }
      continue;
    }

    if (!Number.isFinite(event.grossUsd) || event.grossUsd < 0) throw new Error("grossUsd must be non-negative");
    if (!Number.isFinite(event.feeUsd) || event.feeUsd < 0) throw new Error("feeUsd must be non-negative");
    if (event.side === "buy") {
      inventory.push({ quantity: event.quantity, unitCostUsd: (event.grossUsd + event.feeUsd) / event.quantity });
      continue;
    }

    const matched = consume(inventory, event.quantity);
    const proceedsUsd = event.grossUsd - event.feeUsd;
    const status = matched.missing > 0 ? "oversold" : matched.unknown > 0 ? "unknown-cost" : "verified";
    if (status === "oversold") warnings.add("Some exits exceed indexed inventory and cannot be classified");
    if (status === "unknown-cost") warnings.add("Some exits consume inventory with unknown cost basis");
    exits.push({
      eventId: event.id,
      date: utcDate(event.timestamp),
      assetId: event.subject.id,
      quantity: event.quantity,
      proceedsUsd,
      costUsd: status === "verified" ? matched.cost : null,
      feeUsd: event.feeUsd,
      pnlUsd: status === "verified" ? proceedsUsd - matched.cost : null,
      status
    });
  }

  const days = new Map<string, { pnl: number; exits: number; classified: number }>();
  for (const exit of exits) {
    const day = days.get(exit.date) ?? { pnl: 0, exits: 0, classified: 0 };
    day.exits += 1;
    if (exit.pnlUsd !== null) {
      day.pnl += exit.pnlUsd;
      day.classified += 1;
    }
    days.set(exit.date, day);
  }
  const soldQuantity = exits.reduce((sum, exit) => sum + exit.quantity, 0);
  const classifiedQuantity = exits.reduce((sum, exit) => sum + (exit.status === "verified" ? exit.quantity : 0), 0);

  return {
    exits,
    calendar: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({
      date,
      verifiedPnlUsd: day.pnl,
      exitCount: day.exits,
      classifiedExitCount: day.classified
    })),
    verifiedPnlUsd: exits.reduce((sum, exit) => sum + (exit.pnlUsd ?? 0), 0),
    coverage: {
      classifiedQuantity,
      soldQuantity,
      ratio: soldQuantity === 0 ? 1 : classifiedQuantity / soldQuantity
    },
    warnings: [...warnings]
  };
}

function consume(inventory: Lot[], requested: number): { cost: number; unknown: number; missing: number } {
  let remaining = requested;
  let cost = 0;
  let unknown = 0;
  while (remaining > 1e-12 && inventory.length > 0) {
    const lot = inventory[0];
    if (!lot) break;
    const used = Math.min(remaining, lot.quantity);
    if (lot.unitCostUsd === null) unknown += used;
    else cost += used * lot.unitCostUsd;
    lot.quantity -= used;
    remaining -= used;
    if (lot.quantity <= 1e-12) inventory.shift();
  }
  return { cost, unknown, missing: remaining };
}
