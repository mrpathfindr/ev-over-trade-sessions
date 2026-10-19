"use client";

import { useRef, useState } from "react";
import CandleChart from "@/components/CandleChart";
import ExperimentPanel from "@/components/ExperimentPanel";
import type { RunRecord, SessionTrade, TradeFocusRequest } from "@/lib/types";

/**
 * Client wrapper that owns the experiment run so both the chart (markers) and
 * the experiment panel (results table) render the same run.
 */
export default function Dashboard() {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [focus, setFocus] = useState<TradeFocusRequest | null>(null);
  const nonce = useRef(0);

  function showTradeOnChart(pairShort: string, trade: SessionTrade) {
    nonce.current += 1;
    setFocus({ pairShort, trade, nonce: nonce.current });
  }

  return (
    <>
      <CandleChart run={run} focus={focus} />
      <ExperimentPanel currentRun={run} setCurrentRun={setRun} onTradeClick={showTradeOnChart} />
    </>
  );
}
