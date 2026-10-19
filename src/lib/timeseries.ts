import { buildEvTable } from "./expectedValue";
import type { SessionTrade } from "./types";

/** One x position (UTC ms) with the cumulative value of every market at that time. */
export type SeriesPoint = { t: number } & Record<string, number>;

function toMs(date: string): number {
  return Date.parse(date.replace(" ", "T") + "Z");
}

/**
 * Builds cumulative lines for several markets on a shared time axis.
 * `valueOf` gives each trade's contribution (null = skip). A trade's value is
 * booked at its close time. Every market starts at 0 and carries its last
 * cumulative value forward, so all lines are defined at every timestamp.
 */
export function buildCumulativeSeries(
  results: Record<string, SessionTrade[]>,
  valueOf: (trade: SessionTrade, pair: string) => number | null
): SeriesPoint[] {
  const pairs = Object.keys(results);
  const events = new Map<string, Array<{ t: number; cum: number }>>();
  const times = new Set<number>();
  for (const pair of pairs) {
    const list: Array<{ t: number; cum: number }> = [];
    let cum = 0;
    const sorted = [...results[pair]].sort((a, b) => toMs(a.exitTime) - toMs(b.exitTime));
    for (const trade of sorted) {
      const v = valueOf(trade, pair);
      if (v === null) continue;
      cum += v;
      const t = toMs(trade.exitTime);
      list.push({ t, cum });
      times.add(t);
    }
    events.set(pair, list);
  }
  const axis = [...times].sort((a, b) => a - b);
  const cursor: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (const pair of pairs) {
    cursor[pair] = 0;
    last[pair] = 0;
  }
  return axis.map((t) => {
    const point = { t } as SeriesPoint;
    for (const pair of pairs) {
      const list = events.get(pair)!;
      while (cursor[pair] < list.length && list[cursor[pair]].t <= t) {
        last[pair] = list[cursor[pair]].cum;
        cursor[pair]++;
      }
      point[pair] = last[pair];
    }
    return point;
  });
}

/** Graph 1: cumulative realised PnL (USD) per market over the data period. */
export function cumulativePnlSeries(results: Record<string, SessionTrade[]>): SeriesPoint[] {
  return buildCumulativeSeries(results, (t) => t.pnlUsd);
}

/**
 * Graph 2: cumulative expected value (USD) per market over the data period.
 * Each trade contributes the expected value E[X] = Σ x·P(x) of its
 * weekday x session cell (the Expected value table), so the line is the
 * "expected" PnL path; it ends where the realised PnL line ends.
 */
export function cumulativeEvSeries(results: Record<string, SessionTrade[]>): SeriesPoint[] {
  const cellEv: Record<string, Map<string, number>> = {};
  for (const [pair, trades] of Object.entries(results)) {
    const table = buildEvTable(trades);
    const map = new Map<string, number>();
    for (const row of table.rows) {
      for (const [abbrev, cell] of Object.entries(row.cells)) map.set(`${row.dow}|${abbrev}`, cell.ev);
    }
    cellEv[pair] = map;
  }
  return buildCumulativeSeries(results, (t, pair) => {
    if (t.pnlUsd === null) return null;
    const dow = new Date(t.day + "T00:00:00Z").getUTCDay();
    return cellEv[pair].get(`${dow}|${t.abbrev}`) ?? null;
  });
}
