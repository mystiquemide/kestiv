#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import {
  ENV_VARS,
  ConfigError,
  inspectEnv,
  isOptionalVar,
  loadConfig,
  readEnv,
  resolveRpc,
  type Cluster,
  type DryRunConfig,
} from "./config.js";
import { FOUNDER_TERMS } from "./lock/terms.js";
import { formatRun } from "./loop/format.js";
import { runOnce } from "./loop/run.js";
import type { RunResult } from "./loop/types.js";
import { buildPorts } from "./loop/wiring.js";
import { checkCap, loadPolicy } from "./policy.js";
import { buildPublicStatus, setNextRunAt, statusPaths, writePublicStatus } from "./status/public.js";
import { createStatusServer } from "./status/server.js";
import { Store, WriteOnceError, resolveDbPath } from "./store/index.js";

const SLICE_STATUSES = ["pending", "bought", "locked", "failed"] as const;

function status(): void {
  const env = readEnv();
  const states = inspectEnv(env);
  console.log("Config");
  for (const name of ENV_VARS) {
    const suffix = states[name] === "missing" && isOptionalVar(name) ? " (optional)" : "";
    console.log(`  ${name.padEnd(20)} ${states[name]}${suffix}`);
  }

  const cluster: Cluster = env.SOLANA_CLUSTER === "devnet" ? "devnet" : "mainnet-beta";
  const rpc = resolveRpc({
    SOLANA_CLUSTER: cluster,
    SOLANA_RPC_URL: states.SOLANA_RPC_URL === "set" ? env.SOLANA_RPC_URL : undefined,
    HELIUS_API_KEY: env.HELIUS_API_KEY,
  });
  console.log(`\nCluster   ${cluster} (rpc: ${rpc.kind})`);

  const dbPath = resolveDbPath();
  console.log(`Database  ${dbPath}`);
  const store = Store.open(dbPath);
  try {
    console.log(`Mint      ${store.getConfig("mint") ?? "not initialised"}`);
    const locks = store.allLocks();
    console.log(`Locks     ${locks.length === 0 ? "none yet" : `${locks.length} (latest ${locks[locks.length - 1]!.escrow})`}`);
    const counts = store.sliceCountsByStatus();
    console.log("Slices    " + SLICE_STATUSES.map((s) => `${s}=${counts[s] ?? 0}`).join(" "));
    const cooldown = Number(store.getConfig("cooldown_until") ?? 0);
    if (cooldown > Date.now() / 1000) console.log(`Cooldown  until ${new Date(cooldown * 1000).toISOString()}`);
    const run = store.lastRun();
    if (!run) {
      console.log("Last run  none");
    } else {
      console.log(`Last run  #${run.id} ${run.state ?? "-"} ${run.reason ?? ""} ${run.ts ? new Date(run.ts * 1000).toISOString() : ""}`.trimEnd());
      const details = run.details ? (JSON.parse(run.details) as { budget?: Record<string, number>; dry?: boolean }) : undefined;
      if (details?.dry) console.log("          (dry-run)");
      if (details?.budget) {
        const b = details.budget;
        console.log(
          `Budget    budgeted ${b.budgetedLamports}  spent ${b.spentOnSlicesLamports}  expenses ${b.expensesLamports}  remaining ${b.remainingLamports}  spendable ${b.spendableLamports} lamports`,
        );
      }
    }
  } finally {
    store.close();
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runtime(opts: { dry: boolean; mint?: string }) {
  if (opts.mint && !opts.dry) fail("--mint is only allowed together with --dry-run");
  const env = readEnv();
  if (opts.mint) {
    try {
      new PublicKey(opts.mint);
    } catch {
      fail("--mint is not a valid public key");
    }
    env.KESTIV_MINT = opts.mint;
  }
  let cfg: DryRunConfig;
  try {
    cfg = opts.dry ? loadConfig(env, { keypairOptional: true }) : loadConfig(env);
  } catch (e) {
    fail(e instanceof ConfigError ? e.message : "invalid configuration");
  }
  const policy = loadPolicy(cfg.KESTIV_POLICY_FILE);
  const store = Store.open();
  if (!opts.mint) {
    const stored = store.getConfig("mint");
    if (!stored && !opts.dry) fail("not initialised: run `kestiv init` first");
    if (stored && stored !== cfg.KESTIV_MINT) fail("KESTIV_MINT does not match the mint stored by `kestiv init`");
    const founder = store.getConfig("founder");
    if (founder && founder !== cfg.FOUNDER_WALLET) fail("FOUNDER_WALLET does not match the founder stored by `kestiv init`");
  }
  return { cfg, policy, store, mint: cfg.KESTIV_MINT };
}

function writeStatus(rt: ReturnType<typeof runtime>, r: RunResult): string {
  const paths = statusPaths(rt.cfg.KESTIV_STATUS_PATH);
  const path = r.dry ? paths.dry : paths.live;
  mkdirSync(dirname(path), { recursive: true });
  const status = buildPublicStatus({
    store: rt.store,
    result: r,
    cfg: rt.cfg,
    policy: rt.policy,
    mint: rt.mint,
    nowSec: r.ts,
  });
  writePublicStatus(path, status);
  return path;
}

async function runCommand(opts: { dryRun?: boolean; mint?: string }): Promise<{ result: RunResult; statusPath: string }> {
  const dry = Boolean(opts.dryRun);
  const rt = runtime({ dry, mint: opts.mint });
  try {
    const ports = buildPorts({ cfg: rt.cfg, policy: rt.policy, store: rt.store, dry, mint: rt.mint });
    const result = await runOnce(ports);
    const statusPath = writeStatus(rt, result);
    console.log(formatRun(result));
    return { result, statusPath };
  } finally {
    rt.store.close();
  }
}

async function init(): Promise<void> {
  const env = readEnv();
  let cfg;
  try {
    cfg = loadConfig(env);
  } catch (e) {
    fail(e instanceof ConfigError ? e.message : "invalid configuration");
  }
  const policy = loadPolicy(cfg.KESTIV_POLICY_FILE);
  const cap = checkCap(policy.capBps);
  if (cap.level === "reject") fail(`refusing to initialise: ${cap.message}`);
  if (cap.level === "warn") console.warn(`warning: ${cap.message}`);

  const feeShare = policy.stakeShareBps / 100;
  console.log(
    [
      `Token        $KESTIV  ${cfg.KESTIV_MINT}`,
      `Founder      ${cfg.FOUNDER_WALLET}`,
      `Fee share    ${feeShare}% to stake, ${100 - feeShare}% to founder`,
      `Cap          ${policy.capBps / 100}% of supply`,
      `Vesting      ${FOUNDER_TERMS.cliffSeconds / 86400}-day cliff, then ${FOUNDER_TERMS.vestSeconds / 86400} days linear`,
      `Locks        one per buy, nobody can cancel or redirect them`,
    ].join("\n"),
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Type the mint's last 4 characters to confirm: ")).trim();
  rl.close();
  if (answer !== cfg.KESTIV_MINT.slice(-4)) fail("confirmation did not match, nothing was written");

  const store = Store.open();
  try {
    store.setConfig("mint", cfg.KESTIV_MINT);
    store.setConfig("founder", cfg.FOUNDER_WALLET);
    store.setConfig(
      "vesting_terms",
      JSON.stringify({ ...FOUNDER_TERMS, capBps: policy.capBps }),
    );
    console.log("Initialised. Mint, founder and vesting terms are now write-once.");
  } catch (e) {
    if (e instanceof WriteOnceError) fail(e.message);
    throw e;
  } finally {
    store.close();
  }
}

async function loop(opts: { dryRun?: boolean }): Promise<void> {
  const dry = Boolean(opts.dryRun);
  const policy = loadPolicy(readEnv().KESTIV_POLICY_FILE);
  let stop = false;
  process.on("SIGINT", () => (stop = true));
  process.on("SIGTERM", () => (stop = true));
  while (!stop) {
    let statusPath: string | undefined;
    try {
      statusPath = (await runCommand({ dryRun: dry })).statusPath;
    } catch (e) {
      console.error(`run failed: ${e instanceof Error ? e.message.replace(/api-key=[^&\s]+/gi, "api-key=<redacted>") : "error"}`);
    }
    const sleepSec = policy.cooldownMinSec + Math.floor(Math.random() * (policy.cooldownMaxSec - policy.cooldownMinSec));
    if (statusPath) setNextRunAt(statusPath, Math.floor(Date.now() / 1000) + sleepSec);
    console.log(`${dry ? "DRY-RUN " : ""}next run in ${Math.round(sleepSec / 60)} min`);
    for (let i = 0; i < sleepSec && !stop; i++) await new Promise((r) => setTimeout(r, 1000));
  }
}

function addFeeSource(pubkey: string): void {
  try {
    new PublicKey(pubkey);
  } catch {
    fail("not a valid public key");
  }
  const store = Store.open();
  try {
    store.addFeeSource(pubkey);
    console.log(`fee sources: ${store.getFeeSources().length}`);
  } finally {
    store.close();
  }
}

function serveStatus(): void {
  const env = readEnv();
  const port = Number(env.STATUS_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("STATUS_PORT is invalid");
  const server = createStatusServer(statusPaths(env.KESTIV_STATUS_PATH));
  server.listen(port, "127.0.0.1", () => console.log(`serving /status and /health on 127.0.0.1:${port}`));
}

const program = new Command().name("kestiv").description("Turns creator fees into a locked founder stake.");
program.command("status").description("Show configuration presence and local state").action(status);
program.command("serve-status").description("Serve the public status files over read-only HTTP on 127.0.0.1").action(serveStatus);
program.command("init").description("Review and lock in mint, founder and vesting terms").action(init);
program
  .command("run-once")
  .description("Run one loop iteration")
  .option("--dry-run", "read-only: evaluate every gate and print what would happen")
  .option("--mint <pubkey>", "override the mint (dry-run only)")
  .action(async (o) => {
    await runCommand(o);
  });
program
  .command("loop")
  .description("Run continuously with a random 30-90 minute pause")
  .option("--dry-run", "read-only")
  .action(loop);
program
  .command("config")
  .description("Edit stored configuration")
  .command("add-fee-source <pubkey>")
  .description("Treat transfers from this address as creator fees")
  .action(addFeeSource);

program.parseAsync(process.argv).catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/api-key=[^&\s]+/gi, "api-key=<redacted>") : "error");
  process.exit(1);
});
