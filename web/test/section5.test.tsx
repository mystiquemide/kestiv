import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DevnetProof, StakeView } from "../lib/chain";
import { FAQ } from "../lib/faq";
import { routeLive } from "../lib/routes";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { verifyModel } from "../lib/verify";
import { ClosingCta } from "../components/faq/ClosingCta";
import { Faq } from "../components/faq/Faq";
import { PhotoBand } from "../components/band/PhotoBand";
import { Verify } from "../components/verify/Verify";

const response = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8")));
const run = { ...response.dry!, latest: { buySig: "BUY", buyTs: 1000, lockSig: "LOCKSIG1234567890", lockTs: 1000 } };
const down: AgentStatus = { ok: false, error: "down" } as unknown as AgentStatus;
const withLive: AgentStatus = { ok: true, live: run, dry: null, fetchedAt: 1 };
const proof = { cluster: "devnet", stream: { id: "G28zWX3sniaou4EBCuBBTc1tY4kewyfRU2eT7V65fQiV" }, sigs: { create: "C", topup: "TOPUPSIG1234567890", cancel: "X" } } as unknown as DevnetProof;
const active = { state: "active", cluster: "mainnet-beta", contractId: "STREAMCONTRACT123456" } as unknown as StakeView;
const env = { cluster: "mainnet-beta" as const, wallet: "HXqExLdZuPYAqaP6vS87yr6ZEm6Q1KtudFx1nzYwKzs4" };

describe("verify model", () => {
  it("links the live contract, wallet and latest lock on mainnet", () => {
    const m = verifyModel({ stake: active, status: withLive, proof, env, now: 4600 });
    expect(m.cards.map((c) => c.id)).toEqual(["contract", "wallet", "lock"]);
    expect(m.cards.every((c) => !c.devnet)).toBe(true);
    expect(m.cards[0]!.href).toContain("/mainnet/STREAMCONTRACT123456");
    expect(m.cards[2]!.href).toContain("solscan.io/tx/LOCKSIG1234567890");
    expect(m.cards[2]!.ago).toBe("1h ago");
    expect(m.notice).toBeNull();
  });

  it("falls back to the labelled devnet proof before the stake exists", () => {
    const m = verifyModel({ stake: { state: "not_launched" }, status: down, proof, env, now: 1 });
    const contract = m.cards.find((c) => c.id === "contract")!;
    const lock = m.cards.find((c) => c.id === "lock")!;
    expect(contract.devnet && lock.devnet).toBe(true);
    expect(contract.href).toContain("/devnet/");
    expect(lock.href).toContain("cluster=devnet");
    expect(m.notice).toMatch(/no stake contract yet/);
  });

  it("leaves out cards with no target", () => {
    const m = verifyModel({ stake: { state: "not_launched" }, status: down, proof: null, env: { cluster: "mainnet-beta" }, now: 1 });
    expect(m.cards).toEqual([]);
    expect(renderToStaticMarkup(<Verify model={m} />)).toBe("");
  });

  it("says so when the chain read failed", () => {
    const m = verifyModel({ stake: { state: "rpc_error", rpcKind: "public", error: "x" }, status: down, proof, env, now: 1 });
    expect(m.notice).toMatch(/Couldn't read the chain/);
    expect(m.cards.find((c) => c.id === "contract")!.devnet).toBe(true);
  });

  it("renders external links safely with the full value on hover", () => {
    const html = renderToStaticMarkup(<Verify model={verifyModel({ stake: active, status: withLive, proof, env, now: 4600 })} />);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('title="STREAMCONTRACT123456"');
  });
});

describe("faq", () => {
  it("has eight closed native accordions under #faq", () => {
    const html = renderToStaticMarkup(<Faq />);
    expect(FAQ).toHaveLength(8);
    expect(html.match(/<details/g)).toHaveLength(8);
    expect(html).not.toContain("<details open");
    expect(html).toContain('id="faq"');
  });

  it("uses no em dashes and makes no claim the lock can't back up", () => {
    const text = FAQ.map((i) => `${i.q} ${i.a}`).join(" ");
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/nobody can move|unmovable|permanent/i);
  });

  it("does not promise the founder share keeps flowing when the agent stops", () => {
    const stops = FAQ.find((i) => i.q === "What happens if the agent stops?")!;
    expect(stops.a).toMatch(/wait/);
    expect(stops.a).not.toMatch(/keep going to the founder/i);
  });
});

describe("buttons to pages that don't exist", () => {
  it("render only when their route is live", () => {
    for (const r of ["/decisions", "/run", "/stake"]) expect(routeLive(r), r).toBe(false);
    expect(renderToStaticMarkup(<PhotoBand />)).not.toContain("/decisions");
    const cta = renderToStaticMarkup(<ClosingCta />);
    expect(cta).toContain("Start owning what you launched.");
    expect(cta).not.toContain('href="/run"');
    expect(cta).not.toContain('href="/stake"');
  });

  it("photo band has its headline and no em dash", () => {
    const html = renderToStaticMarkup(<PhotoBand />);
    expect(html).toContain("Every buy adds a step. No step can be taken away.");
    expect(html).not.toContain("—");
  });
});
