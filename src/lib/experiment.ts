import {
  BAR_INTERVAL_MS,
  DEFAULT_EXPERIMENT_PARAMS,
  DEFAULT_TRADE_AMOUNT_USD,
  POSITION_SIZE_USD,
  STOP_LOSS_PCT,
  type ExperimentParams,
} from "./constants";
import { randomDirection, type DirectionPlan } from "./randomize";
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
 * (LONG/SHORT coin flip) at each session open: a POSITION_SIZE_USD ($500)
 * position risking DEFAULT_TRADE_AMOUNT_USD ($5). Entry = open of the 5-min
 * bar at the session open.
 *
 * PnL (USD) = POSITION_SIZE_USD x signed price change between open and close,
 * so a +0.1008% move is +$0.50 on a long (-$0.50 on a short) = 10.08% of the
 * $5 risk. Price levels derived from the sizing (STOP_LOSS_PCT = 5 / 500 = 1%):
 *   stop   = entry -/+ entry * STOP_LOSS_PCT                      (loses 1 x risk)
 *   target = entry +/- entry * STOP_LOSS_PCT * riskRewardRatio    (wins RR x risk)
 *
 * A trade is closed by exactly one of three scenarios, checked bar by bar:
 *   1. TP     - a bar's range reaches the target      -> +RR R, +risk x RR USD
 *   2. SL     - a bar's range reaches the stop        -> -1 R,  -risk USD
 *   3. EXPIRY - neither level is reached within T     -> closed at the open of
 *               the bar at entry + T; PnL = position x price change, R = PnL / risk.
 * If a single bar touches both levels, the stop is assumed to be hit first
 * (conservative convention, since intrabar order is unknown).
 *
 * `params` holds the independent variables of the run: expiration time (T)
 * and risk-to-reward ratio (RR, 2 = 1:2).
 *
 * `getDirection` (optional) resolves the direction for a "day|session" slot.
 * Pass the same plan (see createDirectionPlan) for several markets so the
 * same slot gets the same random direction on every market; when omitted,
 * each slot gets an independent coin flip.
 */
export function runExperiment(
  bars: OhlcvBar[],
  getDirection: DirectionPlan = () => randomDirection(),
  params: ExperimentParams = DEFAULT_EXPERIMENT_PARAMS
): SessionTrade[] {
  const { expirationMs, riskRewardRatio } = params;
  const riskUsd = DEFAULT_TRADE_AMOUNT_USD;
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
      const expiryMs = entryMs + expirationMs;
      if (entryMs < firstMs || expiryMs > lastMs) continue;

      const dayIso = new Date(day).toISOString().slice(0, 10);
      const direction = getDirection(`${dayIso}|${s.abbrev}`);
      const base = {
        session: s.name,
        abbrev: s.abbrev,
        day: dayIso,
        sessionOpenUTC: s.openUTC,
        direction,
        entryTime: fmt(entryMs),
        expiryTime: fmt(expiryMs),
      };
      const noData: SessionTrade = {
        ...base,
        exitTime: fmt(expiryMs),
        entry: null,
        stop: null,
        target: null,
        exit: null,
        closeReason: "NO DATA",
        outcome: "NO DATA",
        r: 0,
        pnlPct: null,
        pnlUsd: null,
      };

      const entryBar = byTime.get(entryMs);
      if (!entryBar) {
        trades.push(noData);
        continue;
      }

      const entry = entryBar.open;
      const sign = direction === "LONG" ? 1 : -1;
      const stopDist = entry * STOP_LOSS_PCT;
      const stop = entry - sign * stopDist;
      const target = entry + sign * stopDist * riskRewardRatio;
      const levels = { entry, stop, target };

      // Scenario 1 / 2: scan every bar inside the hold window for a TP or SL hit.
      let closed: SessionTrade | null = null;
      for (let t = entryMs; t < expiryMs && !closed; t += BAR_INTERVAL_MS) {
        const bar = byTime.get(t);
        if (!bar) continue;
        const hitStop = direction === "LONG" ? bar.low <= stop : bar.high >= stop;
        const hitTarget = direction === "LONG" ? bar.high >= target : bar.low <= target;
        if (hitStop) {
          closed = {
            ...base,
            ...levels,
            exitTime: fmt(t),
            exit: stop,
            closeReason: "SL",
            outcome: "LOSS",
            r: -1,
            pnlPct: -STOP_LOSS_PCT,
            pnlUsd: -riskUsd,
          };
        } else if (hitTarget) {
          closed = {
            ...base,
            ...levels,
            exitTime: fmt(t),
            exit: target,
            closeReason: "TP",
            outcome: "WIN",
            r: riskRewardRatio,
            pnlPct: STOP_LOSS_PCT * riskRewardRatio,
            pnlUsd: riskUsd * riskRewardRatio,
          };
        }
      }
      if (closed) {
        trades.push(closed);
        continue;
      }

      // Scenario 3: expiry - close at the open of the bar at entry + T.
      const expiryBar = byTime.get(expiryMs);
      if (!expiryBar) {
        trades.push({ ...noData, ...levels });
        continue;
      }
      const exit = expiryBar.open;
      const diff = sign * (exit - entry);
      const pnlPct = diff / entry; // signed price change open -> close
      const pnlUsd = POSITION_SIZE_USD * pnlPct;
      const r = pnlUsd / riskUsd; // fraction of the $5 risk won/lost
      trades.push({
        ...base,
        ...levels,
        exitTime: fmt(expiryMs),
        exit,
        closeReason: "EXPIRY",
        outcome: diff > 0 ? "WIN" : diff < 0 ? "LOSS" : "FLAT",
        r,
        pnlPct,
        pnlUsd,
      });
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
