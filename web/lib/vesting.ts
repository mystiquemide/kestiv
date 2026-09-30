export interface VestingTerms {
  depositedAmount: string;
  withdrawnAmount: string;
  cliff: number;
  cliffAmount: string;
  end: number;
  period: number;
  amountPerPeriod: string;
}

export interface VestingNow {
  vested: string;
  locked: string;
  nextUnlock: number | null;
}

/**
 * Jupiter Lock unlock rule, measured on devnet with a 10 second schedule: nothing before the cliff, and nothing at the cliff
 * itself. From the cliff on it is cliffAmount + floor((t - cliff) / period) * amountPerPeriod, capped at the deposit.
 * So with no lump at the cliff, the first unlock is one period after it.
 */
export function vestingNow(s: VestingTerms, nowSec: number): VestingNow {
  const deposited = BigInt(s.depositedAmount);
  const perPeriod = BigInt(s.amountPerPeriod);
  const cliffAmount = BigInt(s.cliffAmount);

  let vested: bigint;
  if (nowSec < s.cliff) vested = 0n;
  else if (nowSec > s.end) vested = deposited;
  else {
    const streamed = BigInt(Math.floor((nowSec - s.cliff) / s.period)) * perPeriod + cliffAmount;
    vested = streamed < deposited ? streamed : deposited;
  }

  let nextUnlock: number | null;
  if (vested >= deposited) nextUnlock = null;
  else if (nowSec < s.cliff) nextUnlock = cliffAmount > 0n ? s.cliff : Math.min(s.cliff + s.period, s.end);
  else {
    const next = s.cliff + (Math.floor((nowSec - s.cliff) / s.period) + 1) * s.period;
    nextUnlock = Math.min(next, s.end);
  }
  return { vested: vested.toString(), locked: (deposited - vested).toString(), nextUnlock };
}

/** num / den as a percentage string with fixed decimals, using integer math. */
export function percentString(num: bigint, den: bigint, digits = 4): string {
  if (den <= 0n) return (0).toFixed(digits);
  const scale = 10n ** BigInt(digits);
  const scaled = (num * 100n * scale) / den;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(digits, "0");
  return `${whole}.${frac}`;
}

export const DEFAULT_CAP_BPS = 700;

export function isCapReached(stakeTokens: bigint, supply: bigint, capBps: number): boolean {
  return supply > 0n && stakeTokens * 10_000n >= supply * BigInt(capBps);
}
