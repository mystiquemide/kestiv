import { ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID as STREAMFLOW_PROGRAM_ID } from "@streamflow/stream";

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
  [STREAMFLOW_PROGRAM_ID.mainnet, "Streamflow (mainnet)"],
  [STREAMFLOW_PROGRAM_ID.devnet, "Streamflow (devnet)"],
]);

export type Allowlist = ReadonlySet<string> | ReadonlyMap<string, string>;
