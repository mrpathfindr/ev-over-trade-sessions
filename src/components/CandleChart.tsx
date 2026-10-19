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
import type { OhlcvBar, RunRecord, SessionTrade, TradeFocusRequest } from "@/lib/types";
import type { Direction } from "@/lib/randomize";
import { fmtExpiration, fmtRiskReward } from "@/lib/constants";
import { PAIRS } from "@/lib/pairs";

const RANGES = [
  // Close-up of individual 5-minute candles (4 hours) so trade markers are readable.
  { label: "5m", bars: 48, title: "5-minute timeframe close-up (4 hours of 5m candles)" },
  { label: "1D", bars: 288, title: "Last day" },
  { label: "3D", bars: 864, title: "Last 3 days" },
  { label: "1W", bars: 2016, title: "Last week" },
  { label: "1M", bars: 8640, title: "Last month" },
];

const FIVE_MIN_VIEW = 0; // index of the 5m close-up in RANGES
const DEFAULT_RANGE = 3; // 1W
const MIN_VISIBLE = 30;
const MAX_VISIBLE = 10000;
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;

const UP = "#26a69a";
const DOWN = "#ef5350";
const BG = "#0b0e14";

/** Experiment trade marker colours: long positions green, short positions red. */
const LONG_MARKER_COLOR = UP;
const SHORT_MARKER_COLOR = DOWN;

/** An experiment order drawn on the candle in which it happened, at its exact price. */
interface TradeMarker {
  kind: "open" | "close";
  direction: Direction;
  price: number;
  trade: SessionTrade;
}

/** A bar as rendered by the chart: OHLCV plus any experiment markers on it. */
type ChartBar = OhlcvBar & { markers?: TradeMarker[] };

function markerColor(direction: Direction): string {
  return direction === "LONG" ? LONG_MARKER_COLOR : SHORT_MARKER_COLOR;
}

/** Glyph used in legends/tooltips: solid = open, hollow = close; up = long, down = short. */
function markerGlyph(m: { kind: "open" | "close"; direction: Direction }): string {
  if (m.direction === "LONG") return m.kind === "open" ? "▲" : "△";
  return m.kind === "open" ? "▼" : "▽";
}

function closeReasonLabel(t: SessionTrade): string {
  return t.closeReason === "TP"
    ? "take-profit hit"
    : t.closeReason === "SL"
      ? "stop-loss hit"
      : t.closeReason === "EXPIRY"
        ? "expired"
        : "no data";
}

