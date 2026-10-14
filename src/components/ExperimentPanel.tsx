"use client";

import { useState } from "react";
import { groupIntoWeeks, runExperiment } from "@/lib/experiment";
import { DEFAULT_TRADE_AMOUNT_USD, RISK_REWARD_RATIO } from "@/lib/constants";
import sessions from "@/lib/sessions.json";
import type { OhlcvBar, SessionTrade } from "@/lib/types";

const WEEKDAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
];

function fmtUsd(v: number): string {
  return `${v < 0 ? "-" : "+"}$${Math.abs(v).toFixed(2)}`;
}

function fmtPct(v: number): string {
  return `${v < 0 ? "-" : "+"}${(Math.abs(v) * 100).toFixed(2)}%`;
}

function TradeChip({ trade }: { trade: SessionTrade }) {
  const cls =
    trade.outcome === "WIN"
      ? "win"
      : trade.outcome === "LOSS"
        ? "loss"
        : trade.outcome === "FLAT"
          ? "flat"
          : "nodata";
  const mark = trade.outcome === "WIN" ? "W" : trade.outcome === "LOSS" ? "L" : "·";
  const arrow = trade.direction === "LONG" ? "↑" : "↓";
  const hasPnl = trade.pnlUsd !== null && trade.pnlPct !== null;
  const title =
    trade.entry !== null && trade.exit !== null
      ? `${trade.session} open ${trade.entryTime} UTC\n${trade.direction} @ ${trade.entry.toLocaleString()} → ${trade.exit.toLocaleString()}\n${trade.outcome} (${trade.r > 0 ? "+" : ""}${trade.r}R) · PnL ${hasPnl ? `${fmtUsd(trade.pnlUsd!)} (${fmtPct(trade.pnlPct!)})` : "–"}`
      : `${trade.session} open ${trade.entryTime} UTC\nNo market data`;
  return (
    <span className={`chip ${cls}`} title={title}>
      {trade.abbrev} {arrow}
      {mark}
      {hasPnl && (
        <span className="chip-pnl">
          {fmtUsd(trade.pnlUsd!)} · {fmtPct(trade.pnlPct!)}
        </span>
      )}
    </span>
  );
}

export default function ExperimentPanel() {
  const [trades, setTrades] = useState<SessionTrade[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/data/btcusd_5min_6mo.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bars = (await res.json()) as OhlcvBar[];
      setTrades(runExperiment(bars));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run experiment");
    } finally {
      setRunning(false);
    }
  }

  const weeks = trades ? groupIntoWeeks(trades) : [];
  const wins = trades?.filter((t) => t.outcome === "WIN").length ?? 0;
  const losses = trades?.filter((t) => t.outcome === "LOSS").length ?? 0;
  const decided = wins + losses;
  const totalR = trades?.reduce((acc, t) => acc + t.r, 0) ?? 0;
  const pnlTrades = trades?.filter((t) => t.pnlUsd !== null && t.pnlPct !== null) ?? [];
  const totalPnl = pnlTrades.reduce((acc, t) => acc + t.pnlUsd!, 0);
  const avgPnlPct = pnlTrades.length > 0
    ? pnlTrades.reduce((acc, t) => acc + t.pnlPct!, 0) / pnlTrades.length
    : 0;

  return (
    <section className="card">
      <h2>
        Experiment — random ${DEFAULT_TRADE_AMOUNT_USD} position at every session open (BTC,
        Mon–Fri, 10-minute expiry, RR {RISK_REWARD_RATIO}:1)
      </h2>
      <button className="run-button" onClick={run} disabled={running}>
        {running ? "Running…" : trades ? "Re-run random experiment" : "Run random experiment"}
      </button>
      {error && <div className="chart-status">{error}</div>}

      {trades && (
        <>
          <div className="summary">
            <span>
              Trades <b>{trades.length}</b>
            </span>
            <span>
              Wins <b>{wins}</b>
            </span>
            <span>
              Losses <b>{losses}</b>
            </span>
            <span>
              Win rate <b>{decided > 0 ? ((100 * wins) / decided).toFixed(1) : "0.0"}%</b>
            </span>
            <span>
              Total R <b>{totalR > 0 ? "+" : ""}{totalR}</b>
            </span>
            <span>
              Total PnL <b>{fmtUsd(totalPnl)}</b>
            </span>
            <span>
              Avg/trade <b>{fmtPct(avgPnlPct)}</b>
            </span>
            <span>
              {sessions
                .map((s) => {
                  const st = trades.filter((t) => t.abbrev === s.abbrev);
                  const w = st.filter((t) => t.outcome === "WIN").length;
                  const l = st.filter((t) => t.outcome === "LOSS").length;
                  return `${s.abbrev} ${w + l > 0 ? ((100 * w) / (w + l)).toFixed(0) : "–"}%`;
                })
                .join(" · ")}
            </span>
          </div>

          <table className="results-table">
            <thead>
              <tr>
                <th>BTC</th>
                {WEEKDAYS.map((d) => (
                  <th key={d.dow}>{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.weekStart}>
                  <td>{week.label}</td>
                  {WEEKDAYS.map((d) => {
                    const dayTrades = week.days[d.dow] ?? [];
                    const dayR = dayTrades.reduce((acc, t) => acc + t.r, 0);
                    const dayPnl = dayTrades.reduce((acc, t) => acc + (t.pnlUsd ?? 0), 0);
                    return (
                      <td key={d.dow}>
                        {dayTrades.length > 0 && (
                          <>
                            <div className="cell-chips">
                              {dayTrades.map((t) => (
                                <TradeChip key={t.abbrev} trade={t} />
                              ))}
                            </div>
                            <div className="cell-r">
                              {dayTrades[0].day} · {dayR > 0 ? "+" : ""}{dayR}R · {fmtUsd(dayPnl)}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
