export type Direction = "LONG" | "SHORT";

/** Coin-flip randomization used by the experiment: 50% LONG, 50% SHORT. */
export function randomDirection(): Direction {
  return Math.random() < 0.5 ? "LONG" : "SHORT";
}

/** Resolves a (memoized) random direction for a slot key, e.g. "2026-04-14|TOK". */
export type DirectionPlan = (slotKey: string) => Direction;

/**
 * Creates a direction plan shared across markets: the first request for a
 * day/session slot flips the coin, and every later request for the same slot
 * (on any other market) returns the identical direction. This keeps the
 * randomization consistent across BTC/ETH/SOL for the same Monday-Week-1 slot.
 */
export function createDirectionPlan(): DirectionPlan {
  const plan = new Map<string, Direction>();
  return (slotKey: string) => {
    let dir = plan.get(slotKey);
    if (!dir) {
      dir = randomDirection();
      plan.set(slotKey, dir);
    }
    return dir;
  };
}
