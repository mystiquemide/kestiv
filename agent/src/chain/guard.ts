import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { Allowlist } from "./allowlist.js";

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
  topLevelProgramIds(tx).forEach((id, i) => {
    if (!has(id)) throw new DisallowedProgramError(id, i);
  });
}
