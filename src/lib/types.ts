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

export interface SessionTrade {
  session: string;
  abbrev: string;
  /** UTC weekday the position was opened, "YYYY-MM-DD" */
  day: string;
  sessionOpenUTC: string;
  direction: Direction;
  entryTime: string;
  exitTime: string;
  entry: number | null;
  exit: number | null;
  outcome: Outcome;
  /** Result in risk units: +RISK_REWARD_RATIO on win, -1 on loss, 0 otherwise. */
  r: number;
  /** Direction-adjusted return over the hold as a fraction of entry (0.005 = +0.5%). */
  pnlPct: number | null;
  /** Realized PnL in USD for DEFAULT_TRADE_AMOUNT_USD at entry. */
  pnlUsd: number | null;
}
