import type { InflowRow } from "../store/index.js";

export interface Budget {
  budgetedLamports: number;
  spentOnSlicesLamports: number;
  expensesLamports: number;
  remainingLamports: number;
  walletLamports: number;
  spendableLamports: number;
}

export const stakeShare = (lamports: number, stakeShareBps: number): number =>
  Math.floor((lamports * stakeShareBps) / 10_000);

export function computeBudget(p: {
  inflows: Pick<InflowRow, "lamports" | "source">[];
  stakeShareBps: number;
  spentOnSlices: number;
  expenses: number;
  walletLamports: number;
  opsReserveLamports: number;
}): Budget {
  const budgeted = p.inflows.reduce(
    (sum, i) => sum + (i.source === "fee" ? stakeShare(i.lamports, p.stakeShareBps) : i.lamports),
    0,
  );
  const remaining = Math.max(0, budgeted - p.spentOnSlices - p.expenses);
  const spendable = Math.max(0, Math.min(remaining, p.walletLamports - p.opsReserveLamports));
  return {
    budgetedLamports: budgeted,
    spentOnSlicesLamports: p.spentOnSlices,
    expensesLamports: p.expenses,
    remainingLamports: remaining,
    walletLamports: p.walletLamports,
    spendableLamports: spendable,
  };
}
