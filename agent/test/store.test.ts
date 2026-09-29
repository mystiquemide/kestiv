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
