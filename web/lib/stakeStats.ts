import type { DevnetProof, StakeView } from "./chain";
import { dateUtc, formatStakePct, tokensFull } from "./format";
import { capText } from "./hero";
import type { AgentStatus } from "./status";
import { DEFAULT_CAP_BPS, vestingNow } from "./vesting";

export interface StatCell {
  label: string;
  value: string;
  sub: string | null;
  mono: boolean;
  tone: "default" | "brass";
}

export interface StakeStatsModel {
  /** Where the first three numbers come from. Null for the live contract. */
  label: "Devnet proof" | null;
  cells: StatCell[];
}

const NONE = "None yet";

/** Locked, vested and next unlock come from the live contract, or from the labelled devnet proof before there is one. */
export function stakeStats(args: {
  stake: StakeView;
  status: AgentStatus;
  proof: DevnetProof | null;
  devnetDecimals: number | null;
  now: number;
}): StakeStatsModel {
  const { stake, status, proof, devnetDecimals, now } = args;
  const run = status.ok ? (status.live ?? status.dry) : null;
  const capBps = run?.policy.capBps ?? ("capBps" in stake ? stake.capBps : DEFAULT_CAP_BPS);
  const live = stake.state === "active" || stake.state === "cap_reached" ? stake : null;

  const cap: StatCell = {
    label: "Cap",
    value: capText(capBps),
    sub: live ? `Stake is ${formatStakePct(live.stakePct)} now` : "Buying stops at the cap",
    mono: false,
    tone: "default",
  };

  let locked: string | null = null;
  let vested: string | null = null;
  let next: number | null | undefined;
  let label: StakeStatsModel["label"] = null;

  if (live) {
    locked = tokensFull(live.locked, live.decimals);
    vested = tokensFull(live.vested, live.decimals);
    next = live.nextUnlock;
  } else if (proof && devnetDecimals !== null) {
    const s = proof.stream;
    const v = vestingNow(
      { depositedAmount: s.depositedAmount, withdrawnAmount: s.withdrawnAmount, cliff: s.cliff, cliffAmount: s.cliffAmount, end: s.end, period: s.period, amountPerPeriod: s.amountPerPeriod },
      now,
    );
    locked = tokensFull(v.locked, devnetDecimals);
    vested = tokensFull(v.vested, devnetDecimals);
    next = v.nextUnlock;
    label = "Devnet proof";
  }

  const cells: StatCell[] =
    locked === null || vested === null
      ? [
          { label: "Locked", value: NONE, sub: null, mono: false, tone: "default" },
          { label: "Vested so far", value: NONE, sub: null, mono: false, tone: "default" },
          { label: "Next unlock", value: "After the first lock", sub: null, mono: false, tone: "default" },
        ]
      : [
          { label: "Locked", value: locked, sub: "tokens", mono: true, tone: "brass" },
          { label: "Vested so far", value: vested, sub: "tokens", mono: true, tone: "default" },
          {
            label: "Next unlock",
            value: next === null || next === undefined ? "Fully unlocked" : dateUtc(next),
            sub: null,
            mono: next !== null && next !== undefined,
            tone: "default",
          },
        ];

  return { label, cells: [...cells, cap] };
}
