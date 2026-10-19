"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { groupIntoWeeks, runExperiment } from "@/lib/experiment";
import {
  DEFAULT_EXPERIMENT_PARAMS,
  DEFAULT_TRADE_AMOUNT_USD,
  EXPIRATION_OPTIONS_MIN,
  POSITION_SIZE_USD,
  RISK_REWARD_OPTIONS,
  STOP_LOSS_PCT,
  fmtExpiration,
  fmtRiskReward,
  minutesToMs,
  type ExperimentParams,
} from "@/lib/constants";
import { PAIRS } from "@/lib/pairs";
import ExpectedValueTable from "@/components/ExpectedValueTable";
import RunCharts from "@/components/RunCharts";
import { createDirectionPlan } from "@/lib/randomize";
import sessions from "@/lib/sessions.json";
import type { OhlcvBar, RunRecord, SessionTrade } from "@/lib/types";

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

/** Price change between open and close, e.g. +0.1008% (4 decimals: small intraday moves). */
function fmtPriceChange(fraction: number): string {
  return `${fraction < 0 ? "-" : "+"}${(Math.abs(fraction) * 100).toFixed(4)}%`;
}

/** PnL as a fraction of the standard trade amount: -$1.00 on a $5 trade = -0.20 (-20%). */
function pnlFractionOfTrade(pnlUsd: number): number {
  return pnlUsd / DEFAULT_TRADE_AMOUNT_USD;
}

/** PnL as % of the trade amount, 1 decimal (e.g. "-10.1%", "+400.0%"). */
function fmtTradePct(fraction: number): string {
  const pct = Math.round(fraction * 1000) / 10;
  return `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${Math.abs(pct).toFixed(1)}%`;
}

function fmtR(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}R`;
}

function describeChanges(prev: ExperimentParams | null, next: ExperimentParams): string[] {
  if (!prev) return [];
  const changes: string[] = [];
  if (prev.expirationMs !== next.expirationMs) {
    changes.push(`Expiration ${fmtExpiration(prev.expirationMs)} → ${fmtExpiration(next.expirationMs)}`);
  }
  if (prev.riskRewardRatio !== next.riskRewardRatio) {
    changes.push(`Risk:Reward ${fmtRiskReward(prev.riskRewardRatio)} → ${fmtRiskReward(next.riskRewardRatio)}`);
  }
  return changes;
}

function sameParams(a: ExperimentParams, b: ExperimentParams): boolean {
  return a.expirationMs === b.expirationMs && a.riskRewardRatio === b.riskRewardRatio;
}

/**
 * One session trade as a square in the 2x2 day grid: session + direction +
 * close reason on top, PnL in dollars and as % of the trade amount below.
 */
function TradeSquare({ trade, onClick }: { trade: SessionTrade; onClick?: () => void }) {
  const cls =
    trade.outcome === "WIN"
      ? "win"
      : trade.outcome === "LOSS"
        ? "loss"
        : trade.outcome === "FLAT"
          ? "flat"
          : "nodata";
  const arrow = trade.direction === "LONG" ? "↑" : "↓";
  const hasPnl = trade.pnlUsd !== null;
  const fraction = hasPnl ? pnlFractionOfTrade(trade.pnlUsd!) : null;
  const reason =
    trade.closeReason === "TP"
      ? "TP hit"
      : trade.closeReason === "SL"
        ? "SL hit"
        : trade.closeReason === "EXPIRY"
          ? "Expired"
          : "No data";
  const title =
    trade.entry !== null && trade.exit !== null && trade.stop !== null && trade.target !== null
      ? `${trade.session} open ${trade.entryTime} UTC\n${trade.direction} @ ${trade.entry.toLocaleString()} · SL ${trade.stop.toLocaleString()} · TP ${trade.target.toLocaleString()}\nClosed ${trade.exitTime} UTC (${reason}) @ ${trade.exit.toLocaleString()}\nPrice change ${trade.entry.toLocaleString()} → ${trade.exit.toLocaleString()} = ${fmtPriceChange(trade.pnlPct!)} (in the position's favour)\nPnL on $${POSITION_SIZE_USD} position: ${fmtUsd(trade.pnlUsd!)} = ${fmtTradePct(fraction!)} of the $${DEFAULT_TRADE_AMOUNT_USD} trade (${fmtR(trade.r)})`
      : `${trade.session} open ${trade.entryTime} UTC\nNo market data`;
  const clickable = onClick !== undefined && trade.closeReason !== "NO DATA";
  return (
    <div
      className={`square ${cls}${clickable ? " clickable" : ""}`}
      title={clickable ? `${title}\n\nClick to view this trade on the chart` : title}
      onClick={clickable ? onClick : undefined}
    >
      <div className="sq-head">
        <span>
          {trade.abbrev} {arrow}
        </span>
        {trade.closeReason !== "NO DATA" && (
          <span className={`chip-reason ${trade.closeReason.toLowerCase()}`}>
            {trade.closeReason === "EXPIRY" ? "EXP" : trade.closeReason}
          </span>
        )}
      </div>
      {hasPnl ? (
        <div className="sq-body">
          <span className="sq-usd">{fmtUsd(trade.pnlUsd!)}</span>
          <span className="sq-pct">
            Δ {fmtPriceChange(trade.pnlPct!)}
          </span>
          <span className="sq-pct">{fmtTradePct(fraction!)} of ${DEFAULT_TRADE_AMOUNT_USD}</span>
        </div>
      ) : (
        <div className="sq-body">
          <span className="sq-pct">no data</span>
        </div>
      )}
    </div>
  );
}

