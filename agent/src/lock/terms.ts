import { type LockParams, MODE_NOBODY } from "./jupiter.js";

const DAY = 86_400;

export const FOUNDER_TERMS = {
  cliffSeconds: 90 * DAY,
  vestSeconds: 365 * DAY,
  periodSeconds: DAY,
  cliffAmount: 0,
} as const;

/** Number of daily unlocks after the cliff. */
export const PERIODS = FOUNDER_TERMS.vestSeconds / FOUNDER_TERMS.periodSeconds;

/** Tokens below this are dust: locking them would cost more in fees than they are worth, so they wait for the next buy. */
export const DUST_TOKENS = 10_000n;

/**
 * Intent: nothing unlocks for 90 days, then the stake releases in equal daily shares over 365 days.
 * Jupiter Lock mapping: cliffTime = start + 90 days, no lump at the cliff, 365 periods of one day.
 * amountPerPeriod rounds down, so the lock holds at most 364 raw units less than `amount`. Those stay in the wallet
 * and are far below DUST_TOKENS.
 * Who can cancel and who can re-point the recipient are both "nobody", fixed at creation.
 */
export function founderLockParams(nowSec: number, amount: bigint): LockParams {
  const perPeriod = amount / BigInt(PERIODS);
  if (perPeriod <= 0n) throw new Error("amount is too small to lock");
  return {
    vestingStartTime: BigInt(nowSec),
    cliffTime: BigInt(nowSec + FOUNDER_TERMS.cliffSeconds),
    frequency: BigInt(FOUNDER_TERMS.periodSeconds),
    cliffUnlockAmount: BigInt(FOUNDER_TERMS.cliffAmount),
    amountPerPeriod: perPeriod,
    numberOfPeriod: BigInt(PERIODS),
    updateRecipientMode: MODE_NOBODY,
    cancelMode: MODE_NOBODY,
  };
}
