import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

export const ENV_VARS = [
  "KESTIV_KEYPAIR_PATH",
  "FOUNDER_WALLET",
  "KESTIV_MINT",
  "CLAWPUMP_API_KEY",
  "HELIUS_API_KEY",
  "JUPITER_API_KEY",
  "USEPOD_MODEL",
  "STATUS_PORT",
] as const;

export type EnvVar = (typeof ENV_VARS)[number];
export type EnvSource = Record<string, string | undefined>;

const OPTIONAL_VARS: readonly EnvVar[] = ["JUPITER_API_KEY", "USEPOD_MODEL", "STATUS_PORT"];

export class ConfigError extends Error {
  readonly missing: string[];
  readonly invalid: string[];

  constructor(missing: string[], invalid: string[]) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
    if (invalid.length) parts.push(`invalid: ${invalid.join(", ")}`);
    super(`Invalid configuration (${parts.join("; ")})`);
    this.name = "ConfigError";
    this.missing = missing;
    this.invalid = invalid;
  }
}

const isPubkey = (value: string): boolean => {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
};

const pubkey = z.string().refine(isPubkey);
const nonEmpty = z.string().min(1);

const schema = z.object({
  KESTIV_KEYPAIR_PATH: nonEmpty,
  FOUNDER_WALLET: pubkey,
  KESTIV_MINT: pubkey,
  CLAWPUMP_API_KEY: nonEmpty,
  HELIUS_API_KEY: nonEmpty,
  JUPITER_API_KEY: nonEmpty.optional(),
  USEPOD_MODEL: nonEmpty.default("deepseek-v4-flash"),
  STATUS_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
});

export type Config = z.infer<typeof schema>;

export function readEnv(base: EnvSource = process.env): EnvSource {
  const file = base.KESTIV_ENV_FILE || ".env";
  const fromFile: EnvSource = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const merged: EnvSource = {};
  for (const name of ENV_VARS) {
    const value = base[name] || fromFile[name];
    if (value !== undefined && value !== "") merged[name] = value;
  }
  return merged;
}

export function loadConfig(env: EnvSource = readEnv()): Config {
  const result = schema.safeParse(env);
  if (result.success) return result.data;
  const missing = new Set<string>();
  const invalid = new Set<string>();
  for (const issue of result.error.issues) {
    const name = String(issue.path[0]);
    if (env[name] === undefined) missing.add(name);
    else invalid.add(name);
  }
  throw new ConfigError([...missing], [...invalid]);
}

export type VarState = "set" | "missing" | "invalid";

export function inspectEnv(env: EnvSource = readEnv()): Record<EnvVar, VarState> {
  const out = {} as Record<EnvVar, VarState>;
  for (const name of ENV_VARS) {
    const value = env[name];
    if (value === undefined) out[name] = "missing";
    else if ((name === "FOUNDER_WALLET" || name === "KESTIV_MINT") && !isPubkey(value)) out[name] = "invalid";
    else if (name === "STATUS_PORT" && !schema.shape.STATUS_PORT.safeParse(value).success) out[name] = "invalid";
    else out[name] = "set";
  }
  return out;
}

export const isOptionalVar = (name: EnvVar): boolean => OPTIONAL_VARS.includes(name);
