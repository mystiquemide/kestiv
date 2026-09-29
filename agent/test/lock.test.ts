import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import { founderStreamData } from "../src/lock/create.js";
import {
  LockTermsError,
  REQUIRED_FLAGS,
  assertLockTerms,
  type FounderVesting,
} from "../src/lock/read.js";
import { FOUNDER_TERMS, founderSchedule } from "../src/lock/terms.js";

const sender = Keypair.generate().publicKey.toBase58();
const recipient = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();

const stream = (over: Partial<FounderVesting> = {}, flags: Partial<FounderVesting["flags"]> = {}): FounderVesting => ({
  streamId: "id",
  recipient,
  sender,
  mint,
  depositedAmount: 100n,
  withdrawnAmount: 0n,
  start: 1,
  end: 2,
  period: 86400,
  amountPerPeriod: 1n,
  cliff: 1,
  cliffAmount: 0n,
  closed: false,
  flags: { ...REQUIRED_FLAGS, ...flags },
  ...over,
});
const expected = { recipient, mint, sender };

describe("assertLockTerms", () => {
  it("passes for the exact founder terms", () => {
    expect(() => assertLockTerms(stream(), expected)).not.toThrow();
  });

  it.each([
    ["cancelableBySender"],
    ["cancelableByRecipient"],
    ["transferableBySender"],
    ["transferableByRecipient"],
    ["automaticWithdrawal"],
    ["canUpdateRate"],
    ["pausable"],
  ] as const)("fails when %s is true", (flag) => {
    expect(() => assertLockTerms(stream({}, { [flag]: true }), expected)).toThrow(LockTermsError);
  });

  it("fails when topup is disabled", () => {
    expect(() => assertLockTerms(stream({}, { canTopup: false }), expected)).toThrow(/canTopup/);
  });

  it("fails on wrong recipient, mint, sender or a closed stream", () => {
    const other = Keypair.generate().publicKey.toBase58();
    expect(() => assertLockTerms(stream({ recipient: other }), expected)).toThrow(/recipient/);
    expect(() => assertLockTerms(stream({ mint: other }), expected)).toThrow(/mint/);
    expect(() => assertLockTerms(stream({ sender: other }), expected)).toThrow(/sender/);
    expect(() => assertLockTerms(stream({ closed: true }), expected)).toThrow(/closed/);
  });

  it("reports every violation at once", () => {
    try {
      assertLockTerms(stream({}, { cancelableBySender: true, canUpdateRate: true }), expected);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as LockTermsError).violations).toHaveLength(2);
    }
  });
});

describe("founder schedule", () => {
  it("starts and cliffs 90 days out, daily period, no cliff lump", () => {
    const s = founderSchedule(1_000_000, 365_000n);
    expect(s.start).toBe(1_000_000 + 90 * 86_400);
    expect(s.cliff).toBe(s.start);
    expect(s.period).toBe(86_400);
    expect(s.cliffAmount.toString()).toBe("0");
    expect(s.amountPerPeriod.toString()).toBe("1000");
    expect(FOUNDER_TERMS.vestSeconds).toBe(365 * 86_400);
  });

  it("rounds the daily amount up so 365 periods cover the deposit", () => {
    expect(founderSchedule(0, 366n).amountPerPeriod.toString()).toBe("2");
  });

  it("builds create params with every trust flag off and topup on, classified as vesting", () => {
    const d = founderStreamData({
      mint: Keypair.generate().publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: 1_000_000n,
      recipient: Keypair.generate().publicKey,
      nowSec: 0,
    });
    expect(d).toMatchObject({
      canTopup: true,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      canUpdateRate: false,
      canPause: false,
      period: 86_400,
    });
    expect(d.cliffAmount.toString()).toBe("0");
  });
});
