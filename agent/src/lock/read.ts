import { PublicKey, type Connection } from "@solana/web3.js";
import { LOCKER_PROGRAM_ID, MODE_NOBODY, depositedOf, parseEscrow, type EscrowState } from "./jupiter.js";
import { FOUNDER_TERMS, PERIODS } from "./terms.js";

export type FounderLock = EscrowState & { deposited: bigint };

export async function readFounderLock(connection: Connection, lockId: string): Promise<FounderLock> {
  const info = await connection.getAccountInfo(new PublicKey(lockId), "confirmed");
  if (!info) throw new Error(`lock ${lockId} not found`);
  if (!info.owner.equals(LOCKER_PROGRAM_ID)) throw new Error(`lock ${lockId} is not owned by the Jupiter Lock program`);
  const s = parseEscrow(lockId, info.data);
  return { ...s, deposited: depositedOf(s) };
}

export interface ExpectedTerms {
  recipient: string;
  mint: string;
  /** The Kestiv wallet that created the lock. */
  sender: string;
}

export class LockTermsError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`lock violates founder lock terms: ${violations.join("; ")}`);
    this.name = "LockTermsError";
    this.violations = violations;
  }
}

export function assertLockTerms(lock: FounderLock, expected: ExpectedTerms): void {
  const bad: string[] = [];
  if (lock.recipient !== expected.recipient) bad.push("recipient mismatch");
  if (lock.mint !== expected.mint) bad.push("mint mismatch");
  if (lock.creator !== expected.sender) bad.push("creator mismatch");
  if (lock.cancelMode !== MODE_NOBODY) bad.push("cancel must be nobody");
  if (lock.updateRecipientMode !== MODE_NOBODY) bad.push("changing the recipient must be nobody");
  if (lock.cancelledAt !== 0n) bad.push("lock was cancelled");
  if (lock.cliffUnlockAmount !== BigInt(FOUNDER_TERMS.cliffAmount)) bad.push("cliff must not release a lump");
  if (lock.frequency !== BigInt(FOUNDER_TERMS.periodSeconds)) bad.push("unlocks must be daily");
  if (lock.numberOfPeriod !== BigInt(PERIODS)) bad.push(`must unlock over ${PERIODS} periods`);
  if (lock.cliffTime - lock.vestingStartTime !== BigInt(FOUNDER_TERMS.cliffSeconds)) bad.push("cliff must be 90 days");
  if (bad.length) throw new LockTermsError(bad);
}
