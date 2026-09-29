import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";

export const WRITE_ONCE_KEYS = ["mint", "founder", "contract_id", "vesting_terms"] as const;

export const DEFAULT_DB_PATH = "./data/kestiv.db";

export interface RunRow {
  id: number;
  state: string | null;
  reason: string | null;
  ts: number | null;
}

export class WriteOnceError extends Error {
  constructor(key: string) {
    super(`config key "${key}" is write-once and already set to a different value`);
    this.name = "WriteOnceError";
  }
}

export const resolveDbPath = (env: Record<string, string | undefined> = process.env): string =>
  env.KESTIV_DB_PATH || DEFAULT_DB_PATH;

export class Store {
  readonly db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static open(path: string = resolveDbPath()): Store {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA_SQL);
    return new Store(db);
  }

  close(): void {
    this.db.close();
  }

  getConfig(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM config WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setConfig(key: string, value: string): void {
    if ((WRITE_ONCE_KEYS as readonly string[]).includes(key)) {
      const existing = this.getConfig(key);
      if (existing !== undefined) {
        if (existing === value) return;
        throw new WriteOnceError(key);
      }
    }
    this.db
      .prepare("INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  sliceCountsByStatus(): Record<string, number> {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS n FROM slices GROUP BY status").all() as {
      status: string;
      n: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  lastRun(): RunRow | undefined {
    return this.db.prepare("SELECT id, state, reason, ts FROM runs ORDER BY id DESC LIMIT 1").get() as
      | RunRow
      | undefined;
  }
}
