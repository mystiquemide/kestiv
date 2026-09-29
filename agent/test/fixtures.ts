import { readFileSync } from "node:fs";
import type { ParsedTransactionWithMeta } from "@solana/web3.js";

export interface Fixture {
  mint: string;
  signature: string;
  tx: ParsedTransactionWithMeta;
}

export const loadFixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as Fixture;
