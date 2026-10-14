import { DEFAULT_TRADE_AMOUNT_USD, EXPIRATION_MS, RISK_REWARD_RATIO } from "./constants";
import { randomDirection } from "./randomize";
import sessions from "./sessions.json";
import type { OhlcvBar, SessionTrade } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(date: string): number {
  return Date.parse(date.replace(" ", "T") + "Z");
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

function hhmmToMs(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) * 60 * 1000;
}

/**
 * For every working day (Mon-Fri, UTC) in the data, opens one random position
 * (LONG/SHORT coin flip) at each session open and closes it EXPIRATION_MS later.
 * Entry = open of the 5-min bar at the session open; exit = open of the bar at
 * entry + EXPIRATION_MS. WIN if price moved with the position, R = +RR / -1.
 */
export function runExperiment(bars: OhlcvBar[]): SessionTrade[] {
  const byTime = new Map<number, OhlcvBar>();
  for (const b of bars) byTime.set(toMs(b.date), b);

  const firstMs = toMs(bars[0].date);
  const lastMs = toMs(bars[bars.length - 1].date);
  const firstDay = Math.floor(firstMs / DAY_MS) * DAY_MS;

  const trades: SessionTrade[] = [];
  for (let day = firstDay; day <= lastMs; day += DAY_MS) {
    const dow = new Date(day).getUTCDay();
    if (dow < 1 || dow > 5) continue; // Monday-Friday only

    for (const s of sessions) {
      const entryMs = day + hhmmToMs(s.openUTC);
      const exitMs = entryMs + EXPIRATION_MS;
      if (entryMs < firstMs || exitMs > lastMs) continue;

      const direction = randomDirection();
      const base = {
        session: s.name,
        abbrev: s.abbrev,
        day: new Date(day).toISOString().slice(0, 10),
        sessionOpenUTC: s.openUTC,
        direction,
        entryTime: fmt(entryMs),
        exitTime: fmt(exitMs),
      };

      const entryBar = byTime.get(entryMs);
      const exitBar = byTime.get(exitMs);
      if (!entryBar || !exitBar) {
        trades.push({ ...base, entry: null, exit: null, outcome: "NO DATA", r: 0, pnlPct: null, pnlUsd: null });
        continue;
      }

      const entry = entryBar.open;
      const exit = exitBar.open;
      const diff = direction === "LONG" ? exit - entry : entry - exit;
      const outcome = diff > 0 ? "WIN" : diff < 0 ? "LOSS" : "FLAT";
      const r = outcome === "WIN" ? RISK_REWARD_RATIO : outcome === "LOSS" ? -1 : 0;
      const pnlPct = diff / entry;
      const pnlUsd = DEFAULT_TRADE_AMOUNT_USD * pnlPct;
      trades.push({ ...base, entry, exit, outcome, r, pnlPct, pnlUsd });
    }
  }
  return trades;
}

export interface WeekRow {
  label: string;
  weekStart: string;
  /** weekday (1 = Mon .. 5 = Fri) -> session trades, chronological */
  days: Record<number, SessionTrade[]>;
}

/** Groups trades into ISO weeks (Monday start) labelled Week 1..N, like the sketch. */
export function groupIntoWeeks(trades: SessionTrade[]): WeekRow[] {
  const map = new Map<string, WeekRow>();
  for (const t of trades) {
    const d = new Date(t.day + "T00:00:00Z");
    const dow = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    let row = map.get(key);
    if (!row) {
      row = { label: "", weekStart: key, days: {} };
      map.set(key, row);
    }
    (row.days[dow] ||= []).push(t);
  }
  return [...map.values()]
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .map((w, i) => ({ ...w, label: `Week ${i + 1}` }));
}
