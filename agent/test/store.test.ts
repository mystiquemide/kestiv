import { describe, expect, it } from "vitest";
import { Store, WriteOnceError } from "../src/store/index.js";
import { SCHEMA_SQL } from "../src/store/schema.js";

const tables = (s: Store) =>
  (s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );

describe("store", () => {
  it("creates the schema and migration is idempotent", () => {
    const s = Store.open(":memory:");
    expect(tables(s)).toEqual(expect.arrayContaining(["config", "forwards", "inflows", "runs", "slices"]));
    s.db.prepare("INSERT INTO runs(state, reason, ts) VALUES('WAITING','x',1)").run();
    s.db.exec(SCHEMA_SQL);
    s.db.exec(SCHEMA_SQL);
    expect(s.lastRun()?.state).toBe("WAITING");
  });

  it("enforces write-once config keys", () => {
    const s = Store.open(":memory:");
    s.setConfig("mint", "A");
    s.setConfig("mint", "A");
    expect(() => s.setConfig("mint", "B")).toThrow(WriteOnceError);
    expect(s.getConfig("mint")).toBe("A");
    for (const key of ["founder", "contract_id", "vesting_terms"]) {
      s.setConfig(key, "1");
      expect(() => s.setConfig(key, "2")).toThrow(WriteOnceError);
    }
  });

  it("allows updating other config keys", () => {
    const s = Store.open(":memory:");
    s.setConfig("forwarder", "A");
    s.setConfig("forwarder", "B");
    expect(s.getConfig("forwarder")).toBe("B");
  });

  it("rejects a bad slice status", () => {
    const s = Store.open(":memory:");
    const insert = s.db.prepare("INSERT INTO slices(id, status) VALUES(?, ?)");
    expect(() => insert.run("a", "bogus")).toThrow(/CHECK/);
    expect(() => insert.run("b", "pending")).not.toThrow();
  });

  it("rejects a bad inflow source", () => {
    const s = Store.open(":memory:");
    expect(() => s.db.prepare("INSERT INTO inflows(sig, source) VALUES('a','other')").run()).toThrow(/CHECK/);
  });
});

describe("store migration of an older database", () => {
  it("adds the new columns without losing rows", async () => {
    const { default: Database } = await import("better-sqlite3");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(mkdtempSync(join(tmpdir(), "kestiv-")), "old.db");
    const old = new Database(path);
    old.exec(
      "CREATE TABLE runs (id INTEGER PRIMARY KEY, state TEXT, reason TEXT, ts INTEGER); INSERT INTO runs(state, reason, ts) VALUES('WAITING','x',1);" +
        "CREATE TABLE slices (id TEXT PRIMARY KEY, status TEXT CHECK(status IN ('pending','bought','locked','failed')), sol_in INTEGER, tokens_out TEXT, buy_sig TEXT, lock_sig TEXT, reason TEXT, created_ts INTEGER);" +
        "CREATE TABLE inflows (sig TEXT PRIMARY KEY, lamports INTEGER, source TEXT CHECK(source IN ('fee','seed')), ts INTEGER);",
    );
    old.close();
    const s = Store.open(path);
    expect(s.lastRun()?.state).toBe("WAITING");
    expect(s.insertRun({ state: "X", reason: "y", details: { a: 1 }, txs: ["t"], ts: 2 })).toBeGreaterThan(1);
    s.insertPendingSlice("a", 1, 1);
    s.setSliceSignature("a", "SIG", 9);
    expect(s.slicesByStatus("pending")[0]?.last_valid_height).toBe(9);
    expect(s.insertInflow({ sig: "i", lamports: 1, source: "seed", ts: 1, sender: "S" })).toBe(true);
    expect(s.insertInflow({ sig: "i", lamports: 1, source: "seed", ts: 1, sender: "S" })).toBe(false);
    s.close();
  });

  it("keeps fee sources as a de-duplicated list", () => {
    const s = Store.open(":memory:");
    s.addFeeSource("A");
    s.addFeeSource("A");
    s.addFeeSource("B");
    expect(s.getFeeSources()).toEqual(["A", "B"]);
  });
});
