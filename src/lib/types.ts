import type { ExperimentParams } from "./constants";
import type { Direction } from "./randomize";

export interface OhlcvBar {
  /** "YYYY-MM-DD HH:mm:ss" in UTC */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Outcome = "WIN" | "LOSS" | "FLAT" | "NO DATA";

/**
 * Why the position was closed:
 *  - TP: price reached the take-profit target (risk x riskRewardRatio)
 *  - SL: price reached the stop-loss (1 x risk)
 *  - EXPIRY: neither level was reached within T, closed at the expiry bar open
 *  - NO DATA: no market data for the entry / expiry bar
 */
export type CloseReason = "TP" | "SL" | "EXPIRY" | "NO DATA";

export interface SessionTrade {
  session: string;
  abbrev: string;
  /** UTC weekday the position was opened, "YYYY-MM-DD" */
  day: string;
  sessionOpenUTC: string;
  direction: Direction;
  entryTime: string;
  /** Scheduled expiry time (entry + T). */
  expiryTime: string;
  /** Actual close time: the bar in which TP/SL was hit, or the expiry bar. */
  exitTime: string;
  entry: number | null;
  /** Stop-loss price level (1 x risk away from entry). */
  stop: number | null;
  /** Take-profit price level (riskRewardRatio x risk away from entry). */
  target: number | null;
  exit: number | null;
  closeReason: CloseReason;
  outcome: Outcome;
  /**
   * Result in risk units: exactly +riskRewardRatio on a TP hit, exactly -1 on an
   * SL hit, and the fractional distance travelled (between -1 and +RR) on expiry.
   */
  r: number;
  /**
   * Direction-adjusted price change between open and close as a fraction of
   * entry (0.001008 = +0.1008%). Positive = price moved with the position.
   */
  pnlPct: number | null;
  /**
   * Realized PnL in USD = POSITION_SIZE_USD x pnlPct (+0.1008% on $500 = +$0.50).
   * Exactly -DEFAULT_TRADE_AMOUNT_USD on an SL hit, +DEFAULT_TRADE_AMOUNT_USD x RR on a TP hit.
   */
  pnlUsd: number | null;
}

/** One completed experiment run: the independent variables it used and its per-market results. */
export interface RunRecord {
  id: number;
  params: ExperimentParams;
  /** Trades keyed by pair short name ("BTC", "ETH", "SOL"). */
  results: Record<string, SessionTrade[]>;
  /** Human-readable list of independent variables that changed vs. the previous run. */
  changes: string[];
}

/** Request (from the results table) to show a specific trade on the chart. */
export interface TradeFocusRequest {
  pairShort: string;
  trade: SessionTrade;
  /** Increments on every request so clicking the same trade twice still re-focuses. */
  nonce: number;
}
