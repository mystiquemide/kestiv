import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { PROGRAM_ID } from "@streamflow/stream";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PROGRAMS,
  STREAMFLOW_ALLOWED_DISCRIMINATORS,
  STREAMFLOW_CREATE_DISCRIMINATOR,
  STREAMFLOW_TOPUP_DISCRIMINATOR,
} from "../src/chain/allowlist.js";
import { DisallowedProgramError, DisallowedStreamflowInstructionError, assertAllowedPrograms } from "../src/chain/guard.js";
import { signAndSend } from "../src/chain/send.js";

// Real instruction data taken from devnet transactions built by the Streamflow SDK:
// create and topup of the proof contract, its failed cancel, and an update sent from the throwaway probe stream.
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/streamflow-instructions.json", import.meta.url), "utf8")) as Record<
  "create" | "topup" | "cancel" | "update",
  { sig: string; data: string }
>;

const payer = Keypair.generate();
const blockhash = "11111111111111111111111111111111";
const streamflow = new PublicKey(PROGRAM_ID.devnet);
const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

const sfIx = (data: Buffer, program = streamflow) =>
  new TransactionInstruction({ programId: program, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }], data });
const v0 = (...ixs: TransactionInstruction[]) =>
  new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());

describe("streamflow instruction allowlist", () => {
  it("the allowed discriminators are exactly the ones the SDK's create and topup produce", () => {
    expect(fixtures.create.data.slice(0, 16)).toBe(STREAMFLOW_CREATE_DISCRIMINATOR);
    expect(fixtures.topup.data.slice(0, 16)).toBe(STREAMFLOW_TOPUP_DISCRIMINATOR);
    expect([...STREAMFLOW_ALLOWED_DISCRIMINATORS].sort()).toEqual([STREAMFLOW_CREATE_DISCRIMINATOR, STREAMFLOW_TOPUP_DISCRIMINATOR].sort());
  });

  it("allows create and top-up, on devnet and mainnet", () => {
    for (const k of ["create", "topup"] as const) {
      expect(() => assertAllowedPrograms(v0(sfIx(Buffer.from(fixtures[k].data, "hex"))), ALLOWED_PROGRAMS), k).not.toThrow();
    }
    const mainnet = new PublicKey(PROGRAM_ID.mainnet);
    expect(() => assertAllowedPrograms(v0(sfIx(Buffer.from(fixtures.topup.data, "hex"), mainnet)), ALLOWED_PROGRAMS)).not.toThrow();
  });

  it("allows create and top-up in legacy transactions, next to other allowed programs", () => {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }),
      sfIx(Buffer.from(fixtures.create.data, "hex")),
    );
    expect(() => assertAllowedPrograms(tx, ALLOWED_PROGRAMS)).not.toThrow();
  });

  it.each(["update", "cancel"] as const)("refuses the SDK's real %s instruction", (k) => {
    const tx = v0(sfIx(Buffer.from(fixtures[k].data, "hex")));
    expect(() => assertAllowedPrograms(tx, ALLOWED_PROGRAMS)).toThrow(DisallowedStreamflowInstructionError);
  });

  it.each(["transfer_recipient", "pause", "unpause", "withdraw", "create_unchecked", "update_unchecked"])("refuses %s", (name) => {
    const tx = v0(sfIx(Buffer.concat([disc(name), Buffer.alloc(8)])));
    expect(() => assertAllowedPrograms(tx, ALLOWED_PROGRAMS)).toThrow(DisallowedStreamflowInstructionError);
  });

  it("refuses an unknown discriminator and empty data", () => {
    expect(() => assertAllowedPrograms(v0(sfIx(Buffer.from("deadbeefdeadbeef", "hex"))), ALLOWED_PROGRAMS)).toThrow(DisallowedStreamflowInstructionError);
    expect(() => assertAllowedPrograms(v0(sfIx(Buffer.alloc(0))), ALLOWED_PROGRAMS)).toThrow(DisallowedStreamflowInstructionError);
  });

  it("refuses one bad Streamflow instruction hidden behind an allowed one, in legacy transactions too", () => {
    const ok = sfIx(Buffer.from(fixtures.topup.data, "hex"));
    const bad = sfIx(Buffer.from(fixtures.update.data, "hex"));
    expect(() => assertAllowedPrograms(v0(ok, bad), ALLOWED_PROGRAMS)).toThrow(DisallowedStreamflowInstructionError);
    expect(() => assertAllowedPrograms(new Transaction().add(ok, bad), ALLOWED_PROGRAMS)).toThrow(DisallowedStreamflowInstructionError);
  });

  it("uses the same error family as the program allowlist and reports the discriminator", () => {
    try {
      assertAllowedPrograms(v0(sfIx(Buffer.from(fixtures.update.data, "hex"))), ALLOWED_PROGRAMS);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DisallowedProgramError);
      expect((e as DisallowedStreamflowInstructionError).discriminator).toBe(fixtures.update.data.slice(0, 16));
      expect((e as Error).message).toContain("only create and top-up are allowed");
      expect((e as DisallowedProgramError).instructionIndex).toBe(0);
    }
  });

  it("never signs or sends a transaction with an update instruction", async () => {
    const tx = v0(sfIx(Buffer.from(fixtures.update.data, "hex")));
    const sign = vi.spyOn(tx, "sign");
    const conn = { sendRawTransaction: vi.fn(), getLatestBlockhash: vi.fn(), confirmTransaction: vi.fn() } as never;
    await expect(signAndSend(tx, payer, conn, ALLOWED_PROGRAMS)).rejects.toBeInstanceOf(DisallowedStreamflowInstructionError);
    expect(sign).not.toHaveBeenCalled();
    expect((conn as { sendRawTransaction: ReturnType<typeof vi.fn> }).sendRawTransaction).not.toHaveBeenCalled();
  });
});
