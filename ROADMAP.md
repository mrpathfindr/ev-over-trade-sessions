# Roadmap

1. **Add per-pair run summaries for win rate, net PnL, and average R.** Data: available — each generated trade includes its outcome, USD PnL, and R multiple.
2. **Show maximum drawdown and longest losing streak for each pair.** Data: available — order the run's trades by exit time and derive both measures from their PnL and outcomes.
3. **Show sample counts and uncertainty ranges in expected value cells.** Data: available — each cell is built from the run's observed trade PnL values and counts, which support sample-based uncertainty estimates.
4. **Add CSV export for trade results and expected value tables.** Data: available — both are already derived from the current run's trade records; no additional market feed is needed.
5. **Add a date-range selector for experiment runs.** Data: available — each pair has five-minute OHLCV bars with timestamps covering the same six-month period, so the selected range can filter the existing histories before generating trades.
