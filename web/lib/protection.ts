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

// Verified on devnet: cancel and change-recipient modes are fixed when a Jupiter lock is created, and a lock created with
// them set to nobody refuses both (Custom error 6005). The agent's signer also refuses every Jupiter Lock instruction
// except create (agent/src/chain/guard.ts).
export const CANCEL_TEXT =
  "Cancel and change-recipient are set to nobody when each lock is created, and Jupiter Lock has no way to switch them on later. Kestiv's signer also refuses every Jupiter Lock instruction except creating a lock.";

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
