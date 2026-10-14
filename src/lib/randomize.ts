export type Direction = "LONG" | "SHORT";

/** Coin-flip randomization used by the experiment: 50% LONG, 50% SHORT. */
export function randomDirection(): Direction {
  return Math.random() < 0.5 ? "LONG" : "SHORT";
}
