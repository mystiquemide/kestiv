import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PROGRAMS,
  JUPITER_V6_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  PUMP_PROGRAM_ID,
} from "../src/chain/allowlist.js";
import { DisallowedProgramError, assertAllowedPrograms } from "../src/chain/guard.js";
import { signAndSend } from "../src/chain/send.js";
import { loadFixture } from "./fixtures.js";

const payer = Keypair.generate();
const evil = Keypair.generate().publicKey;
const blockhash = "11111111111111111111111111111111";

const okIx = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: evil, lamports: 1 });
const badIx = new TransactionInstruction({ programId: evil, keys: [], data: Buffer.alloc(0) });

const v0 = (...ixs: TransactionInstruction[]) =>
  new VersionedTransaction(
    new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(),
  );

describe("allowlist ids", () => {
  it("contains the expected programs", () => {
    expect([...ALLOWED_PROGRAMS.values()]).toEqual(
      expect.arrayContaining(["System", "Compute Budget", "SPL Token", "Token-2022", "Associated Token Account", "Streamflow (devnet)"]),
    );
  });

  it("jupiter, pump and pumpswap ids appear in real mainnet fixtures", () => {
    const seen = new Set<string>();
    for (const name of ["bonding-0", "pumpswap-0", "pumpswap-1"]) {
      const { tx } = loadFixture(name);
      for (const i of tx.transaction.message.instructions) seen.add(String(i.programId));
      for (const g of tx.meta?.innerInstructions ?? []) for (const i of g.instructions) seen.add(String(i.programId));
    }
    expect(seen.has(JUPITER_V6_PROGRAM_ID)).toBe(true);
    expect(seen.has(PUMP_PROGRAM_ID)).toBe(true);
    expect(seen.has(PUMPSWAP_PROGRAM_ID)).toBe(true);
  });
});

describe("assertAllowedPrograms", () => {
  it("accepts an allowed v0 message", () => {
    expect(() => assertAllowedPrograms(v0(ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }), okIx), ALLOWED_PROGRAMS)).not.toThrow();
  });

  it("rejects a v0 message with a disallowed program and names it", () => {
    try {
      assertAllowedPrograms(v0(okIx, badIx), ALLOWED_PROGRAMS);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DisallowedProgramError);
      expect((e as DisallowedProgramError).programId).toBe(evil.toBase58());
      expect((e as DisallowedProgramError).instructionIndex).toBe(1);
    }
  });

  it("checks legacy transactions too", () => {
    const ok = new Transaction().add(okIx);
    const bad = new Transaction().add(okIx, badIx);
    expect(() => assertAllowedPrograms(ok, ALLOWED_PROGRAMS)).not.toThrow();
    expect(() => assertAllowedPrograms(bad, ALLOWED_PROGRAMS)).toThrow(DisallowedProgramError);
  });

  it("accepts a plain Set allowlist", () => {
    expect(() => assertAllowedPrograms(v0(okIx), new Set([SystemProgram.programId.toBase58()]))).not.toThrow();
    expect(() => assertAllowedPrograms(v0(okIx), new Set<string>())).toThrow(DisallowedProgramError);
  });
});

describe("signAndSend", () => {
  const conn = () =>
    ({
      sendRawTransaction: vi.fn().mockResolvedValue("SIG"),
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash, lastValidBlockHeight: 10 }),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    }) as unknown as Connection & Record<string, ReturnType<typeof vi.fn>>;

  it("never signs or sends when a program is disallowed", async () => {
    const tx = v0(badIx);
    const sign = vi.spyOn(tx, "sign");
    const c = conn();
    await expect(signAndSend(tx, payer, c, ALLOWED_PROGRAMS)).rejects.toBeInstanceOf(DisallowedProgramError);
    expect(sign).not.toHaveBeenCalled();
    expect(c.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("signs, sends and confirms an allowed transaction", async () => {
    const tx = v0(okIx);
    const sign = vi.spyOn(tx, "sign");
    const c = conn();
    await expect(signAndSend(tx, payer, c, ALLOWED_PROGRAMS)).resolves.toBe("SIG");
    expect(sign).toHaveBeenCalledOnce();
    expect(c.confirmTransaction).toHaveBeenCalledOnce();
  });

  it("throws when confirmation reports an error", async () => {
    const c = conn();
    (c.confirmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({ value: { err: { InstructionError: [0, "x"] } } });
    await expect(signAndSend(v0(okIx), payer, c, ALLOWED_PROGRAMS)).rejects.toThrow(/failed/);
  });
});

