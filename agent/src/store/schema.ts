export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inflows (
  sig TEXT PRIMARY KEY,
  lamports INTEGER,
  source TEXT CHECK(source IN ('fee','seed')),
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS forwards (
  sig TEXT PRIMARY KEY,
  inflow_sig TEXT,
  lamports INTEGER,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS slices (
  id TEXT PRIMARY KEY,
  status TEXT CHECK(status IN ('pending','bought','locked','failed')),
  sol_in INTEGER,
  tokens_out TEXT,
  buy_sig TEXT,
  lock_sig TEXT,
  reason TEXT,
  created_ts INTEGER
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  state TEXT,
  reason TEXT,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
