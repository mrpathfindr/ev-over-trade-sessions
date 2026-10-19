export interface Pair {
  label: string;
  short: string;
  file: string;
  /** Line colour used for this market in the run graphs. */
  color: string;
}

/** Markets available in /public/data, shared by the chart and the experiment. */
export const PAIRS: Pair[] = [
  { label: "BTC/USD", short: "BTC", file: "/data/btcusd_5min_6mo.json", color: "#f5c542" }, // yellow
  { label: "ETH/USD", short: "ETH", file: "/data/ethusd_5min_6mo.json", color: "#2dd4bf" }, // teal
  { label: "SOL/USD", short: "SOL", file: "/data/solusd_5min_6mo.json", color: "#a78bfa" }, // purple
];
