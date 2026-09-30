import { vwap } from "../chain/swaps.js";
import { assertLockTerms, LockTermsError } from "../lock/read.js";
import type { InflowRow } from "../store/index.js";
import { resolveVolume } from "./volume.js";
import { computeBudget, stakeShare, type Budget } from "./budget.js";
import { decide, type DecideInputs, type Decision } from "./decide.js";
import type { Ports, RunResult, RunState } from "./types.js";
import { DUST_TOKENS } from "../lock/fee.js";

const MIN_INFLOW_LAMPORTS = 10_000;
const STALE_FORWARD_SEC = 180;

type Details = Record<string, unknown> & { actions: string[]; notes: string[] };

const stateFor = (d: Decision, dry: boolean): RunState => {
  switch (d.action) {
    case "CAP_REACHED":
      return "CAP_REACHED";
    case "WAIT":
      return "WAITING";
    case "SKIP":
      return "SKIPPED";
    default:
      return dry ? "WOULD_BUY" : "BOUGHT";
  }
};

const safeMessage = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/api-key=[^&\s"']+/gi, "api-key=<redacted>").slice(0, 300);

export async function runOnce(ports: Ports): Promise<RunResult> {
  const { store, policy, dry } = ports;
  const startedAt = ports.now();
  const txs: string[] = [];
  const details: Details = { dry, mint: ports.mint, gates: [], actions: [], notes: [] };
  let budget: Budget | undefined;

  const finish = (state: RunState, reason: string): RunResult => {
    const result: RunResult = { state, reason, details, txs, ts: startedAt, dry, budget };
    store.insertRun({ state, reason, details: { ...details, budget }, txs, ts: startedAt });
    return result;
  };
  const would = (line: string) => details.actions.push(`DRY-RUN would ${line}`);

  try {
    // 0. recover pending slices
    const stillPending = await recoverPending(ports, details);

    // 1. lock-first
    const tokens = await ports.chain.tokenBalance();
    details.walletTokens = tokens.toString();
    if (tokens > DUST_TOKENS) {
      const blocked = await lockTokens(ports, tokens, details, txs, would);
      if (blocked) return finish("WAITING", blocked);
    }
    if (stillPending.length > 0) {
      details.pendingSlices = stillPending;
      return finish("WAITING", "pending_confirmation");
    }

    // cap state (needed before intake so capped fees go to the founder)
    const info = await ports.chain.mintInfo();
    const contractId = store.getConfig("contract_id");
    const stream = contractId ? await ports.lock.read(contractId) : undefined;
    const stakeTokens = stream?.depositedAmount ?? 0n;
    const capTokens = (info.supply * BigInt(policy.capBps)) / 10_000n;
    const capReached = stakeTokens >= capTokens;
    details.stake = { stakeTokens: stakeTokens.toString(), capTokens: capTokens.toString(), supply: info.supply.toString() };

    // 2. intake + forward
    const inflows = await intake(ports, details, txs, would);

    // 3. budget
    const walletLamports = await ports.chain.solBalance();
    budget = computeBudget({
      inflows,
      stakeShareBps: policy.stakeShareBps,
      spentOnSlices: store.spentOnSlices(),
      expenses: store.expensesTotal(),
      walletLamports,
      opsReserveLamports: policy.opsReserveLamports,
    });

    if (capReached) {
      if (budget.spendableLamports > 0) {
        if (dry) would(`release ${budget.spendableLamports} lamports of unspent budget to the founder (cap reached)`);
        else if (ports.transferSol) {
          const sig = await ports.transferSol(ports.founder, budget.spendableLamports, (s) =>
            store.addExpense(s, "cap_release", budget!.spendableLamports, startedAt),
          );
          txs.push(sig);
        }
      }
      const d = decide({ nowSec: startedAt, capReached: true, capInfo: { stakeTokens: stakeTokens.toString(), capTokens: capTokens.toString() } }, policy);
      details.gates = d.details.gates;
      return finish("CAP_REACHED", "cap_reached");
    }

    // 4. signals
    const [price, solUsd, holders, swaps] = await Promise.all([
      ports.price.token(),
      ports.price.solUsd(),
      ports.chain.holders(),
      ports.chain.swaps(policy.swapsForSignals),
    ]);
    const windowSwaps = swaps.filter((s) => s.ts >= startedAt - policy.vwapWindowSec && s.ts <= startedAt);
    const vw = vwap(swaps, policy.vwapWindowSec, startedAt);
    const decimals = info.decimals;
    const headroomTokens = capTokens - stakeTokens;
    const lamportsPerUsd = price.priceUsd && solUsd ? 1e9 / solUsd : 0;
    const headroomLamports =
      price.priceUsd && solUsd ? (Number(headroomTokens) / 10 ** decimals) * price.priceUsd * lamportsPerUsd : null;
    const liquidityCapLamports =
      price.liquidityUsd && solUsd ? price.liquidityUsd * (policy.liquidityShareBps / 10_000) * lamportsPerUsd : null;

    const volume = resolveVolume(price.volume24hUsd, swaps, startedAt, solUsd);
    const inputs: DecideInputs = {
      nowSec: startedAt,
      capReached: false,
      capInfo: { stakeTokens: stakeTokens.toString(), capTokens: capTokens.toString() },
      cooldownUntilSec: Number(store.getConfig("cooldown_until") ?? 0),
      priceUsd: price.priceUsd,
      volume24hUsd: volume.usd,
      volumeSource: volume.source,
      holders,
      liquidityUsd: price.liquidityUsd,
      swapsInWindow: windowSwaps.length,
      spendableLamports: budget.spendableLamports,
      liquidityCapLamports,
      capHeadroomLamports: headroomLamports,
      vwapLamportsPerToken: vw,
    };
    details.signals = {
      priceUsd: price.priceUsd,
      solUsd,
      volume24hUsd: volume.usd,
      volumeSource: volume.source,
      liquidityUsd: price.liquidityUsd,
      holders,
      swapsFetched: swaps.length,
      swapsInWindow: windowSwaps.length,
      vwapLamportsPerToken: vw,
    };

    let decision = decide(inputs, policy);
    if (!dry && decision.action !== "CONTINUE") return stop(decision);

    // 5. quote
    let slice = decision.details.sliceLamports ?? 0;
    if (dry && slice < policy.minSliceLamports) {
      slice = policy.minSliceLamports;
      details.notes.push(`quote and UsePod probe use the minimum slice (${slice} lamports) because the real slice is below it`);
    }
    const quote = await ports.swap.quote(BigInt(slice));
    inputs.quote = {
      priceImpact: quote.priceImpact,
      spotLamportsPerToken: Number(quote.inLamports) / Number(quote.outAmount),
    };
    details.quote = {
      inLamports: quote.inLamports.toString(),
      outAmount: quote.outAmount.toString(),
      minOutAmount: quote.minOutAmount.toString(),
      priceImpact: quote.priceImpact,
      route: quote.routeLabels,
      decimals: info.decimals,
    };
    decision = decide(inputs, policy);
    if (!dry && decision.action !== "CONTINUE") return stop(decision);

    // 6. veto
    const veto = await ports.usepod.verdict(swaps.slice(0, policy.swapsForUsepod), startedAt);
    inputs.usepod = { outcome: veto.outcome, verdict: veto.verdict, reason: veto.reason, lamports: veto.quote?.lamports };
    details.usepod = {
      outcome: veto.outcome,
      verdict: veto.verdict,
      reason: veto.reason,
      quoteLamports: veto.quote?.lamports,
      quoteId: veto.quote?.quoteId,
      payTo: veto.quote?.payTo,
      paymentSignature: veto.paymentSignature,
      headers: veto.headers,
      error: veto.error,
      model: veto.model,
    };
    if (veto.paymentSignature) txs.push(veto.paymentSignature);
    decision = decide(inputs, policy);
    details.gates = decision.details.gates;

    if (dry) {
      const proceed = decision.action === "CONTINUE" || decision.action === "BUY";
      if (proceed) {
        would(
          `buy ${quote.inLamports} lamports of ${ports.mint}: expected out ${quote.outAmount}, min out ${quote.minOutAmount}, price impact ${(quote.priceImpact * 100).toFixed(3)}%`,
        );
        would("lock the bought tokens into the founder vesting contract");
        details.notes.push("UsePod verdict not evaluated in dry-run (unpaid quote only)");
        return finish("WOULD_BUY", "all_evaluated_gates_passed");
      }
      return stop(decision);
    }
    if (decision.action !== "BUY") return stop(decision);

    // 7. buy
    return await executeBuy(ports, quote, slice, details, txs, startedAt, finish);
  } catch (e) {
    details.error = e instanceof LockTermsError ? e.message : safeMessage(e);
    return finish("ERROR", e instanceof LockTermsError ? "lock_terms_violation" : "run_failed");
  }

  function stop(d: Decision): RunResult {
    details.gates = d.details.gates;
    return finish(stateFor(d, dry), d.reason);
  }
}

async function recoverPending(ports: Ports, details: Details): Promise<string[]> {
  const { store, dry } = ports;
  const still: string[] = [];
  for (const slice of store.slicesByStatus("pending")) {
    if (!slice.buy_sig) {
      if (!dry) store.updateSlice(slice.id, { status: "failed", reason: "not_signed" });
      details.notes.push(`slice ${slice.id} was never signed: ${dry ? "would mark" : "marked"} failed`);
      continue;
    }
    const st = await ports.chain.sigStatus(slice.buy_sig);
    if (st.state === "confirmed") {
      if (!dry) store.updateSlice(slice.id, { status: "bought", ts: ports.now() });
      details.notes.push(`slice ${slice.id} confirmed: ${dry ? "would mark" : "marked"} bought`);
    } else if (st.state === "failed") {
      if (!dry) store.updateSlice(slice.id, { status: "failed", reason: `tx_failed: ${st.err ?? "unknown"}` });
      details.notes.push(`slice ${slice.id} failed on chain`);
    } else {
      const height = await ports.chain.blockHeight();
      if (slice.last_valid_height !== null && height > slice.last_valid_height) {
        if (!dry) store.updateSlice(slice.id, { status: "failed", reason: "expired" });
        details.notes.push(`slice ${slice.id} expired unconfirmed`);
      } else {
        still.push(slice.id);
      }
    }
  }
  return still;
}

/** Returns a WAIT reason when locking is blocked, otherwise undefined. */
async function lockTokens(
  ports: Ports,
  amount: bigint,
  details: Details,
  txs: string[],
  would: (line: string) => void,
): Promise<string | undefined> {
  const { store, policy, dry } = ports;
  const contractId = store.getConfig("contract_id");
  let signature: string | undefined;

  if (!contractId) {
    const sol = await ports.chain.solBalance();
    if (sol < policy.contractCreationLamports + policy.opsReserveLamports) {
      details.lockBlocked = { solLamports: sol, needed: policy.contractCreationLamports + policy.opsReserveLamports };
      return "insufficient_sol_for_contract";
    }
    if (dry) {
      would(`create the founder vesting contract and lock ${amount} tokens`);
      return undefined;
    }
    const created = await ports.lock.create(amount);
    store.setConfig("contract_id", created.streamId);
    signature = created.signature;
    const after = await ports.chain.solBalance();
    if (sol > after) store.addExpense(signature, "contract_creation", sol - after, ports.now());
    details.contractId = created.streamId;
  } else {
    const stream = await ports.lock.read(contractId);
    assertLockTerms(stream, ports.lock.expected);
    if (dry) {
      would(`top up contract ${contractId} with ${amount} tokens`);
      return undefined;
    }
    signature = (await ports.lock.topup(contractId, amount)).signature;
  }

  txs.push(signature);
  for (const slice of store.slicesByStatus("bought")) store.updateSlice(slice.id, { status: "locked", lock_sig: signature, ts: ports.now() });
  details.locked = { amount: amount.toString(), signature };
  return undefined;
}

async function intake(ports: Ports, details: Details, txs: string[], would: (line: string) => void): Promise<InflowRow[]> {
  const { store, policy, dry } = ports;
  const now = ports.now();

  if (!dry) {
    for (const f of store.listForwards(20)) {
      if (now - f.ts < STALE_FORWARD_SEC) continue;
      const st = await ports.chain.sigStatus(f.sig);
      if (st.state !== "confirmed") {
        store.deleteForward(f.sig);
        details.notes.push(`forward ${f.sig} never confirmed: will be retried`);
      }
    }
  }

  const feeSources = store.getFeeSources();
  const cursor = store.getConfig("inflow_cursor");
  const transfers = (await ports.chain.incoming(cursor)).filter((t) => t.lamports >= MIN_INFLOW_LAMPORTS);
  const fresh: InflowRow[] = [];
  for (const t of [...transfers].reverse()) {
    if (store.hasInflow(t.sig)) continue;
    const row: InflowRow = {
      sig: t.sig,
      lamports: t.lamports,
      source: feeSources.includes(t.sender) ? "fee" : "seed",
      ts: t.ts,
      sender: t.sender,
    };
    fresh.push(row);
    if (!dry) store.insertInflow(row);
  }
  if (!dry && transfers.length > 0) store.setConfig("inflow_cursor", transfers[0]!.sig);
  details.intake = {
    newInflows: fresh.map((r) => ({ sig: r.sig, lamports: r.lamports, source: r.source })),
    feeSources: feeSources.length,
  };

  const all = [...store.listInflows(), ...(dry ? fresh : [])];
  for (const inflow of all) {
    if (inflow.source !== "fee" || store.forwardExists(inflow.sig)) continue;
    const founderShare = inflow.lamports - stakeShare(inflow.lamports, policy.stakeShareBps);
    if (founderShare <= 0) continue;
    if (dry) {
      would(`forward ${founderShare} lamports (founder share of fee inflow ${inflow.sig}) to the founder`);
      continue;
    }
    if (!ports.transferSol) throw new Error("no signer available to forward the founder share");
    const sig = await ports.transferSol(ports.founder, founderShare, (s) => store.insertForward(s, inflow.sig, founderShare, now));
    txs.push(sig);
  }
  return all;
}

async function executeBuy(
  ports: Ports,
  quote: Awaited<ReturnType<Ports["swap"]["quote"]>>,
  slice: number,
  details: Details,
  txs: string[],
  startedAt: number,
  finish: (state: RunState, reason: string) => RunResult,
): Promise<RunResult> {
  const { store, policy } = ports;
  if (!ports.send) throw new Error("no signer available to buy");
  const built = await ports.swap.build(quote);
  const id = ports.newId();
  store.insertPendingSlice(id, slice, startedAt);
  details.sliceId = id;

  let signature: string;
  try {
    signature = await ports.send(built.transaction, {
      blockhash: { blockhash: built.transaction.message.recentBlockhash, lastValidBlockHeight: built.lastValidBlockHeight },
      onSigned: (sig) => store.setSliceSignature(id, sig, built.lastValidBlockHeight),
    });
  } catch (e) {
    const row = store.slicesByStatus("pending").find((s) => s.id === id);
    if (row && !row.buy_sig) store.updateSlice(id, { status: "failed", reason: "send_error" });
    details.error = safeMessage(e);
    return finish("ERROR", row?.buy_sig ? "buy_unconfirmed" : "buy_failed");
  }

  txs.push(signature);
  store.updateSlice(id, { status: "bought", tokens_out: quote.outAmount.toString(), ts: ports.now() });
  const cooldown = policy.cooldownMinSec + Math.floor(ports.random() * (policy.cooldownMaxSec - policy.cooldownMinSec));
  store.setConfig("cooldown_until", String(startedAt + cooldown));
  details.cooldownSec = cooldown;

  const tokens = await ports.chain.tokenBalance();
  if (tokens > DUST_TOKENS) {
    const blocked = await lockTokens(ports, tokens, details, txs, () => undefined);
    if (blocked) {
      details.notes.push(`lock deferred to next run: ${blocked}`);
      return finish("BOUGHT", "bought_lock_deferred");
    }
  }
  return finish("BOUGHT", "bought_and_locked");
}
