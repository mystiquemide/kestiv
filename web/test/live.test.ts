import { describe, expect, it } from "vitest";
import { DEVNET_PROOF, getDevnetProof } from "../lib/chain";

// Reads the real devnet proof contract. Runs only when HELIUS_API_KEY is set (public devnet also works but rate-limits).
describe.skipIf(!process.env.HELIUS_API_KEY)("devnet proof contract (live)", () => {
  it("shows the locked, uncancellable stake and the failed cancel as read from chain", async () => {
    const p = await getDevnetProof();
    const s = p.stream;

    expect(s.id).toBe(DEVNET_PROOF.contractId);
    expect(s.depositedAmount).toBe("150000000000");
    expect(s.withdrawnAmount).toBe("0");
    expect(s.recipient).toBe("DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB");
    expect(s.mint).toBe("4FsVBoTVt4JvTjiiSuYkiWybdY7f3KjSQ4zByQgLQ8u1");
    expect(s.flags).toMatchObject({
      canTopup: true,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      pausable: false,
      canUpdateRate: false,
    });

    expect(p.steps.map((x) => [x.kind, x.amount])).toEqual([
      ["create", "100000000000"],
      ["topup", "50000000000"],
    ]);
    expect(p.steps[0]!.sig).toBe(DEVNET_PROOF.createSig);
    expect(p.steps[1]!.sig).toBe(DEVNET_PROOF.topupSig);

    expect(p.cancel).not.toBeNull();
    expect(p.cancel!.sig).toBe(DEVNET_PROOF.cancelSig);
    expect(p.cancel!.err).toEqual({ InstructionError: [0, { Custom: 131 }] });
    expect(p.cancel!.customCode).toBe(131);
  });
});
