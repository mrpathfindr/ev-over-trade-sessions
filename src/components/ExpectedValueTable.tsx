"use client";

import { useMemo } from "react";
import { EV_SESSIONS, buildEvTable, type EvCell } from "@/lib/expectedValue";
import type { SessionTrade } from "@/lib/types";

function fmtUsd(v: number): string {
  return `${v < 0 ? "-" : "+"}$${Math.abs(v).toFixed(2)}`;
}

const MAX_TOOLTIP_OUTCOMES = 8;

/** Plain-text breakdown of E[X] = Σ x_i · P(x_i) shown on hover. */
function cellTitle(label: string, cell: EvCell): string {
  if (cell.n === 0) return `${label}\nNo trades with a result`;
  const lines = cell.outcomes
    .slice(0, MAX_TOOLTIP_OUTCOMES)
    .map((o) => `x = ${fmtUsd(o.value)}   f = ${o.count}   P = ${o.p.toFixed(3)}   x·P = ${fmtUsd(o.value * o.p)}`);
  const more = cell.outcomes.length - MAX_TOOLTIP_OUTCOMES;
  return [
    `${label} — n = ${cell.n} trades, ${cell.outcomes.length} distinct PnL outcomes`,
    `E[X] = Σ x·P(x) = ${fmtUsd(cell.ev)}`,
    "",
    ...lines,
    ...(more > 0 ? [`… and ${more} more outcomes`] : []),
  ].join("\n");
}

function EvCellView({ label, cell }: { label: string; cell: EvCell }) {
  const cls = cell.n === 0 ? "ev-none" : cell.ev > 0 ? "ev-pos" : cell.ev < 0 ? "ev-neg" : "ev-zero";
  return (
    <td className={`ev-cell ${cls}`} title={cellTitle(label, cell)}>
      {cell.n === 0 ? (
        <span className="ev-value">–</span>
      ) : (
        <>
          <span className="ev-value">{fmtUsd(cell.ev)}</span>
          <span className="ev-n">n = {cell.n}</span>
        </>
      )}
    </td>
  );
}

interface ExpectedValueTableProps {
  /** Short pair name shown in the corner cell, e.g. "BTC". */
  pairShort: string;
  /** Trades of the selected market from the current run. */
  trades: SessionTrade[];
}

/**
 * Expected value of the random experiment's PnL per weekday (rows) and
 * session opening time (columns), E[X] = Σ x_i · P(x_i) over the PnL outcomes
 * observed in that cell. Green = positive EV, red = negative EV.
 */
export default function ExpectedValueTable({ pairShort, trades }: ExpectedValueTableProps) {
  const table = useMemo(() => buildEvTable(trades), [trades]);

  return (
    <div className="ev-section">
      <h3 className="ev-title">Expected value table</h3>
      <p className="ev-formula">
        E[X] = Σ xᵢ · P(xᵢ) — xᵢ are the distinct trade PnL outcomes (USD) of this run in that
        weekday/session cell, P(xᵢ) = fᵢ / n their relative frequency. Hover a cell for the
        distribution.
      </p>
      <table className="results-table ev-table">
        <thead>
          <tr>
            <th>{pairShort}</th>
            {EV_SESSIONS.map((s) => (
              <th key={s.abbrev}>
                {s.name}
                <span className="ev-open">{s.openUTC} UTC</span>
              </th>
            ))}
            <th className="ev-agg">
              All sessions
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.dow}>
              <td>{row.label}</td>
              {EV_SESSIONS.map((s) => (
                <EvCellView key={s.abbrev} label={`${row.label} · ${s.name} ${s.openUTC} UTC`} cell={row.cells[s.abbrev]} />
              ))}
              <EvCellView label={`${row.label} · all sessions`} cell={row.all} />
            </tr>
          ))}
          <tr className="ev-agg-row">
            <td>All days</td>
            {EV_SESSIONS.map((s) => (
              <EvCellView key={s.abbrev} label={`All days · ${s.name} ${s.openUTC} UTC`} cell={table.allDays[s.abbrev]} />
            ))}
            <EvCellView label="All days · all sessions" cell={table.total} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
