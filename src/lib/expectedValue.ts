import sessions from "./sessions.json";
import type { SessionTrade } from "./types";

/** One value of the discrete random variable X (trade PnL in USD) and how often it occurred. */
export interface Outcome {
  /** PnL in USD, rounded to the cent so equal results group together. */
  value: number;
  /** Frequency f_i: how many trades produced this value. */
  count: number;
  /** Probability P(X = x_i) = f_i / n. */
  p: number;
}

/** Expected value of a cell (one weekday x one session), or of any set of trades. */
export interface EvCell {
  /** Number of trades with a PnL result (NO DATA trades are excluded). */
  n: number;
  /** E[X] = sum over i of x_i * P(x_i); 0 when n = 0. */
  ev: number;
  /** The distribution behind ev, most frequent first. */
  outcomes: Outcome[];
}

/**
 * Expected value of the discrete random variable X = trade PnL (USD):
 *   E[X] = Σ x_i · P(x_i),  P(x_i) = f_i / n
 * where x_i are the distinct PnL values observed in `trades`, f_i their
 * frequencies and n the number of trades with a result.
 */
export function expectedValue(trades: SessionTrade[]): EvCell {
  const freq = new Map<number, number>();
  let n = 0;
  for (const t of trades) {
    if (t.pnlUsd === null) continue;
    const x = Math.round(t.pnlUsd * 100) / 100;
    freq.set(x, (freq.get(x) ?? 0) + 1);
    n++;
  }
  if (n === 0) return { n: 0, ev: 0, outcomes: [] };
  const outcomes: Outcome[] = [...freq.entries()]
    .map(([value, count]) => ({ value, count, p: count / n }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const ev = outcomes.reduce((acc, o) => acc + o.value * o.p, 0);
  return { n, ev, outcomes };
}

export const EV_WEEKDAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
];

/** Session columns in UTC opening-time order (Tokyo, London, New York, Sydney). */
export const EV_SESSIONS = sessions.map((s) => ({ name: s.name, abbrev: s.abbrev, openUTC: s.openUTC }));

export interface EvRow {
  dow: number;
  label: string;
  /** session abbrev -> cell */
  cells: Record<string, EvCell>;
  /** all sessions of this weekday combined */
  all: EvCell;
}

export interface EvTable {
  rows: EvRow[];
  /** session abbrev -> all weekdays combined */
  allDays: Record<string, EvCell>;
  /** every trade in the run for this market */
  total: EvCell;
}

function weekday(t: SessionTrade): number {
  return new Date(t.day + "T00:00:00Z").getUTCDay();
}

/** Builds the weekday x session expected-value table for one market's trades. */
export function buildEvTable(trades: SessionTrade[]): EvTable {
  const rows = EV_WEEKDAYS.map((d) => {
    const dayTrades = trades.filter((t) => weekday(t) === d.dow);
    const cells: Record<string, EvCell> = {};
    for (const s of EV_SESSIONS) {
      cells[s.abbrev] = expectedValue(dayTrades.filter((t) => t.abbrev === s.abbrev));
    }
    return { dow: d.dow, label: d.label, cells, all: expectedValue(dayTrades) };
  });
  const allDays: Record<string, EvCell> = {};
  for (const s of EV_SESSIONS) {
    allDays[s.abbrev] = expectedValue(trades.filter((t) => t.abbrev === s.abbrev));
  }
  return { rows, allDays, total: expectedValue(trades) };
}
