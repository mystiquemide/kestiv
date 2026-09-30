import type { DevnetProof, StakeView } from "./chain";
import { shortAddress } from "./format";
import { solscanAccount, solscanTx, streamflowUrl, type LinkCluster } from "./links";
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

  if (live) {
    cards.push({
      id: "contract", title: "Vesting contract", value: live.contractId, display: shortAddress(live.contractId),
      href: streamflowUrl(live.contractId, env.cluster), action: "Open Streamflow", devnet: false, ts: null, ago: null,
    });
  } else if (proof) {
    cards.push({
      id: "contract", title: "Vesting contract", value: proof.stream.id, display: shortAddress(proof.stream.id),
      href: streamflowUrl(proof.stream.id, "devnet"), action: "Open Streamflow", devnet: true, ts: null, ago: null,
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
    const cluster: LinkCluster = run?.cluster === "devnet" ? "devnet" : env.cluster;
    cards.push({
      id: "lock", title: "Latest lock", value: lockSig, display: shortAddress(lockSig),
      href: solscanTx(lockSig, cluster), action: "Open Solscan", devnet: false, ts, ago: ts ? timeAgo(ts, now) : null,
    });
  } else if (!live && proof) {
    cards.push({
      id: "lock", title: "Latest lock", value: proof.sigs.topup, display: shortAddress(proof.sigs.topup),
      href: solscanTx(proof.sigs.topup, "devnet"), action: "Open Solscan", devnet: true, ts: null, ago: null,
    });
  }

  const notice =
    stake.state === "rpc_error"
      ? "We couldn't read the chain just now, so the contract and lock shown are the devnet proof. This page checks again every minute."
      : !live && proof
        ? "$KESTIV has no stake contract yet. The devnet proof shows the same lock on a test token."
        : null;
  return { cards, notice };
}
