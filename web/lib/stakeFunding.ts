import { solFromLamports } from "./format";
import { FEED_ERROR } from "./howItWorks";
import type { AgentStatus } from "./status";

export type FundingModel =
  | {
      kind: "split";
      fee: { sol: string; pct: number };
      seed: { sol: string; pct: number };
      total: string;
      /** Share of creator fees already sent on to the founder. Null when none has gone yet. */
      forwarded: string | null;
    }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

export const FUNDING_EMPTY = "No money has come in yet. Creator fees and any seed from the founder show up here as they arrive.";

/** Where the SOL the agent has to spend came from. Only the live agent counts, a dry run has no funding of its own. */
export function fundingModel(status: AgentStatus): FundingModel {
  if (!status.ok) return { kind: "error", message: FEED_ERROR };
  const f = status.live?.funding;
  if (!f) return { kind: "empty", message: FUNDING_EMPTY };
  const fee = BigInt(f.feeLamports);
  const seed = BigInt(f.seedLamports);
  const total = fee + seed;
  if (total === 0n) return { kind: "empty", message: FUNDING_EMPTY };
  const feePct = Number((fee * 10_000n) / total) / 100;
  const forwarded = BigInt(f.forwardedLamports);
  return {
    kind: "split",
    fee: { sol: solFromLamports(Number(fee)), pct: feePct },
    seed: { sol: solFromLamports(Number(seed)), pct: Math.round((100 - feePct) * 100) / 100 },
    total: solFromLamports(Number(total)),
    forwarded: forwarded > 0n ? solFromLamports(Number(forwarded)) : null,
  };
}
