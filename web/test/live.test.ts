import { describe, expect, it } from "vitest";
import { DEVNET_PROOF, getDevnetProof } from "../lib/chain";

// Reads the real devnet proof locks. Runs only when HELIUS_API_KEY is set (public devnet also works but rate-limits).
describe.skipIf(!process.env.HELIUS_API_KEY)("devnet proof locks (live)", () => {
  it("shows two locks nobody can cancel and the failed cancel as read from chain", async () => {
    const p = await getDevnetProof();

    expect(p.mint).toBe(DEVNET_PROOF.mint);
    expect(p.locks.map((l) => l.id)).toEqual(DEVNET_PROOF.locks.map((l) => l.id));
    for (const l of p.locks) {
      expect(l.recipient).toBe("DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB");
      expect(l.mint).toBe(DEVNET_PROOF.mint);
      expect(l.claimed).toBe("0");
      expect(l.cancelMode).toBe(0);
      expect(l.updateRecipientMode).toBe(0);
    }
    expect(p.guarantees).toEqual({ cancelNobody: true, recipientNobody: true });
    expect(p.sigs.locks).toEqual(DEVNET_PROOF.locks.map((l) => l.sig));

    expect(p.cancel).not.toBeNull();
    expect(p.cancel!.sig).toBe(DEVNET_PROOF.cancelSig);
    expect(p.cancel!.customCode).toBe(6005);
  });
});