/** Empty square keeping a session's fixed grid position when it has no trade that day. */
function EmptySquare({ abbrev }: { abbrev: string }) {
  return (
    <div className="square empty" title={`${abbrev}: no trade`}>
      <div className="sq-head">
        <span>{abbrev}</span>
      </div>
    </div>
  );
}

interface ExperimentPanelProps {
  /** The most recent completed run (null before the first run). */
  currentRun: RunRecord | null;
  setCurrentRun: Dispatch<SetStateAction<RunRecord | null>>;
  /** Called when a trade square is clicked, to show that trade on the chart. */
  onTradeClick?: (pairShort: string, trade: SessionTrade) => void;
}

export default function ExperimentPanel({ currentRun, setCurrentRun, onTradeClick }: ExperimentPanelProps) {
  const [params, setParams] = useState<ExperimentParams>(DEFAULT_EXPERIMENT_PARAMS);
  const [pairIndex, setPairIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs the random experiment on all markets with the selected T and RR. */
  async function run() {
    setRunning(true);
    setError(null);
    // Snapshot the independent variables at click time so the run is
    // reproducible even if the selectors change while data is loading.
    const runParams: ExperimentParams = { ...params };
    try {
      const allBars = await Promise.all(
        PAIRS.map(async (p) => {
          const res = await fetch(p.file);
          if (!res.ok) throw new Error(`Failed to load ${p.label}: HTTP ${res.status}`);
          return (await res.json()) as OhlcvBar[];
        })
      );
      // One shared plan: the same day/session slot gets the same random
      // direction on every market (e.g. Monday Week 1 LONG on BTC, ETH, SOL).
      const plan = createDirectionPlan();
      const results: Record<string, SessionTrade[]> = {};
      PAIRS.forEach((p, i) => {
        results[p.short] = runExperiment(allBars[i], plan, runParams);
      });
      setCurrentRun((prev) => ({
        id: (prev?.id ?? 0) + 1,
        params: runParams,
        results,
        changes: describeChanges(prev?.params ?? null, runParams),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run experiment");
    } finally {
      setRunning(false);
    }
  }

  const pair = PAIRS[pairIndex];
  const trades = currentRun ? currentRun.results[pair.short] : null;
  const pendingChange = currentRun !== null && !sameParams(currentRun.params, params);
  const weeks = trades ? groupIntoWeeks(trades) : [];
  const wins = trades?.filter((t) => t.outcome === "WIN").length ?? 0;
  const losses = trades?.filter((t) => t.outcome === "LOSS").length ?? 0;
  const decided = wins + losses;
  const totalR = trades?.reduce((acc, t) => acc + t.r, 0) ?? 0;
  const tpHits = trades?.filter((t) => t.closeReason === "TP").length ?? 0;
  const slHits = trades?.filter((t) => t.closeReason === "SL").length ?? 0;
  const expired = trades?.filter((t) => t.closeReason === "EXPIRY").length ?? 0;
  const pnlTrades = trades?.filter((t) => t.pnlUsd !== null) ?? [];
  const totalPnl = pnlTrades.reduce((acc, t) => acc + t.pnlUsd!, 0);
  /** Average PnL per trade as a fraction of the trade amount. */
  const avgPnlFraction = pnlTrades.length > 0
    ? pnlTrades.reduce((acc, t) => acc + pnlFractionOfTrade(t.pnlUsd!), 0) / pnlTrades.length
    : 0;

  return (
    <section className="card">
      <h2>
        Experiment — random ${POSITION_SIZE_USD} position risking ${DEFAULT_TRADE_AMOUNT_USD} at every
        session open (BTC, ETH &amp; SOL, Mon–Fri) — closed by take-profit, stop-loss or expiry (T)
      </h2>

      <div className="variables">
        <div className="variable">
          <span className="variable-name">Expiration time (T)</span>
          <div className="toggle">
            {EXPIRATION_OPTIONS_MIN.map((min) => (
              <button
                key={min}
                className={params.expirationMs === minutesToMs(min) ? "active" : ""}
                disabled={running}
                onClick={() => setParams((p) => ({ ...p, expirationMs: minutesToMs(min) }))}
              >
                {min} min
              </button>
            ))}
          </div>
        </div>
        <div className="variable">
          <span className="variable-name">Risk : Reward</span>
          <div className="toggle">
            {RISK_REWARD_OPTIONS.map((rr) => (
              <button
                key={rr}
                className={params.riskRewardRatio === rr ? "active" : ""}
                disabled={running}
                onClick={() => setParams((p) => ({ ...p, riskRewardRatio: rr }))}
              >
                {fmtRiskReward(rr)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button className="run-button" onClick={run} disabled={running}>
        {running ? "Running…" : currentRun ? "Re-run random experiment" : "Run random experiment"}
      </button>
      {pendingChange && !running && (
        <span className="pending-note">
          Selection differs from the displayed run — re-run to apply T ={" "}
          {fmtExpiration(params.expirationMs)}, RR = {fmtRiskReward(params.riskRewardRatio)}
        </span>
      )}
      {error && <div className="chart-status">{error}</div>}

      {currentRun && trades && (
        <>
          <div className="run-state">
            <span>
              Run <b>#{currentRun.id}</b>
            </span>
            <span>
              Expiration (T) <b>{fmtExpiration(currentRun.params.expirationMs)}</b>
            </span>
            <span>
              Risk : Reward <b>{fmtRiskReward(currentRun.params.riskRewardRatio)}</b>
            </span>
            <span>
              Position <b>${POSITION_SIZE_USD}</b> · Risk <b>${DEFAULT_TRADE_AMOUNT_USD}</b> · Target{" "}
              <b>${DEFAULT_TRADE_AMOUNT_USD * currentRun.params.riskRewardRatio}</b> · Stop{" "}
              <b>{(STOP_LOSS_PCT * 100).toFixed(2)}%</b> / Target{" "}
              <b>{(STOP_LOSS_PCT * currentRun.params.riskRewardRatio * 100).toFixed(2)}%</b> from entry
            </span>
            <span className="run-changes">
              {currentRun.id === 1
                ? "First run — baseline"
                : currentRun.changes.length === 0
                  ? "No independent variables changed (new randomization only)"
                  : `Changed this run: ${currentRun.changes.join(" · ")}`}
            </span>
          </div>
          <RunCharts run={currentRun} />

          <div className="chart-head results-head">
            <div className="pair-block">
              <span className="pair-label">{pair.label}</span>
              <div className="toggle">
                {PAIRS.map((p, i) => (
                  <button
                    key={p.short}
                    className={i === pairIndex ? "active" : ""}
                    onClick={() => setPairIndex(i)}
                  >
                    {p.short}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
              TP hits <b>{tpHits}</b>
            </span>
            <span>
              SL hits <b>{slHits}</b>
            </span>
            <span>
              Expired <b>{expired}</b>
            </span>
            <span>
              Total R <b>{fmtR(totalR)}</b>
            </span>
            <span>
              Total PnL <b>{fmtUsd(totalPnl)}</b>
            </span>
            <span>
              Avg/trade <b>{fmtUsd(avgPnlFraction * DEFAULT_TRADE_AMOUNT_USD)} ({fmtTradePct(avgPnlFraction)})</b>
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

          <ExpectedValueTable pairShort={pair.short} trades={trades} />

          <div className="trades-section">
            <h3 className="ev-title">Individual trades</h3>
            <table className="results-table">
              <thead>
                <tr>
                  <th>{pair.short}</th>
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
                      const dayPnlTrades = dayTrades.filter((t) => t.pnlUsd !== null);
                      const dayPnl = dayPnlTrades.reduce((acc, t) => acc + t.pnlUsd!, 0);
                      const dayRisked = dayPnlTrades.length * DEFAULT_TRADE_AMOUNT_USD;
                      return (
                        <td key={d.dow}>
                          {dayTrades.length > 0 && (
                            <>
                              {/* Fixed 2x2 layout in session order: Tokyo (top-left), London (top-right),
                                  New York (bottom-left), Sydney (bottom-right). */}
                              <div className="session-grid">
                                {sessions.map((s) => {
                                  const t = dayTrades.find((x) => x.abbrev === s.abbrev);
                                  return t ? (
                                    <TradeSquare
                                      key={s.abbrev}
                                      trade={t}
                                      onClick={onTradeClick ? () => onTradeClick(pair.short, t) : undefined}
                                    />
                                  ) : (
                                    <EmptySquare key={s.abbrev} abbrev={s.abbrev} />
                                  );
                                })}
                              </div>
                              <div className="cell-r">
                                {dayTrades[0].day} · {fmtUsd(dayPnl)} ·{" "}
                                {dayRisked > 0 ? fmtTradePct(dayPnl / dayRisked) : "–"} of ${dayRisked} risked
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
          </div>
        </>
      )}
    </section>
  );
}