function fmtR(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}R`;
}

/**
 * Small arrow whose tip sits exactly on the order price. Long arrows point up
 * (body below the price), short arrows point down (body above the price).
 * Open = solid fill, close = hollow outline.
 */
function ArrowMarker({ cx, tipY, size, marker }: { cx: number; tipY: number; size: number; marker: TradeMarker }) {
  const color = markerColor(marker.direction);
  const d = marker.direction === "LONG" ? 1 : -1; // +1: body extends downward from the tip
  const half = size / 2;
  const headH = size * 0.7;
  const stemHalf = size * 0.17;
  const stemH = size * 0.55;
  const pts: Array<[number, number]> = [
    [cx, tipY],
    [cx + half, tipY + d * headH],
    [cx + stemHalf, tipY + d * headH],
    [cx + stemHalf, tipY + d * (headH + stemH)],
    [cx - stemHalf, tipY + d * (headH + stemH)],
    [cx - stemHalf, tipY + d * headH],
    [cx - half, tipY + d * headH],
  ];
  const open = marker.kind === "open";
  return (
    <polygon
      className={`trade-marker ${marker.kind} ${marker.direction.toLowerCase()}`}
      points={pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
      fill={open ? color : BG}
      stroke={open ? BG : color}
      strokeWidth={open ? 1 : 1.5}
      strokeLinejoin="round"
    />
  );
}

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
  payload?: ChartBar;
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
  // Every order price lies inside its bar's [low, high] (entry/expiry = bar open,
  // TP/SL levels were touched by this bar), so py() places the tip exactly.
  const markers = payload.markers ?? [];
  const size = Math.max(8, Math.min(14, width * 0.9));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x} y={bodyTop} width={Math.max(width, 1)} height={bodyHeight} fill={color} />
      {markers.map((m, i) => (
        <ArrowMarker
          key={`${m.kind}-${m.trade.entryTime}`}
          // spread side by side when one candle holds several orders (e.g. open + SL in the same bar)
          cx={cx + (i - (markers.length - 1) / 2) * size * 1.1}
          tipY={py(Math.min(high, Math.max(low, m.price)))}
          size={size}
          marker={m}
        />
      ))}
    </g>
  );
}

function ChartTooltip(props: { active?: boolean; payload?: Array<{ payload: ChartBar }> }) {
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
      {d.markers?.map((m) => (
        <div key={`${m.kind}-${m.trade.entryTime}`} className="tt-marker" style={{ color: markerColor(m.direction) }}>
          {markerGlyph(m)} {m.kind === "open" ? "OPEN" : "CLOSE"} {m.direction} {m.trade.abbrev} @{" "}
          {m.price.toLocaleString()}
          {m.kind === "open" ? (
            <span className="tt-sub">
              {" "}
              · {m.trade.entryTime.slice(11, 16)} UTC · SL {m.trade.stop?.toLocaleString()} · TP{" "}
              {m.trade.target?.toLocaleString()}
            </span>
          ) : (
            <span className="tt-sub">
              {" "}
              · {closeReasonLabel(m.trade)}
              {m.trade.closeReason === "EXPIRY"
                ? ` at ${m.trade.exitTime.slice(11, 16)} UTC`
                : " within this 5m bar"}{" "}
              · {fmtR(m.trade.r)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface View {
  start: number;
  end: number;
}

interface CandleChartProps {
  /** Latest experiment run; its trades for the selected pair are drawn as markers. */
  run?: RunRecord | null;
  /** Request to show a specific trade (e.g. clicked in the results table). */
  focus?: TradeFocusRequest | null;
}

export default function CandleChart({ run = null, focus = null }: CandleChartProps) {
  const [pairIndex, setPairIndex] = useState(0);
  const [activeRange, setActiveRange] = useState<number | null>(DEFAULT_RANGE);
  const [loaded, setLoaded] = useState<{ file: string; bars: OhlcvBar[] } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<TradeFocusRequest | null>(null);

  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; start: number; size: number } | null>(null);

  const pair = PAIRS[pairIndex];
  const bars = loaded?.bars ?? null;
  const trades = run?.results[pair.short] ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setView(null);
    setError(null);
    loadBars(pair.file)
      .then((data) => {
        if (cancelled) return;
        setLoaded({ file: pair.file, bars: data });
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

  /** bar date -> index, for locating trades in the bar array */
  const indexByDate = useMemo(() => {
    const m = new Map<string, number>();
    bars?.forEach((b, i) => m.set(b.date, i));
    return m;
  }, [bars]);

  /** bar date -> open/close markers of the current run on that bar */
  const markersByDate = useMemo(() => {
    const m = new Map<string, TradeMarker[]>();
    const add = (date: string, marker: TradeMarker) => {
      const list = m.get(date);
      if (list) list.push(marker);
      else m.set(date, [marker]);
    };
    for (const t of trades ?? []) {
      if (t.entry === null || t.exit === null) continue;
      add(t.entryTime, { kind: "open", direction: t.direction, price: t.entry, trade: t });
      add(t.exitTime, { kind: "close", direction: t.direction, price: t.exit, trade: t });
    }
    return m;
  }, [trades]);

  /** Trades located on the bar array, chronological, with the midpoint of their open→close span. */
  const tradeSpans = useMemo(() => {
    const spans: Array<{ trade: SessionTrade; mid: number }> = [];
    for (const t of trades ?? []) {
      if (t.entry === null) continue;
      const a = indexByDate.get(t.entryTime);
      const b = indexByDate.get(t.exitTime);
      if (a === undefined || b === undefined) continue;
      spans.push({ trade: t, mid: (a + b) / 2 });
    }
    return spans.sort((p, q) => p.mid - q.mid);
  }, [trades, indexByDate]);

  const jumpToRange = useCallback(
    (rangeIndex: number) => {
      if (!bars) return;
      const size = Math.min(RANGES[rangeIndex].bars, bars.length);
      if (rangeIndex === FIVE_MIN_VIEW && tradeSpans.length > 0) {
        // Close-up on the most recent experiment trade.
        const mid = tradeSpans[tradeSpans.length - 1].mid;
        const start = Math.min(Math.max(0, Math.round(mid - (size - 1) / 2)), bars.length - size);
        setView({ start, end: start + size });
      } else {
        setView({ start: bars.length - size, end: bars.length });
      }
      setActiveRange(rangeIndex);
    },
    [bars, tradeSpans]
  );

  /** Switch to the 5m close-up centred on a trade's open→close span. */
  const focusOnMid = useCallback(
    (mid: number) => {
      if (!bars) return;
      const size = Math.min(RANGES[FIVE_MIN_VIEW].bars, bars.length);
      const start = Math.min(Math.max(0, Math.round(mid - (size - 1) / 2)), bars.length - size);
      setView({ start, end: start + size });
      setActiveRange(FIVE_MIN_VIEW);
    },
    [bars]
  );

  // Focus requests coming from the results table: switch pair if needed,
  // then centre on the trade once that pair's bars are loaded.
  useEffect(() => {
    if (!focus) return;
    const idx = PAIRS.findIndex((p) => p.short === focus.pairShort);
    if (idx < 0) return;
    setPairIndex(idx);
    setPendingFocus(focus);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  useEffect(() => {
    if (!pendingFocus || !loaded) return;
    const target = PAIRS.find((p) => p.short === pendingFocus.pairShort);
    if (!target || loaded.file !== target.file) return; // wait for the right market
    const a = indexByDate.get(pendingFocus.trade.entryTime);
    const b = indexByDate.get(pendingFocus.trade.exitTime);
    if (a !== undefined && b !== undefined) focusOnMid((a + b) / 2);
    setPendingFocus(null);
  }, [pendingFocus, loaded, indexByDate, focusOnMid]);

  // Prev / next trade relative to the centre of the current view.
  const viewCenter = view ? (view.start + view.end - 1) / 2 : null;
  const prevTrade =
    viewCenter === null ? undefined : [...tradeSpans].reverse().find((s) => s.mid < viewCenter - 2);
  const nextTrade = viewCenter === null ? undefined : tradeSpans.find((s) => s.mid > viewCenter + 2);
  const tradesInView = view
    ? tradeSpans.filter((s) => s.mid >= view.start && s.mid < view.end).length
    : 0;

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

  const visible = useMemo<ChartBar[]>(() => {
    if (!bars || !view) return [];
    return bars.slice(view.start, view.end).map((b) => {
      const markers = markersByDate.get(b.date);
      return markers ? { ...b, markers } : b;
    });
  }, [bars, view, markersByDate]);

  const tickInterval = Math.max(1, Math.floor(visible.length / 10));
  const tickFormatter = (date: string) =>
    visible.length <= 288 ? date.slice(11, 16) : date.slice(5, 10);

  return (
    <section className="card" ref={sectionRef}>
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
                title={r.title}
                onClick={() => jumpToRange(i)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {run && (
        <div className="marker-bar">
          <span className="marker-legend">
            <span>
              Run <b>#{run.id}</b> · T {fmtExpiration(run.params.expirationMs)} · RR{" "}
              {fmtRiskReward(run.params.riskRewardRatio)}
            </span>
            <span style={{ color: LONG_MARKER_COLOR }}>▲ Long open</span>
            <span style={{ color: LONG_MARKER_COLOR }}>△ Long close</span>
            <span style={{ color: SHORT_MARKER_COLOR }}>▼ Short open</span>
            <span style={{ color: SHORT_MARKER_COLOR }}>▽ Short close</span>
          </span>
          <span className="trade-nav">
            <span className="chart-hint">{tradesInView} trade{tradesInView === 1 ? "" : "s"} in view</span>
            <div className="toggle">
              <button disabled={!prevTrade} onClick={() => prevTrade && focusOnMid(prevTrade.mid)}>
                ◀ Prev trade
              </button>
              <button disabled={!nextTrade} onClick={() => nextTrade && focusOnMid(nextTrade.mid)}>
                Next trade ▶
              </button>
            </div>
          </span>
        </div>
      )}

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
              <Bar dataKey={(d: ChartBar) => [d.low, d.high]} shape={<CandleShape />} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
