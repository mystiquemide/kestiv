import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { ADDED_COLUMNS, SCHEMA_SQL } from "./schema.js";

export const WRITE_ONCE_KEYS = ["mint", "founder", "contract_id", "vesting_terms"] as const;

export const DEFAULT_DB_PATH = "./data/kestiv.db";

export interface RunRow {
  id: number;
  state: string | null;
  reason: string | null;
  ts: number | null;
  details: string | null;
  txs: string | null;
}

export type SliceStatus = "pending" | "bought" | "locked" | "failed";

export interface SliceRow {
  id: string;
  status: SliceStatus;
  sol_in: number | null;
  tokens_out: string | null;
  buy_sig: string | null;
  lock_sig: string | null;
  reason: string | null;
  created_ts: number | null;
  last_valid_height: number | null;
}

export interface InflowRow {
  sig: string;
  lamports: number;
  source: "fee" | "seed";
  ts: number;
  sender: string | null;
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
    for (const { table, column, type } of ADDED_COLUMNS) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
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
    return this.db.prepare("SELECT id, state, reason, ts, details, txs FROM runs ORDER BY id DESC LIMIT 1").get() as
      | RunRow
      | undefined;
  }

  getFeeSources(): string[] {
    const raw = this.getConfig("fee_sources");
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  addFeeSource(pubkey: string): void {
    const list = this.getFeeSources();
    if (!list.includes(pubkey)) this.setConfig("fee_sources", JSON.stringify([...list, pubkey]));
  }

  insertInflow(row: InflowRow): boolean {
    const res = this.db
      .prepare("INSERT OR IGNORE INTO inflows(sig, lamports, source, ts, sender) VALUES(?,?,?,?,?)")
      .run(row.sig, row.lamports, row.source, row.ts, row.sender);
    return res.changes === 1;
  }

  hasInflow(sig: string): boolean {
    return this.db.prepare("SELECT 1 FROM inflows WHERE sig = ?").get(sig) !== undefined;
  }

  listInflows(): InflowRow[] {
    return this.db.prepare("SELECT sig, lamports, source, ts, sender FROM inflows ORDER BY ts").all() as InflowRow[];
  }

  forwardExists(inflowSig: string): boolean {
    return this.db.prepare("SELECT 1 FROM forwards WHERE inflow_sig = ?").get(inflowSig) !== undefined;
  }

  insertForward(sig: string, inflowSig: string, lamports: number, ts: number): void {
    this.db.prepare("INSERT OR IGNORE INTO forwards(sig, inflow_sig, lamports, ts) VALUES(?,?,?,?)").run(sig, inflowSig, lamports, ts);
  }

  addExpense(sig: string, kind: string, lamports: number, ts: number): void {
    this.db.prepare("INSERT OR IGNORE INTO expenses(sig, kind, lamports, ts) VALUES(?,?,?,?)").run(sig, kind, lamports, ts);
  }

  expensesTotal(): number {
    const row = this.db.prepare("SELECT COALESCE(SUM(lamports),0) AS n FROM expenses").get() as { n: number };
    return row.n;
  }

  insertPendingSlice(id: string, solIn: number, ts: number): void {
    this.db.prepare("INSERT INTO slices(id, status, sol_in, created_ts) VALUES(?, 'pending', ?, ?)").run(id, solIn, ts);
  }

  setSliceSignature(id: string, buySig: string, lastValidHeight: number): void {
    this.db.prepare("UPDATE slices SET buy_sig = ?, last_valid_height = ? WHERE id = ?").run(buySig, lastValidHeight, id);
  }

  updateSlice(id: string, patch: { status: SliceStatus; reason?: string | null; tokens_out?: string | null; lock_sig?: string | null }): void {
    this.db
      .prepare(
        "UPDATE slices SET status = ?, reason = COALESCE(?, reason), tokens_out = COALESCE(?, tokens_out), lock_sig = COALESCE(?, lock_sig) WHERE id = ?",
      )
      .run(patch.status, patch.reason ?? null, patch.tokens_out ?? null, patch.lock_sig ?? null, id);
  }

  slicesByStatus(status: SliceStatus): SliceRow[] {
    return this.db.prepare("SELECT * FROM slices WHERE status = ? ORDER BY created_ts").all(status) as SliceRow[];
  }

  spentOnSlices(): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(sol_in),0) AS n FROM slices WHERE status IN ('pending','bought','locked')")
      .get() as { n: number };
    return row.n;
  }

  lastBuyTs(): number | undefined {
    const row = this.db
      .prepare("SELECT MAX(created_ts) AS t FROM slices WHERE status IN ('pending','bought','locked')")
      .get() as { t: number | null };
    return row.t ?? undefined;
  }

  insertRun(run: { state: string; reason: string; details: unknown; txs: string[]; ts: number }): number {
    const res = this.db
      .prepare("INSERT INTO runs(state, reason, ts, details, txs) VALUES(?,?,?,?,?)")
      .run(run.state, run.reason, run.ts, JSON.stringify(run.details), JSON.stringify(run.txs));
    return Number(res.lastInsertRowid);
  }

  listForwards(limit: number): { sig: string; inflow_sig: string; lamports: number; ts: number }[] {
    return this.db
      .prepare("SELECT sig, inflow_sig, lamports, ts FROM forwards ORDER BY ts DESC LIMIT ?")
      .all(limit) as { sig: string; inflow_sig: string; lamports: number; ts: number }[];
  }

  deleteForward(sig: string): void {
    this.db.prepare("DELETE FROM forwards WHERE sig = ?").run(sig);
  }
}
