// Experiment constants

/** Default take-profit distance in units of risk (1 = TP as far from entry as SL, i.e. RR 1:1). */
export const RISK_REWARD_RATIO = 1;

/** Default position lifetime: 10 minutes expressed in milliseconds. */
export const EXPIRATION_MS = 10 * 60 * 1000;

/**
 * Position size (notional) in USD of every simulated trade. PnL in dollars is
 * the signed price change between open and close applied to this amount:
 * 74,376 -> 74,451 is +0.1008%, i.e. +$0.50 on a $500 position.
 */
export const POSITION_SIZE_USD = 500;

/**
 * Standard trade amount in USD = the amount RISKED on every simulated trade.
 * A stop-loss hit loses exactly this amount; a take-profit hit wins
 * DEFAULT_TRADE_AMOUNT_USD x riskRewardRatio (e.g. $5 risk at 1:4 -> $20 target).
 * PnL percentages "of the trade" are relative to this amount (-$0.50 = -10%).
 */
export const DEFAULT_TRADE_AMOUNT_USD = 5;

/**
 * Stop-loss distance from entry as a fraction of the entry price, derived from
 * the sizing above: losing the $5 risk on a $500 position is a 1% adverse move.
 *   stop   = entry -/+ entry * STOP_LOSS_PCT
 *   target = entry +/- entry * STOP_LOSS_PCT * riskRewardRatio
 */
export const STOP_LOSS_PCT = DEFAULT_TRADE_AMOUNT_USD / POSITION_SIZE_USD;

/** Interval of the OHLCV bars in /public/data (5 minutes). */
export const BAR_INTERVAL_MS = 5 * 60 * 1000;

/** Independent variable: position lifetime options (minutes). */
export const EXPIRATION_OPTIONS_MIN = [5, 10, 15, 30] as const;

/** Independent variable: risk-to-reward options, expressed as the reward side of 1:N. */
export const RISK_REWARD_OPTIONS = [1, 2, 3, 4] as const;

/** Parameters that define one experiment run. */
export interface ExperimentParams {
  /** Position lifetime in milliseconds. */
  expirationMs: number;
  /** Reward per unit of risk (2 = RR 1:2). */
  riskRewardRatio: number;
}

export const DEFAULT_EXPERIMENT_PARAMS: ExperimentParams = {
  expirationMs: EXPIRATION_MS,
  riskRewardRatio: RISK_REWARD_RATIO,
};

export function minutesToMs(min: number): number {
  return min * 60 * 1000;
}

export function fmtExpiration(ms: number): string {
  return `${Math.round(ms / 60000)}m`;
}

export function fmtRiskReward(rr: number): string {
  return `1:${rr}`;
}
