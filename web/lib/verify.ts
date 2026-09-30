import type { DevnetProof, StakeView } from "./chain";
import { shortAddress } from "./format";
import { lockUrl, solscanAccount, solscanTx, type LinkCluster } from "./links";
import type { AgentStatus } from "./status";
import { timeAgo } from "./time";

export interface VerifyCard {
  id: "contract" | "wallet" | "lock";
  title: string;
  value: string;
  display: string;
  href: string;
  action: string;
  devnet: boolean;
  /** Set on the lock card when the time is known. */
  ts: number | null;
  ago: string | null;
}

export interface VerifyModel {
  cards: VerifyCard[];
  notice: string | null;
}

/**
 * Three things a reader can check on the chain. A card whose target doesn't exist is left out.
 * Before the contract exists the contract and lock cards point at the devnet proof and say so.
 */
export function verifyModel(args: {
  stake: StakeView;
  status: AgentStatus;
  proof: DevnetProof | null;
  env: { cluster: LinkCluster; wallet?: string };
  now: number;
}): VerifyModel {
  const { stake, status, proof, env, now } = args;
  const cards: VerifyCard[] = [];
  const live = stake.state === "active" || stake.state === "cap_reached" ? stake : null;
  const run = status.ok ? status.live : null;

  const latestLive = live ? live.locks[live.locks.length - 1] : undefined;
  const lockCluster: LinkCluster = live ? (live.cluster === "devnet" ? "devnet" : env.cluster) : "devnet";
  const latestProof = proof?.locks[proof.locks.length - 1];
  const target = latestLive ?? (live ? undefined : latestProof);
  if (target) {
    cards.push({
      id: "contract", title: "Latest lock", value: target.id, display: shortAddress(target.id),
      href: lockUrl(target.id, lockCluster), action: lockCluster === "devnet" ? "Open Solscan" : "Open Jupiter Lock", devnet: !live, ts: null, ago: null,
    });
  }

  if (env.wallet) {
    cards.push({
      id: "wallet", title: "Kestiv wallet", value: env.wallet, display: shortAddress(env.wallet),
      href: solscanAccount(env.wallet, env.cluster), action: "Open Solscan", devnet: false, ts: null, ago: null,
    });
  }

  const lockSig = live ? run?.latest.lockSig : null;
  if (live && lockSig) {
    const ts = run?.latest.lockTs ?? null;
    cards.push({
      id: "lock", title: "Latest buy", value: lockSig, display: shortAddress(lockSig),
      href: solscanTx(lockSig, lockCluster), action: "Open Solscan", devnet: false, ts, ago: ts ? timeAgo(ts, now) : null,
    });
  } else if (!live && proof) {
    const sig = proof.sigs.locks[proof.sigs.locks.length - 1]!;
    cards.push({
      id: "lock", title: "Latest buy", value: sig, display: shortAddress(sig),
      href: solscanTx(sig, "devnet"), action: "Open Solscan", devnet: true, ts: null, ago: null,
    });
  }

  const notice =
    stake.state === "rpc_error"
      ? "We couldn't read the chain just now, so the lock shown is the devnet proof. This page checks again every minute."
      : !live && proof
        ? "$KESTIV has no lock yet. The devnet proof shows the same lock on a test token."
        : null;
  return { cards, notice };
}
