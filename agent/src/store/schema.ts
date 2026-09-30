export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inflows (
  sig TEXT PRIMARY KEY,
  lamports INTEGER,
  source TEXT CHECK(source IN ('fee','seed')),
  ts INTEGER,
  sender TEXT
);
CREATE TABLE IF NOT EXISTS forwards (
  sig TEXT PRIMARY KEY,
  inflow_sig TEXT,
  lamports INTEGER,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS slices (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('pending','bought','locked','failed')),
  sol_in INTEGER,
  tokens_out TEXT,
  buy_sig TEXT,
  lock_sig TEXT,
  reason TEXT,
  created_ts INTEGER,
  last_valid_height INTEGER,
  bought_ts INTEGER,
  locked_ts INTEGER
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  state TEXT,
  reason TEXT,
  ts INTEGER,
  details TEXT,
  txs TEXT
);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS locks (
  escrow TEXT PRIMARY KEY,
  sig TEXT NOT NULL,
  amount TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
  sig TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  lamports INTEGER NOT NULL,
  ts INTEGER
);
`;

export const ADDED_COLUMNS: readonly { table: string; column: string; type: string }[] = [
  { table: "inflows", column: "sender", type: "TEXT" },
  { table: "slices", column: "last_valid_height", type: "INTEGER" },
  { table: "slices", column: "bought_ts", type: "INTEGER" },
  { table: "slices", column: "locked_ts", type: "INTEGER" },
  { table: "runs", column: "details", type: "TEXT" },
  { table: "runs", column: "txs", type: "TEXT" },
];
