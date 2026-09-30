import { PublicKey } from "@solana/web3.js";
import { vestingNow, type VestingTerms } from "./vesting";

/**
 * Jupiter Lock ("locker") program. The account layout is the program's own, also used by agent/src/lock/jupiter.ts.
 * Read offsets: recipient 8, mint 40, creator 72, base 104, update-recipient mode 137, cancel mode 138, token program flag 139,
 * cliff 144, frequency 152, cliff unlock 160, amount per period 168, periods 176, claimed 184, start 192, cancelled at 200.
 */
export const LOCKER_PROGRAM_ID = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
export const ESCROW_ACCOUNT_SIZE = 296;
const ESCROW_DISCRIMINATOR = Buffer.from("f477b704497487c3", "hex");
export const OFFSET_RECIPIENT = 8;
export const OFFSET_MINT = 40;
export const OFFSET_CREATOR = 72;

export interface LockData {
  id: string;
  recipient: string;
  mint: string;
  creator: string;
  updateRecipientMode: number;
  cancelMode: number;
  /** 0 classic token program, 1 Token-2022. */
  tokenProgramFlag: number;
  cliff: number;
  frequency: number;
  cliffUnlockAmount: string;
  amountPerPeriod: string;
  periods: number;
  claimed: string;
  start: number;
  cancelledAt: number;
  /** Everything the lock will ever hold. */
  deposited: string;
  /** The last unlock: cliff plus all the periods. */
  end: number;
}

export function parseLockAccount(id: string, data: Buffer): LockData {
  if (data.length !== ESCROW_ACCOUNT_SIZE || !data.subarray(0, 8).equals(ESCROW_DISCRIMINATOR)) {
    throw new Error(`account ${id} is not a Jupiter Lock escrow`);
  }
  const key = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  const cliffUnlock = data.readBigUInt64LE(160);
  const perPeriod = data.readBigUInt64LE(168);
  const periods = data.readBigUInt64LE(176);
  const frequency = Number(data.readBigUInt64LE(152));
  const cliff = Number(data.readBigUInt64LE(144));
  return {
    id,
    recipient: key(OFFSET_RECIPIENT),
    mint: key(OFFSET_MINT),
    creator: key(OFFSET_CREATOR),
    updateRecipientMode: data.readUInt8(137),
    cancelMode: data.readUInt8(138),
    tokenProgramFlag: data.readUInt8(139),
    cliff,
    frequency,
    cliffUnlockAmount: cliffUnlock.toString(),
    amountPerPeriod: perPeriod.toString(),
    periods: Number(periods),
    claimed: data.readBigUInt64LE(184).toString(),
    start: Number(data.readBigUInt64LE(192)),
    cancelledAt: Number(data.readBigUInt64LE(200)),
    deposited: (cliffUnlock + perPeriod * periods).toString(),
    end: cliff + frequency * Number(periods),
  };
}

/** One lock as the shared vesting math sees it. Same unlock rule: nothing until the cliff, then one equal share per full period. */
export const lockTerms = (l: LockData): VestingTerms => ({
  depositedAmount: l.deposited,
  withdrawnAmount: l.claimed,
  cliff: l.cliff,
  cliffAmount: l.cliffUnlockAmount,
  end: l.end,
  period: l.frequency,
  amountPerPeriod: l.amountPerPeriod,
});

export interface LockTotals {
  deposited: string;
  claimed: string;
  vested: string;
  locked: string;
  nextUnlock: number | null;
  cliff: number | null;
  end: number | null;
}

/** Everything the founder stake holds across all of its locks, at one moment. */
export function lockTotals(locks: LockData[], nowSec: number): LockTotals {
  let deposited = 0n, claimed = 0n, vested = 0n, locked = 0n;
  let next: number | null = null;
  let cliff: number | null = null;
  let end: number | null = null;
  for (const l of locks) {
    const v = vestingNow(lockTerms(l), nowSec);
    deposited += BigInt(l.deposited);
    claimed += BigInt(l.claimed);
    vested += BigInt(v.vested);
    locked += BigInt(v.locked);
    if (v.nextUnlock !== null && (next === null || v.nextUnlock < next)) next = v.nextUnlock;
    if (cliff === null || l.cliff < cliff) cliff = l.cliff;
    if (end === null || l.end > end) end = l.end;
  }
  return { deposited: deposited.toString(), claimed: claimed.toString(), vested: vested.toString(), locked: locked.toString(), nextUnlock: next, cliff, end };
}

export interface LockGuarantees {
  /** True when nobody can cancel any of the locks. */
  cancelNobody: boolean;
  /** True when nobody can change who receives any of the locks. */
  recipientNobody: boolean;
}

export const guaranteesOf = (locks: LockData[]): LockGuarantees => ({
  cancelNobody: locks.every((l) => l.cancelMode === 0 && l.cancelledAt === 0),
  recipientNobody: locks.every((l) => l.updateRecipientMode === 0),
});

export class LockMismatch extends Error {}

/** A lock counts toward the stake only if it is the founder's: made by Kestiv's wallet, for the founder, in this token. */
export function isFounderLock(l: LockData, expected: { creator: string; recipient: string; mint: string }): boolean {
  return l.creator === expected.creator && l.recipient === expected.recipient && l.mint === expected.mint;
}
