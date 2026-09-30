import { readFileSync } from "node:fs";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { describe, expect, it, vi } from "vitest";
import { ALLOWED_PROGRAMS, LOCKER_ALLOWED_DISCRIMINATORS } from "../src/chain/allowlist.js";
import { DisallowedLockInstructionError, DisallowedProgramError, assertAllowedPrograms } from "../src/chain/guard.js";
import { signAndSend } from "../src/chain/send.js";
import {
  CANCEL_VESTING_ESCROW,
  CREATE_VESTING_ESCROW_V2,
  ESCROW_ACCOUNT_DISCRIMINATOR,
  ESCROW_ACCOUNT_SIZE,
  LOCKER_PROGRAM_ID,
  UPDATE_VESTING_ESCROW_RECIPIENT,
  buildLock,
  createLockInstruction,
  depositedOf,
  encodeCreateData,
  escrowAddress,
  parseEscrow,
  unlockedAt,
  type LockParams,
} from "../src/lock/jupiter.js";
import { LockTermsError, assertLockTerms, type FounderLock } from "../src/lock/read.js";
import { DUST_TOKENS, FOUNDER_TERMS, PERIODS, founderLockParams } from "../src/lock/terms.js";

interface Fixture {
  label: string;
  tokenProgram: string;
  base: string;
  sender: string;
  senderToken: string;
  recipient: string;
  mint: string;
  params: Record<string, string | number>;
  accounts: { address: string; role: number }[];
  dataHex: string;
}
// What a reference client produced for fixed inputs. Roles: 0 read-only, 1 writable, 2 read-only signer, 3 writable signer.
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/jupiter-lock-create.json", import.meta.url), "utf8")) as Fixture[];
const roleOf = (k: { isSigner: boolean; isWritable: boolean }) => (k.isSigner ? (k.isWritable ? 3 : 2) : k.isWritable ? 1 : 0);
const paramsOf = (f: Fixture): LockParams => ({
  vestingStartTime: BigInt(f.params.vestingStartTime!),
  cliffTime: BigInt(f.params.cliffTime!),
  frequency: BigInt(f.params.frequency!),
  cliffUnlockAmount: BigInt(f.params.cliffUnlockAmount!),
  amountPerPeriod: BigInt(f.params.amountPerPeriod!),
  numberOfPeriod: BigInt(f.params.numberOfPeriod!),
  updateRecipientMode: Number(f.params.updateRecipientMode),
  cancelMode: Number(f.params.cancelMode),
});

describe("create instruction matches the reference client byte for byte", () => {
  it.each(fixtures.map((f) => [f.label, f] as const))("%s", (_label, f) => {
    const ix = createLockInstruction(
      { base: new PublicKey(f.base), sender: new PublicKey(f.sender), senderToken: new PublicKey(f.senderToken), recipient: new PublicKey(f.recipient), mint: new PublicKey(f.mint), tokenProgram: new PublicKey(f.tokenProgram) },
      paramsOf(f),
    );
    expect(ix.programId.toBase58()).toBe(LOCKER_PROGRAM_ID.toBase58());
    expect(ix.data.toString("hex")).toBe(f.dataHex);
    expect(ix.keys.map((k) => ({ address: k.pubkey.toBase58(), role: roleOf(k) }))).toEqual(f.accounts);
  });

  it("the derived escrow address is the one the reference client used", () => {
    for (const f of fixtures) expect(escrowAddress(new PublicKey(f.base)).toBase58()).toBe(f.accounts[1]!.address);
  });

  it("the first 8 bytes are the discriminator the signer allows", () => {
    expect(CREATE_VESTING_ESCROW_V2.toString("hex")).toBe("b59b68b7b680232f");
    expect([...LOCKER_ALLOWED_DISCRIMINATORS]).toEqual([CREATE_VESTING_ESCROW_V2.toString("hex")]);
    expect(encodeCreateData(paramsOf(fixtures[0]!)).subarray(0, 8).equals(CREATE_VESTING_ESCROW_V2)).toBe(true);
  });
});

