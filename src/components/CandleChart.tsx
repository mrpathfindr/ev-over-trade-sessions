"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OhlcvBar } from "@/lib/types";

const PAIRS = [
  { label: "BTC/USD", short: "BTC", file: "/data/btcusd_5min_6mo.json" },
  { label: "ETH/USD", short: "ETH", file: "/data/ethusd_5min_6mo.json" },
  { label: "SOL/USD", short: "SOL", file: "/data/solusd_5min_6mo.json" },
];

const RANGES = [
  { label: "1D", bars: 288 },
  { label: "3D", bars: 864 },
  { label: "1W", bars: 2016 },
  { label: "1M", bars: 8640 },
];

const DEFAULT_RANGE = 2; // 1W
const MIN_VISIBLE = 30;
const MAX_VISIBLE = 10000;
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;

const UP = "#26a69a";
const DOWN = "#ef5350";

const cache = new Map<string, OhlcvBar[]>();

async function loadBars(file: string): Promise<OhlcvBar[]> {
  const cached = cache.get(file);
  if (cached) return cached;
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`);
  const bars = (await res.json()) as OhlcvBar[];
  cache.set(file, bars);
  return bars;
}

/**
 * Recharts has no native candlestick series, so a range Bar ([low, high])
 * provides the y-pixel mapping and the shape draws wick + body from it.
 */
function CandleShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: OhlcvBar;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return <g />;
  const { open, high, low, close } = payload;
  const color = close >= open ? UP : DOWN;
  const range = high - low || 1e-9;
  const scale = height / range;
  const py = (v: number) => y + (high - v) * scale;
  const bodyTop = py(Math.max(open, close));
  const bodyHeight = Math.max(1, Math.abs(py(open) - py(close)));
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x} y={bodyTop} width={Math.max(width, 1)} height={bodyHeight} fill={color} />
    </g>
  );
}

function ChartTooltip(props: { active?: boolean; payload?: Array<{ payload: OhlcvBar }> }) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="tooltip-box">
      <div className="tt-date">{d.date} UTC</div>
      <div>O {d.open.toLocaleString()}</div>
      <div>H {d.high.toLocaleString()}</div>
      <div>L {d.low.toLocaleString()}</div>
      <div>C {d.close.toLocaleString()}</div>
      <div>Vol {d.volume.toLocaleString()}</div>
    </div>
  );
}

interface View {
  start: number;
  end: number;
}

export default function CandleChart() {
  const [pairIndex, setPairIndex] = useState(0);
  const [activeRange, setActiveRange] = useState<number | null>(DEFAULT_RANGE);
  const [bars, setBars] = useState<OhlcvBar[] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; start: number; size: number } | null>(null);

  const pair = PAIRS[pairIndex];

  useEffect(() => {
    let cancelled = false;
    setBars(null);
    setView(null);
    setError(null);
    loadBars(pair.file)
      .then((data) => {
        if (cancelled) return;
        setBars(data);
        const size = Math.min(RANGES[DEFAULT_RANGE].bars, data.length);
        setView({ start: data.length - size, end: data.length });
        setActiveRange(DEFAULT_RANGE);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [pair.file]);

  const jumpToRange = useCallback(
    (rangeIndex: number) => {
      if (!bars) return;
      const size = Math.min(RANGES[rangeIndex].bars, bars.length);
      setView({ start: bars.length - size, end: bars.length });
      setActiveRange(rangeIndex);
    },
    [bars]
  );

  const zoom = useCallback(
    (factor: number, anchorFrac: number) => {
      if (!bars) return;
      setView((v) => {
        if (!v) return v;
        const size = v.end - v.start;
        const anchor = v.start + anchorFrac * size;
        const newSize = Math.min(
          MAX_VISIBLE,
          bars.length,
          Math.max(MIN_VISIBLE, Math.round(size * factor))
        );
        let newStart = Math.round(anchor - anchorFrac * newSize);
        newStart = Math.min(Math.max(0, newStart), bars.length - newSize);
        return { start: newStart, end: newStart + newSize };
      });
      setActiveRange(null);
    },
    [bars]
  );

  // Native wheel listener: React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !bars) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      zoom(e.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR, frac);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bars, zoom]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!bars || !view) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, start: view.start, size: view.end - view.start };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const el = viewportRef.current;
      if (!drag || !el || !bars) return;
      const barsPerPx = drag.size / el.getBoundingClientRect().width;
      const shift = Math.round((e.clientX - drag.startX) * barsPerPx);
      const newStart = Math.min(Math.max(0, drag.start - shift), bars.length - drag.size);
      setView({ start: newStart, end: newStart + drag.size });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      setActiveRange(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, bars]);

  const visible = useMemo(() => {
    if (!bars || !view) return [];
    return bars.slice(view.start, view.end);
  }, [bars, view]);

  const tickInterval = Math.max(1, Math.floor(visible.length / 10));
  const tickFormatter = (date: string) =>
    visible.length <= 288 ? date.slice(11, 16) : date.slice(5, 10);

  return (
    <section className="card">
      <div className="chart-head">
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
        <div className="pair-block">
          <span className="chart-hint">Drag to pan · Scroll to zoom</span>
          <div className="toggle">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                className={i === activeRange ? "active" : ""}
                onClick={() => jumpToRange(i)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="chart-status">{error}</div>}
      {!error && !bars && <div className="chart-status">Loading {pair.label}…</div>}
      {!error && bars && view && (
        <div
          ref={viewportRef}
          className={`chart-viewport${dragging ? " dragging" : ""}`}
          onMouseDown={onMouseDown}
        >
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={visible} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="15%">
              <CartesianGrid stroke="#1c2230" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={tickFormatter}
                interval={tickInterval}
                tick={{ fill: "#7a8194", fontSize: 11, fontFamily: "inherit" }}
                axisLine={{ stroke: "#232a38" }}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis
                domain={[(dataMin: number) => dataMin * 0.999, (dataMax: number) => dataMax * 1.001]}
                orientation="right"
                width={80}
                tick={{ fill: "#7a8194", fontSize: 11, fontFamily: "inherit" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#33415c" }} />
              <Bar dataKey={(d: OhlcvBar) => [d.low, d.high]} shape={<CandleShape />} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
