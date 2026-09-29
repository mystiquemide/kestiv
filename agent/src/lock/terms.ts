import BN from "bn.js";
import { computeAmountPerPeriod } from "@streamflow/stream";

const DAY = 86_400;

export const FOUNDER_TERMS = {
  cliffSeconds: 90 * DAY,
  vestSeconds: 365 * DAY,
  periodSeconds: DAY,
  cliffAmount: 0,
} as const;

export interface FounderSchedule {
  start: number;
  cliff: number;
  period: number;
  cliffAmount: BN;
  amountPerPeriod: BN;
}

/**
 * Intent: nothing is withdrawable for 90 days, then the stake releases linearly, once per day, over 365 days.
 *
 * Streamflow unlock rule (calculateUnlockedAmount): 0 before `cliff`, then
 * cliffAmount + floor((t - cliff) / period) * amountPerPeriod, capped at the deposit.
 * Mapping: start = cliff = createdAt + 90d, period = 86400, cliffAmount = 0 (no lump at the cliff),
 * amountPerPeriod = ceil(amount / 365). The contract end is derived on chain from the deposit and
 * amountPerPeriod, so a topup keeps the daily rate and pushes the end later.
 */
export function founderSchedule(nowSec: number, amount: bigint): FounderSchedule {
  if (amount <= 0n) throw new Error("amount must be positive");
  const cliffAmount = new BN(FOUNDER_TERMS.cliffAmount);
  const at = nowSec + FOUNDER_TERMS.cliffSeconds;
  return {
    start: at,
    cliff: at,
    period: FOUNDER_TERMS.periodSeconds,
    cliffAmount,
    amountPerPeriod: computeAmountPerPeriod(
      new BN(amount.toString()),
      cliffAmount,
      FOUNDER_TERMS.vestSeconds,
      FOUNDER_TERMS.periodSeconds,
    ),
  };
}