describe("founder lock terms", () => {
  const NOW = 1_790_000_000;

  it("90 day cliff, no lump, 365 daily periods, cancel and change-recipient both nobody", () => {
    const p = founderLockParams(NOW, 365_000_000_000n);
    expect(p).toEqual({
      vestingStartTime: BigInt(NOW),
      cliffTime: BigInt(NOW + 90 * 86_400),
      frequency: 86_400n,
      cliffUnlockAmount: 0n,
      amountPerPeriod: 1_000_000_000n,
      numberOfPeriod: 365n,
      updateRecipientMode: 0,
      cancelMode: 0,
    });
    expect(PERIODS).toBe(365);
    expect(FOUNDER_TERMS.cliffSeconds).toBe(90 * 86_400);
  });

  it("rounds the daily share down, leaving fewer than 365 raw units in the wallet, far below dust", () => {
    const amount = 1_763_352_433_045n;
    const p = founderLockParams(NOW, amount);
    const left = amount - depositedOf(p);
    expect(left).toBeGreaterThanOrEqual(0n);
    expect(left).toBeLessThan(365n);
    expect(left).toBeLessThan(DUST_TOKENS);
  });

  it("refuses an amount too small to split into 365 shares", () => {
    expect(() => founderLockParams(NOW, 364n)).toThrow(/too small/);
  });

  it("builds the lock with the escrow token account created first, for either token program", () => {
    for (const tokenProgram of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      const sender = Keypair.generate().publicKey, mint = Keypair.generate().publicKey, recipient = Keypair.generate().publicKey;
      const built = buildLock({ sender, mint, tokenProgram, recipient, params: founderLockParams(NOW, 10_000_000_000n) });
      expect(built.instructions).toHaveLength(2);
      expect(built.instructions[0]!.programId.toBase58()).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
      expect(built.instructions[1]!.programId.toBase58()).toBe(LOCKER_PROGRAM_ID.toBase58());
      expect(built.escrow.toBase58()).toBe(escrowAddress(built.base.publicKey).toBase58());
      expect(built.instructions[1]!.keys[5]!.pubkey.toBase58()).toBe(getAssociatedTokenAddressSync(mint, sender, false, tokenProgram).toBase58());
      expect(built.deposited).toBe(depositedOf(built.params));
    }
  });
});

describe("unlock rule (measured on devnet with a 10 second schedule)", () => {
  const s = { cliffTime: 1_000n, frequency: 10n, cliffUnlockAmount: 0n, amountPerPeriod: 100n, numberOfPeriod: 8n };
  it("nothing before the cliff, and nothing at the cliff itself", () => {
    expect(unlockedAt(s, 999n)).toBe(0n);
    expect(unlockedAt(s, 1_000n)).toBe(0n);
    expect(unlockedAt(s, 1_009n)).toBe(0n);
  });
  it("one equal share per full period after the cliff, floored", () => {
    expect(unlockedAt(s, 1_010n)).toBe(100n);
    expect(unlockedAt(s, 1_025n)).toBe(200n);
    expect(unlockedAt(s, 1_061n)).toBe(600n);
  });
  it("caps at the deposit and adds a cliff lump when there is one", () => {
    expect(unlockedAt(s, 99_999n)).toBe(800n);
    expect(unlockedAt({ ...s, cliffUnlockAmount: 50n }, 1_010n)).toBe(150n);
    expect(depositedOf(s)).toBe(800n);
  });
});

