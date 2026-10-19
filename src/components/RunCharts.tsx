"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PAIRS } from "@/lib/pairs";
import { cumulativeEvSeries, cumulativePnlSeries, type SeriesPoint } from "@/lib/timeseries";
import type { RunRecord } from "@/lib/types";

const AXIS_TICK = { fill: "#7a8194", fontSize: 11, fontFamily: "inherit" };

function fmtUsd(v: number): string {
  return `${v < 0 ? "-" : "+"}$${Math.abs(v).toFixed(2)}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(5, 10); // MM-DD
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function SeriesTooltip(props: {
  active?: boolean;
  label?: number;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>;
}) {
  const { active, label, payload } = props;
  if (!active || !payload || payload.length === 0 || label === undefined) return null;
  return (
    <div className="tooltip-box">
      <div className="tt-date">{fmtDateTime(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} style={{ color: p.color }}>
          {PAIRS.find((x) => x.short === p.dataKey)?.label ?? p.dataKey} <b>{fmtUsd(p.value ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

function CumulativeChart({ title, subtitle, data }: { title: string; subtitle: string; data: SeriesPoint[] }) {
  const finals = PAIRS.map((p) => ({ pair: p, value: data.length ? data[data.length - 1][p.short] : 0 }));
  return (
    <div className="run-chart">
      <div className="run-chart-head">
        <h3>{title}</h3>
        <span className="run-chart-finals">
          {finals.map(({ pair, value }) => (
            <span key={pair.short} style={{ color: pair.color }}>
              {pair.short} <b>{fmtUsd(value)}</b>
            </span>
          ))}
        </span>
      </div>
      <p className="run-chart-sub">{subtitle}</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1c2230" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtDate}
            tick={AXIS_TICK}
            axisLine={{ stroke: "#232a38" }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => `$${v}`}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <ReferenceLine y={0} stroke="#33415c" />
          <Tooltip content={<SeriesTooltip />} cursor={{ stroke: "#33415c" }} />
          <Legend
            formatter={(value: string) => PAIRS.find((p) => p.short === value)?.label ?? value}
            wrapperStyle={{ fontSize: 12 }}
          />
          {PAIRS.map((p) => (
            <Line
              key={p.short}
              type="monotone"
              dataKey={p.short}
              stroke={p.color}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Graph 1: cumulative profit & loss over the data period, one line per market.
 * Graph 2: cumulative expected value over the same period, one line per market.
 * BTC/USD yellow, ETH/USD teal, SOL/USD purple (see PAIRS).
 */
export default function RunCharts({ run }: { run: RunRecord }) {
  const pnl = useMemo(() => cumulativePnlSeries(run.results), [run]);
  const ev = useMemo(() => cumulativeEvSeries(run.results), [run]);
  return (
    <div className="charts-row">
      <CumulativeChart
        title="Profit and Loss over Time"
        subtitle="Cumulative realised PnL (USD) of the run's trades, booked at each trade's close time."
        data={pnl}
      />
      <CumulativeChart
        title="Expected Value over Time"
        subtitle="Cumulative expected value (USD): each trade adds the E[X] = Σ x·P(x) of its weekday × session cell from the Expected value table."
        data={ev}
      />
    </div>
  );
}
