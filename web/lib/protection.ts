import type { DevnetProof, StakeView } from "./chain";
import { buyRules } from "./gates";
import { lockPanel, type LockPanelModel } from "./hero";
import type { AgentStatus } from "./status";

export const PROTECTION_TABS = [
  { id: "cancel", label: "Can't be cancelled" },
  { id: "sells", label: "Never sells" },
  { id: "checks", label: "Checks before every buy" },
] as const;

export interface ProtectionModel {
  cancel: {
    heading: string;
    text: string;
    lock: LockPanelModel;
  };
  sells: {
    heading: string;
    text: string;
    repoHref: string | null;
  };
  checks:
    | { kind: "rules"; heading: string; text: string; rules: string[] }
    | { kind: "feed_error"; heading: string; text: string; message: string }
    | { kind: "empty"; heading: string; text: string; message: string };
}

// Verified on devnet: Streamflow's update instruction cannot enable cancel, pause or rate changes. It can enable
// transfer by the recipient, so the agent's signer refuses every Streamflow instruction except create and top-up
// (agent/src/chain/guard.ts).
export const CANCEL_TEXT =
  "Cancel, pause and rate changes are switched off when the contract is created, and Streamflow has no way to switch them on later. Transfer starts off too, and Kestiv's signer refuses the one Streamflow instruction that could turn it on.";

export function protectionModel(args: {
  status: AgentStatus;
  stake: StakeView;
  proof: DevnetProof | null;
  repoUrl?: string;
}): ProtectionModel {
  const { status, stake, proof, repoUrl } = args;
  const run = status.ok ? (status.live ?? status.dry) : null;

  const checksHeading = "Checks before every buy";
  const checksText = "Before any buy, every one of these has to pass. If one fails, Kestiv waits and tries again later.";

  let checks: ProtectionModel["checks"];
  if (!status.ok) {
    checks = {
      kind: "feed_error",
      heading: checksHeading,
      text: checksText,
      message: "We can't reach the agent's reports right now, so the live thresholds can't be shown. Try again in a minute.",
    };
  } else if (!run) {
    checks = { kind: "empty", heading: checksHeading, text: checksText, message: "The agent hasn't reported yet, so there are no thresholds to show." };
  } else {
    checks = { kind: "rules", heading: checksHeading, text: checksText, rules: buyRules(run.gates) };
  }

  return {
    cancel: { heading: "Can't be cancelled", text: CANCEL_TEXT, lock: lockPanel(stake, proof) },
    sells: {
      heading: "Never sells",
      text: "Kestiv can do two things with the token: buy it and lock it. Its code has no way to sell.",
      repoHref: repoUrl ?? null,
    },
    checks,
  };
}
