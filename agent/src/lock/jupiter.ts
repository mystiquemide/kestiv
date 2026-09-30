import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/**
 * Jupiter Lock ("locker") program, the same address on mainnet and devnet.
 * Everything below was read from the program's interface and checked against real devnet transactions:
 * agent/test/fixtures/jupiter-lock-create.json holds the bytes a reference client produced for fixed inputs,
 * and test/jupiter-lock.test.ts requires this builder to match them exactly.
 */
export const LOCKER_PROGRAM_ID = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

/** First 8 bytes of instruction data. Only `create_vesting_escrow_v2` is ever signed by Kestiv. */
export const CREATE_VESTING_ESCROW_V2 = Buffer.from("b59b68b7b680232f", "hex");
/** For reference and for the signer's refusal list: cancel, update recipient. */
export const CANCEL_VESTING_ESCROW = Buffer.from("d9e90d038f6535c9", "hex");
export const UPDATE_VESTING_ESCROW_RECIPIENT = Buffer.from("1af27fffed6d2fce", "hex");

export const ESCROW_ACCOUNT_DISCRIMINATOR = Buffer.from("f477b704497487c3", "hex");
export const ESCROW_ACCOUNT_SIZE = 296;

/** Permission modes, chosen once at creation and never changeable: 0 means nobody. */
export const MODE_NOBODY = 0;

export interface LockParams {
  vestingStartTime: bigint;
  cliffTime: bigint;
  /** Seconds between unlocks. */
  frequency: bigint;
  cliffUnlockAmount: bigint;
  amountPerPeriod: bigint;
  numberOfPeriod: bigint;
  updateRecipientMode: number;
  cancelMode: number;
}

export const escrowAddress = (base: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("escrow"), base.toBuffer()], LOCKER_PROGRAM_ID)[0];

export const eventAuthority = (): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], LOCKER_PROGRAM_ID)[0];

export function encodeCreateData(p: LockParams): Buffer {
  const data = Buffer.alloc(63);
  CREATE_VESTING_ESCROW_V2.copy(data, 0);
  let o = 8;
  for (const v of [p.vestingStartTime, p.cliffTime, p.frequency, p.cliffUnlockAmount, p.amountPerPeriod, p.numberOfPeriod]) {
    data.writeBigUInt64LE(v, o);
    o += 8;
  }
  data.writeUInt8(p.updateRecipientMode, o++);
  data.writeUInt8(p.cancelMode, o++);
  // remaining_accounts_info: Some with no slices (only needed for mints with transfer hooks)
  data.writeUInt8(1, o++);
  data.writeUInt32LE(0, o);
  return data;
}

export interface CreateLockAccounts {
  base: PublicKey;
  sender: PublicKey;
  senderToken: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
}

export function createLockInstruction(a: CreateLockAccounts, p: LockParams): TransactionInstruction {
  const escrow = escrowAddress(a.base);
  const escrowToken = getAssociatedTokenAddressSync(a.mint, escrow, true, a.tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  return new TransactionInstruction({
    programId: LOCKER_PROGRAM_ID,
    keys: [
      { pubkey: a.base, isSigner: true, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: a.mint, isSigner: false, isWritable: false },
      { pubkey: escrowToken, isSigner: false, isWritable: true },
      { pubkey: a.sender, isSigner: true, isWritable: true },
      { pubkey: a.senderToken, isSigner: false, isWritable: true },
      { pubkey: a.recipient, isSigner: false, isWritable: false },
      { pubkey: a.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(), isSigner: false, isWritable: false },
      { pubkey: LOCKER_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: encodeCreateData(p),
  });
}

export interface BuiltLock {
  instructions: TransactionInstruction[];
  /** One-time signer that makes the escrow address unique. */
  base: Keypair;
  escrow: PublicKey;
  params: LockParams;
  deposited: bigint;
}

/** The escrow's token account is created first (idempotent), then the lock. The sender's own token account already holds the tokens. */
export function buildLock(p: {
  sender: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  recipient: PublicKey;
  params: LockParams;
  base?: Keypair;
}): BuiltLock {
  const base = p.base ?? Keypair.generate();
  const escrow = escrowAddress(base.publicKey);
  const escrowToken = getAssociatedTokenAddressSync(p.mint, escrow, true, p.tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const senderToken = getAssociatedTokenAddressSync(p.mint, p.sender, false, p.tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(p.sender, escrowToken, escrow, p.mint, p.tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID),
    createLockInstruction(
      { base: base.publicKey, sender: p.sender, senderToken, recipient: p.recipient, mint: p.mint, tokenProgram: p.tokenProgram },
      p.params,
    ),
  ];
  return { instructions, base, escrow, params: p.params, deposited: depositedOf(p.params) };
}

// ---------- reading a lock from the chain ----------

export interface EscrowState {
  escrow: string;
  recipient: string;
  mint: string;
  creator: string;
  base: string;
  updateRecipientMode: number;
  cancelMode: number;
  /** 0 classic token program, 1 Token-2022. */
  tokenProgramFlag: number;
  cliffTime: bigint;
  frequency: bigint;
  cliffUnlockAmount: bigint;
  amountPerPeriod: bigint;
  numberOfPeriod: bigint;
  totalClaimedAmount: bigint;
  vestingStartTime: bigint;
  cancelledAt: bigint;
}

export function parseEscrow(escrow: string, data: Buffer): EscrowState {
  if (data.length !== ESCROW_ACCOUNT_SIZE || !data.subarray(0, 8).equals(ESCROW_ACCOUNT_DISCRIMINATOR)) {
    throw new Error(`account ${escrow} is not a Jupiter Lock escrow`);
  }
  const key = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  return {
    escrow,
    recipient: key(8),
    mint: key(40),
    creator: key(72),
    base: key(104),
    updateRecipientMode: data.readUInt8(137),
    cancelMode: data.readUInt8(138),
    tokenProgramFlag: data.readUInt8(139),
    cliffTime: data.readBigUInt64LE(144),
    frequency: data.readBigUInt64LE(152),
    cliffUnlockAmount: data.readBigUInt64LE(160),
    amountPerPeriod: data.readBigUInt64LE(168),
    numberOfPeriod: data.readBigUInt64LE(176),
    totalClaimedAmount: data.readBigUInt64LE(184),
    vestingStartTime: data.readBigUInt64LE(192),
    cancelledAt: data.readBigUInt64LE(200),
  };
}

type Schedule = Pick<LockParams, "cliffUnlockAmount" | "amountPerPeriod" | "numberOfPeriod">;

/** Everything the lock will ever hold. */
export const depositedOf = (s: Schedule): bigint => s.cliffUnlockAmount + s.amountPerPeriod * s.numberOfPeriod;

/**
 * Unlock rule, measured on devnet with a 10 second schedule: nothing before the cliff, and nothing at the cliff itself.
 * Each full period after the cliff releases one equal share, so the first unlock is one period after the cliff.
 */
export function unlockedAt(s: Schedule & { cliffTime: bigint; frequency: bigint }, nowSec: bigint): bigint {
  if (nowSec < s.cliffTime || s.frequency <= 0n) return 0n;
  const elapsed = (nowSec - s.cliffTime) / s.frequency;
  const periods = elapsed < s.numberOfPeriod ? elapsed : s.numberOfPeriod;
  return s.cliffUnlockAmount + s.amountPerPeriod * periods;
}