function escrowBuffer(over: { recipient?: PublicKey; mint?: PublicKey; creator?: PublicKey; mode?: number; cancel?: number; cancelledAt?: bigint } = {}): { data: Buffer; keys: Record<string, PublicKey> } {
  const keys = { recipient: over.recipient ?? Keypair.generate().publicKey, mint: over.mint ?? Keypair.generate().publicKey, creator: over.creator ?? Keypair.generate().publicKey, base: Keypair.generate().publicKey };
  const d = Buffer.alloc(ESCROW_ACCOUNT_SIZE);
  ESCROW_ACCOUNT_DISCRIMINATOR.copy(d, 0);
  keys.recipient.toBuffer().copy(d, 8);
  keys.mint.toBuffer().copy(d, 40);
  keys.creator.toBuffer().copy(d, 72);
  keys.base.toBuffer().copy(d, 104);
  d.writeUInt8(over.mode ?? 0, 137);
  d.writeUInt8(over.cancel ?? 0, 138);
  d.writeUInt8(1, 139);
  d.writeBigUInt64LE(1_797_776_000n, 144);
  d.writeBigUInt64LE(86_400n, 152);
  d.writeBigUInt64LE(0n, 160);
  d.writeBigUInt64LE(1_000_000_000n, 168);
  d.writeBigUInt64LE(365n, 176);
  d.writeBigUInt64LE(0n, 184);
  d.writeBigUInt64LE(1_790_000_000n, 192);
  d.writeBigUInt64LE(over.cancelledAt ?? 0n, 200);
  return { data: d, keys };
}

describe("reading a lock back from the chain", () => {
  it("decodes every field at its offset", () => {
    const { data, keys } = escrowBuffer();
    const e = parseEscrow("ESC", data);
    expect(e).toMatchObject({ escrow: "ESC", recipient: keys.recipient!.toBase58(), mint: keys.mint!.toBase58(), creator: keys.creator!.toBase58(), base: keys.base!.toBase58(), updateRecipientMode: 0, cancelMode: 0, tokenProgramFlag: 1, cliffTime: 1_797_776_000n, frequency: 86_400n, amountPerPeriod: 1_000_000_000n, numberOfPeriod: 365n, vestingStartTime: 1_790_000_000n, cancelledAt: 0n });
    expect(depositedOf(e)).toBe(365_000_000_000n);
  });

  it("refuses anything that is not an escrow", () => {
    expect(() => parseEscrow("X", Buffer.alloc(296))).toThrow(/not a Jupiter Lock escrow/);
    expect(() => parseEscrow("X", Buffer.alloc(10))).toThrow(/not a Jupiter Lock escrow/);
  });

  const lockFrom = (b: { data: Buffer; keys: Record<string, PublicKey> }): { lock: FounderLock; expected: { recipient: string; mint: string; sender: string } } => {
    const e = parseEscrow("ESC", b.data);
    return { lock: { ...e, deposited: depositedOf(e) }, expected: { recipient: b.keys.recipient!.toBase58(), mint: b.keys.mint!.toBase58(), sender: b.keys.creator!.toBase58() } };
  };

  it("accepts exactly the founder terms", () => {
    const { lock, expected } = lockFrom(escrowBuffer());
    lock.cliffTime = lock.vestingStartTime + 7_776_000n;
    expect(() => assertLockTerms(lock, expected)).not.toThrow();
  });

  it("reports every violation at once", () => {
    const b = escrowBuffer({ mode: 2, cancel: 3, cancelledAt: 5n });
    const { lock, expected } = lockFrom(b);
    lock.cliffTime = lock.vestingStartTime + 7_776_000n;
    expect(() => assertLockTerms({ ...lock, recipient: "OTHER", mint: "M", creator: "C" }, expected)).toThrow(LockTermsError);
    try {
      assertLockTerms({ ...lock, recipient: "OTHER", mint: "M", creator: "C" }, expected);
    } catch (e) {
      expect((e as LockTermsError).violations).toEqual(
        expect.arrayContaining(["recipient mismatch", "mint mismatch", "creator mismatch", "cancel must be nobody", "changing the recipient must be nobody", "lock was cancelled"]),
      );
    }
  });

  it("rejects a schedule that is not the founder schedule", () => {
    const { lock, expected } = lockFrom(escrowBuffer());
    lock.cliffTime = lock.vestingStartTime + 7_776_000n;
    expect(() => assertLockTerms({ ...lock, frequency: 3_600n }, expected)).toThrow(/daily/);
    expect(() => assertLockTerms({ ...lock, numberOfPeriod: 100n }, expected)).toThrow(/365/);
    expect(() => assertLockTerms({ ...lock, cliffUnlockAmount: 1n }, expected)).toThrow(/lump/);
    expect(() => assertLockTerms({ ...lock, cliffTime: lock.vestingStartTime + 60n }, expected)).toThrow(/90 days/);
  });
});

