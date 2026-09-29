#!/usr/bin/env node
import { Command } from "commander";
import { ENV_VARS, inspectEnv, isOptionalVar, readEnv, resolveRpc, type Cluster } from "./config.js";
import { Store, resolveDbPath } from "./store/index.js";

const SLICE_STATUSES = ["pending", "bought", "locked", "failed"] as const;

function status(): void {
  const states = inspectEnv(readEnv());
  console.log("Config");
  for (const name of ENV_VARS) {
    const suffix = states[name] === "missing" && isOptionalVar(name) ? " (optional)" : "";
    console.log(`  ${name.padEnd(20)} ${states[name]}${suffix}`);
  }

  const env = readEnv();
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
    const counts = store.sliceCountsByStatus();
    console.log("Slices    " + SLICE_STATUSES.map((s) => `${s}=${counts[s] ?? 0}`).join(" "));
    const run = store.lastRun();
    console.log(
      run
        ? `Last run  #${run.id} ${run.state ?? "-"} ${run.reason ?? ""} ${run.ts ? new Date(run.ts * 1000).toISOString() : ""}`.trimEnd()
        : "Last run  none",
    );
  } finally {
    store.close();
  }
}

function notImplemented(): never {
  console.error("not implemented yet (T11/T17)");
  process.exit(1);
}

const program = new Command().name("kestiv").description("Turns creator fees into a locked founder stake.");
program.command("status").description("Show configuration presence and local state").action(status);
for (const name of ["init", "run-once", "loop"]) {
  program.command(name).description("Not implemented yet").action(notImplemented);
}

program.parseAsync(process.argv);
