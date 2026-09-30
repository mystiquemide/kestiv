import { ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CREATE_VESTING_ESCROW_V2, LOCKER_PROGRAM_ID } from "../lock/jupiter.js";

// Jupiter v6, pump.fun and PumpSwap ids were read out of real mainnet transactions
// (agent/test/fixtures) and are asserted against those fixtures in test/allowlist.test.ts.
export const JUPITER_V6_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMPSWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

export const ALLOWED_PROGRAMS: ReadonlyMap<string, string> = new Map([
  [SystemProgram.programId.toBase58(), "System"],
  [ComputeBudgetProgram.programId.toBase58(), "Compute Budget"],
  [TOKEN_PROGRAM_ID.toBase58(), "SPL Token"],
  [TOKEN_2022_PROGRAM_ID.toBase58(), "Token-2022"],
  [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), "Associated Token Account"],
  [JUPITER_V6_PROGRAM_ID, "Jupiter v6"],
  [PUMP_PROGRAM_ID, "pump.fun bonding curve"],
  [PUMPSWAP_PROGRAM_ID, "PumpSwap AMM"],
  [LOCKER_PROGRAM_ID.toBase58(), "Jupiter Lock"],
]);

export type Allowlist = ReadonlySet<string> | ReadonlyMap<string, string>;

// First 8 bytes of instruction data (the Anchor discriminator) of the only Jupiter Lock instruction the agent builds.
// It is asserted against the instruction the builder produces in test/jupiter-lock.test.ts.
// Every other Jupiter Lock instruction (cancel, update recipient, claim, close, ...) is refused at signing.
export const LOCKER_ALLOWED_DISCRIMINATORS: ReadonlySet<string> = new Set([CREATE_VESTING_ESCROW_V2.toString("hex")]);
export const LOCKER_PROGRAM_IDS: ReadonlySet<string> = new Set([LOCKER_PROGRAM_ID.toBase58()]);
