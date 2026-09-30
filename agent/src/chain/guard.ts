import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { LOCKER_ALLOWED_DISCRIMINATORS, LOCKER_PROGRAM_IDS, type Allowlist } from "./allowlist.js";

export class DisallowedProgramError extends Error {
  readonly programId: string;
  readonly instructionIndex: number;

  constructor(programId: string, instructionIndex: number) {
    super(`instruction ${instructionIndex} invokes program ${programId}, which is not in the signing allowlist`);
    this.name = "DisallowedProgramError";
    this.programId = programId;
    this.instructionIndex = instructionIndex;
  }
}

export class DisallowedLockInstructionError extends DisallowedProgramError {
  readonly discriminator: string;

  constructor(programId: string, instructionIndex: number, discriminator: string) {
    super(programId, instructionIndex);
    this.message = `instruction ${instructionIndex} calls Jupiter Lock with discriminator ${discriminator}, only creating a lock is allowed`;
    this.name = "DisallowedLockInstructionError";
    this.discriminator = discriminator;
  }
}

function topLevelInstructions(tx: VersionedTransaction | Transaction): { programId: string; data: Uint8Array }[] {
  if ("message" in tx) {
    const ids = topLevelProgramIds(tx);
    return tx.message.compiledInstructions.map((ix, i) => ({ programId: ids[i]!, data: ix.data }));
  }
  return tx.instructions.map((ix) => ({ programId: ix.programId.toBase58(), data: ix.data }));
}

export function topLevelProgramIds(tx: VersionedTransaction | Transaction): string[] {
  if ("message" in tx) {
    const keys = tx.message.staticAccountKeys;
    return tx.message.compiledInstructions.map((ix, i) => {
      const key = keys[ix.programIdIndex];
      if (!key) throw new DisallowedProgramError(`<unresolvable index ${ix.programIdIndex}>`, i);
      return key.toBase58();
    });
  }
  return tx.instructions.map((ix) => ix.programId.toBase58());
}

export function assertAllowedPrograms(tx: VersionedTransaction | Transaction, allowlist: Allowlist): void {
  const has = (id: string) => (allowlist instanceof Map ? allowlist.has(id) : (allowlist as ReadonlySet<string>).has(id));
  topLevelInstructions(tx).forEach(({ programId, data }, i) => {
    if (!has(programId)) throw new DisallowedProgramError(programId, i);
    if (LOCKER_PROGRAM_IDS.has(programId)) {
      const discriminator = Buffer.from(data.subarray(0, 8)).toString("hex");
      if (!LOCKER_ALLOWED_DISCRIMINATORS.has(discriminator)) throw new DisallowedLockInstructionError(programId, i, discriminator);
    }
  });
}
