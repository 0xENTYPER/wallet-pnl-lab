export type AssetRole = "subject" | "quote" | "ignored";

export interface Asset {
  id: string;
  symbol: string;
  role: AssetRole;
}

export interface TradeEvent {
  id: string;
  timestamp: string;
  kind: "trade";
  subject: Asset;
  side: "buy" | "sell";
  quantity: number;
  grossUsd: number;
  feeUsd: number;
}

export interface TransferEvent {
  id: string;
  timestamp: string;
  kind: "transfer";
  subject: Asset;
  direction: "in" | "out";
  quantity: number;
  knownCostUsd?: number;
}

export type LedgerEvent = TradeEvent | TransferEvent;

export interface RealizedExit {
  eventId: string;
  date: string;
  assetId: string;
  quantity: number;
  proceedsUsd: number;
  costUsd: number | null;
  feeUsd: number;
  pnlUsd: number | null;
  status: "verified" | "unknown-cost" | "oversold";
}

export interface DailyPnl {
  date: string;
  verifiedPnlUsd: number;
  exitCount: number;
  classifiedExitCount: number;
}

export interface PnlReport {
  exits: RealizedExit[];
  calendar: DailyPnl[];
  verifiedPnlUsd: number;
  coverage: {
    classifiedQuantity: number;
    soldQuantity: number;
    ratio: number;
  };
  warnings: string[];
}
