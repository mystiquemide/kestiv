import type { DevnetProof, StakeView } from "./chain";
import { formatStakePct, shortAddress, solFromLamports } from "./format";
import { capText } from "./hero";
import { solscanAccount, streamflowUrl, type LinkCluster } from "./links";
import type { AgentStatus } from "./status";
import { DEFAULT_CAP_BPS } from "./vesting";

export interface HeroLink {
  label: string;
  href: string;
}

export interface FirstLockBudget {
  parts: { label: string; lamports: number }[];
  neededLamports: number;
  haveLamports: number;
  /** 0 to 1 */
  progress: number;
}

export interface StakeHeroModel {
  state: "not_launched" | "no_contract" | "active" | "cap_reached" | "error";
  headline: string;
  /** Sits under the headline, before the address line. */
  lead: string | null;
  recipient: { full: string; short: string } | null;
  /** "Can't be cancelled or unlocked early", or what is actually switched on. Null when there is no contract to read. */
  lockLine: string | null;
  budget: FirstLockBudget | null;
  links: HeroLink[];
}

export const LOCKED_LINE = "Can't be cancelled or unlocked early.";

/** Says what the flags say. It never claims more than the contract shows. */
export function lockLine(f: { cancelableBySender: boolean; cancelableByRecipient: boolean; pausable: boolean; canUpdateRate: boolean; transferableBySender: boolean; transferableByRecipient: boolean }): string {
  const on = [
    f.cancelableBySender || f.cancelableByRecipient ? "cancel" : null,
    f.pausable ? "pause" : null,
    f.canUpdateRate ? "rate change" : null,
    f.transferableBySender || f.transferableByRecipient ? "transfer" : null,
  ].filter((x): x is string => x !== null);
  return on.length === 0 ? LOCKED_LINE : `Switched on in this contract: ${on.join(", ")}. Read the contract before you rely on it.`;
}

export function firstLockBudget(status: AgentStatus): FirstLockBudget | null {
  const run = status.ok ? (status.live ?? status.dry) : null;
  if (!run || !run.budget) return null;
  const parts = [
    { label: "Contract", lamports: run.policy.contractCreationLamports },
    { label: "First slice", lamports: run.policy.minSliceLamports },
    { label: "Reserve", lamports: run.policy.opsReserveLamports },
  ];
  const neededLamports = parts.reduce((a, p) => a + p.lamports, 0);
  const haveLamports = run.budget.walletLamports;
  return { parts, neededLamports, haveLamports, progress: neededLamports > 0 ? Math.min(1, haveLamports / neededLamports) : 0 };
}

export function budgetText(b: FirstLockBudget): string {
  const parts = b.parts.map((p) => `${p.label.toLowerCase()} ${solFromLamports(p.lamports)}`).join(", ");
  return `The first lock needs about ${solFromLamports(b.neededLamports)} SOL: ${parts}. Kestiv has ${solFromLamports(b.haveLamports)} SOL.`;
}

export function stakeHero(args: {
  stake: StakeView;
  status: AgentStatus;
  proof: DevnetProof | null;
  env: { cluster: LinkCluster; wallet?: string; founder?: string };
}): StakeHeroModel {
  const { stake, status, env } = args;
  const walletLink: HeroLink[] = env.wallet ? [{ label: "Kestiv wallet on Solscan", href: solscanAccount(env.wallet, env.cluster) }] : [];
  const run = status.ok ? (status.live ?? status.dry) : null;
  const capBps = run?.policy.capBps ?? ("capBps" in stake ? stake.capBps : DEFAULT_CAP_BPS);
  const founder = env.founder ? { full: env.founder, short: shortAddress(env.founder) } : null;

  switch (stake.state) {
    case "not_launched":
      return { state: "not_launched", headline: "Not live yet", lead: "$KESTIV isn't live yet. The first lock opens after launch. The devnet proof below shows the same lock on a test token.", recipient: founder, lockLine: null, budget: null, links: walletLink };
    case "rpc_error":
      return { state: "error", headline: "Can't read the chain", lead: "Couldn't read the chain right now. This refreshes every minute.", recipient: founder, lockLine: null, budget: null, links: walletLink };
    case "no_contract":
      return { state: "no_contract", headline: "0.00%", lead: "of supply. Nothing is locked yet.", recipient: founder, lockLine: null, budget: firstLockBudget(status), links: walletLink };
    case "active":
    case "cap_reached": {
      const capped = stake.state === "cap_reached";
      return {
        state: stake.state,
        headline: formatStakePct(stake.stakePct),
        lead: capped ? `Cap reached at ${capText(capBps).replace(" of supply", "")}. Fees now go straight to the founder. Locked for` : "of supply, locked for",
        recipient: { full: stake.recipient, short: shortAddress(stake.recipient) },
        lockLine: lockLine(stake.flags),
        budget: null,
        links: [{ label: "View on Streamflow", href: streamflowUrl(stake.contractId, stake.cluster === "devnet" ? "devnet" : "mainnet-beta") }, ...walletLink],
      };
    }
  }
}
