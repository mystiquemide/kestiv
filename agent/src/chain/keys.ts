import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

export function loadKeypair(path: string): Keypair {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("could not read keypair file (missing, unreadable or not JSON)");
  }
  if (!Array.isArray(raw) || raw.length !== 64 || !raw.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    throw new Error("keypair file is not a 64-byte solana-keygen JSON array");
  }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(raw as number[]));
  } catch {
    throw new Error("keypair file holds an invalid secret key");
  }
}