describe("the signer only ever signs creating a lock", () => {
  const payer = Keypair.generate();
  const blockhash = "11111111111111111111111111111111";
  const lockIx = (data: Buffer) =>
    new TransactionInstruction({ programId: LOCKER_PROGRAM_ID, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }], data });
  const v0 = (...ixs: TransactionInstruction[]) =>
    new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
  const create = () => buildLock({ sender: payer.publicKey, mint: Keypair.generate().publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID, recipient: Keypair.generate().publicKey, params: founderLockParams(1_790_000_000, 10_000_000_000n) });

  it("allows the real create transaction, legacy or versioned, next to other allowed programs", () => {
    const built = create();
    expect(() => assertAllowedPrograms(v0(...built.instructions), ALLOWED_PROGRAMS)).not.toThrow();
    const legacy = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }), ...built.instructions);
    expect(() => assertAllowedPrograms(legacy, ALLOWED_PROGRAMS)).not.toThrow();
  });

  it.each([
    ["cancel", CANCEL_VESTING_ESCROW],
    ["update recipient", UPDATE_VESTING_ESCROW_RECIPIENT],
    ["claim", Buffer.from("deaddeaddeaddead", "hex")],
    ["empty data", Buffer.alloc(0)],
  ])("refuses %s", (_name, disc) => {
    expect(() => assertAllowedPrograms(v0(lockIx(Buffer.concat([disc, Buffer.alloc(8)]))), ALLOWED_PROGRAMS)).toThrow(DisallowedLockInstructionError);
  });

  it("refuses one bad lock instruction hidden behind a good one, in either transaction type", () => {
    const good = create().instructions[1]!;
    const bad = lockIx(Buffer.concat([CANCEL_VESTING_ESCROW, Buffer.alloc(8)]));
    expect(() => assertAllowedPrograms(v0(good, bad), ALLOWED_PROGRAMS)).toThrow(DisallowedLockInstructionError);
    expect(() => assertAllowedPrograms(new Transaction().add(good, bad), ALLOWED_PROGRAMS)).toThrow(DisallowedLockInstructionError);
  });

  it("uses the same error family as the program allowlist and names the discriminator", () => {
    try {
      assertAllowedPrograms(v0(lockIx(Buffer.concat([CANCEL_VESTING_ESCROW, Buffer.alloc(8)]))), ALLOWED_PROGRAMS);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DisallowedProgramError);
      expect((e as DisallowedLockInstructionError).discriminator).toBe(CANCEL_VESTING_ESCROW.toString("hex"));
    }
  });

  it("never signs or sends a cancel", async () => {
    const connection = { sendRawTransaction: vi.fn(), getLatestBlockhash: vi.fn() } as never;
    const tx = v0(lockIx(Buffer.concat([CANCEL_VESTING_ESCROW, Buffer.alloc(8)])));
    await expect(signAndSend(tx, payer, connection, ALLOWED_PROGRAMS)).rejects.toThrow(DisallowedLockInstructionError);
    expect((connection as { sendRawTransaction: ReturnType<typeof vi.fn> }).sendRawTransaction).not.toHaveBeenCalled();
    expect(tx.signatures.every((s) => s.every((b) => b === 0))).toBe(true);
  });

  it("Streamflow is no longer a signable program", () => {
    expect(ALLOWED_PROGRAMS.has("strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m")).toBe(false);
    expect(ALLOWED_PROGRAMS.get(LOCKER_PROGRAM_ID.toBase58())).toBe("Jupiter Lock");
  });
});
