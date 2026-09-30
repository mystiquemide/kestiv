import { describe, expect, it } from "vitest";
import { isCapReached, percentString, vestingNow, type VestingTerms } from "../lib/vesting";

const DAY = 86_400;
const t0 = 1_000_000;
const terms: VestingTerms = {
  depositedAmount: "365000",
  withdrawnAmount: "0",
  cliff: t0 + 90 * DAY,
  cliffAmount: "0",
  end: t0 + 90 * DAY + 365 * DAY,
  period: DAY,
  amountPerPeriod: "1000",
};

describe("vestingNow", () => {
  it("before the cliff nothing is vested and the first unlock is one period after it", () => {
    expect(vestingNow(terms, t0 + DAY)).toEqual({ vested: "0", locked: "365000", nextUnlock: terms.cliff + DAY });
    expect(vestingNow(terms, terms.cliff - 1)).toEqual({ vested: "0", locked: "365000", nextUnlock: terms.cliff + DAY });
  });

  it("with a lump at the cliff the lump is the next unlock", () => {
    const lump = { ...terms, cliffAmount: "5000" };
    expect(vestingNow(lump, t0).nextUnlock).toBe(lump.cliff);
  });

  it("at the cliff itself the first period has not completed", () => {
    expect(vestingNow(terms, terms.cliff)).toEqual({ vested: "0", locked: "365000", nextUnlock: terms.cliff + DAY });
  });

  it("midway vests whole periods only and points at the next boundary", () => {
    const now = terms.cliff + 10 * DAY + 123;
    expect(vestingNow(terms, now)).toEqual({ vested: "10000", locked: "355000", nextUnlock: terms.cliff + 11 * DAY });
  });

  it("is fully vested after the end with no next unlock", () => {
    expect(vestingNow(terms, terms.end + 1)).toEqual({ vested: "365000", locked: "0", nextUnlock: null });
  });

  it("caps at the deposit and never exceeds the end for the next unlock", () => {
    const now = terms.end;
    const v = vestingNow(terms, now);
    expect(v.vested).toBe("365000");
    expect(v.nextUnlock).toBeNull();
    const nearEnd = vestingNow({ ...terms, depositedAmount: "365500" }, terms.end - 10);
    expect(nearEnd.nextUnlock).toBe(terms.end);
  });

  it("adds the cliff amount once past the cliff", () => {
    const v = vestingNow({ ...terms, cliffAmount: "500", depositedAmount: "1000000" }, terms.cliff + 2 * DAY);
    expect(v.vested).toBe("2500");
  });

  it("handles amounts beyond 2^53", () => {
    const big = { ...terms, depositedAmount: "900000000000000000000", amountPerPeriod: "2465753424657534246" };
    expect(vestingNow(big, terms.cliff + 3 * DAY).vested).toBe("7397260273972602738");
  });
});

describe("percentString", () => {
  it("formats with four decimals using integer math", () => {
    expect(percentString(15n, 1000n)).toBe("1.5000");
    expect(percentString(0n, 1000n)).toBe("0.0000");
    expect(percentString(1n, 3n)).toBe("33.3333");
    expect(percentString(1n, 100000n)).toBe("0.0010");
    expect(percentString(5n, 0n)).toBe("0.0000");
  });
});

describe("isCapReached", () => {
  it("compares stake to capBps of supply", () => {
    expect(isCapReached(69n, 1000n, 700)).toBe(false);
    expect(isCapReached(70n, 1000n, 700)).toBe(true);
    expect(isCapReached(1n, 0n, 700)).toBe(false);
  });
});
