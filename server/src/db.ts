import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Single SQLite file, multi-tenant by `org_id` on every business table.
 * Moving to Postgres later only means swapping this module — the routes
 * talk to `q`, `one`, `run` and `tx`, never to the driver.
 */

const DATA_DIR = process.env.ELECIO_DATA_DIR || path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'elecio-flow.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings_json TEXT NOT NULL,
  counters_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, username)
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity(org_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity(entity_type, entity_id, at DESC);

/* ───────────── CRM ───────────── */

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  owner_id TEXT,
  kind TEXT NOT NULL DEFAULT 'company',
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  job_title TEXT DEFAULT '',
  phones_json TEXT NOT NULL DEFAULT '[]',
  emails_json TEXT NOT NULL DEFAULT '[]',
  website TEXT DEFAULT '',
  lead_source TEXT DEFAULT 'other',
  lead_source_detail TEXT DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'cold_lead',
  lost_reason TEXT DEFAULT '',
  customer_type TEXT DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  estimated_value INTEGER,
  attrs_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT DEFAULT '',
  referred_by_id TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  score_parts_json TEXT NOT NULL DEFAULT '[]',
  last_contact_at INTEGER,
  next_follow_up_at INTEGER,
  stage_changed_at INTEGER,
  converted_at INTEGER,
  search TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(org_id, score DESC);

CREATE TABLE IF NOT EXISTS contact_addresses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'دفتر مرکزی',
  province TEXT DEFAULT '',
  county TEXT DEFAULT '',
  address TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_addresses_contact ON contact_addresses(contact_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#779BE7',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT,
  type TEXT NOT NULL DEFAULT 'call',
  direction TEXT DEFAULT 'outbound',
  outcome TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  duration_min INTEGER,
  at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id, at DESC);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  note TEXT DEFAULT '',
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followups_org ON followups(org_id, status, due_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  assignee_id TEXT,
  created_by TEXT,
  due_at INTEGER,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  ref_type TEXT,
  ref_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

/* ───────────── Item master, inventory (WMS) ───────────── */

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'component',
  category TEXT DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'عدد',
  price INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  serialized INTEGER NOT NULL DEFAULT 0,
  warranty_months INTEGER,
  hw_rev TEXT DEFAULT '',
  fw_version TEXT DEFAULT '',
  reorder_point INTEGER NOT NULL DEFAULT 0,
  reorder_qty INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  supplier_id TEXT,
  description TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, sku)
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  parent_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES items(id),
  qty REAL NOT NULL DEFAULT 1,
  UNIQUE (parent_id, component_id)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'parts',
  address TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stock (
  org_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  qty REAL NOT NULL DEFAULT 0,
  reserved REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  from_wh TEXT,
  to_wh TEXT,
  qty REAL NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  note TEXT DEFAULT '',
  user_id TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moves_org ON stock_moves(org_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_moves_item ON stock_moves(item_id, at DESC);

/* ───────────── Supply chain (SCM) ───────────── */

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  country TEXT DEFAULT 'ایران',
  city TEXT DEFAULT '',
  address TEXT DEFAULT '',
  categories TEXT DEFAULT '',
  lead_time_days INTEGER NOT NULL DEFAULT 14,
  rating INTEGER NOT NULL DEFAULT 3,
  notes TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  number TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  ordered_at INTEGER,
  expected_at INTEGER,
  received_at INTEGER,
  shipping_method TEXT DEFAULT '',
  tracking_no TEXT DEFAULT '',
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS po_lines (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id),
  qty REAL NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  received_qty REAL NOT NULL DEFAULT 0
);

/* ───────────── Sales & orders (OMS) ───────────── */

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  number TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  address_id TEXT,
  owner_id TEXT,
  stage TEXT NOT NULL,
  stage_entered_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  fulfillment TEXT NOT NULL DEFAULT 'stock',
  priority TEXT NOT NULL DEFAULT 'normal',
  promised_at INTEGER,
  discount INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  needs_installation INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  cancel_reason TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(org_id, status, stage);

CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id),
  description TEXT DEFAULT '',
  qty REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  allocated REAL NOT NULL DEFAULT 0,
  warehouse_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stage_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  entered_at INTEGER NOT NULL,
  left_at INTEGER,
  user_id TEXT,
  note TEXT DEFAULT '',
  forced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stage_log ON stage_log(entity_type, entity_id, entered_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'transfer',
  reference TEXT DEFAULT '',
  paid_at INTEGER NOT NULL,
  note TEXT DEFAULT '',
  user_id TEXT
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier TEXT DEFAULT '',
  tracking_no TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'shipped',
  shipped_at INTEGER NOT NULL,
  delivered_at INTEGER,
  cost INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT ''
);

/* ───────────── Production (MES) & traceability ───────────── */

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  number TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id),
  qty INTEGER NOT NULL,
  order_id TEXT,
  stage TEXT NOT NULL,
  stage_entered_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  assignee_id TEXT,
  hw_rev TEXT DEFAULT '',
  fw_version TEXT DEFAULT '',
  source_wh TEXT,
  target_wh TEXT,
  due_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  notes TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  serial TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id),
  work_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'in_production',
  hw_rev TEXT DEFAULT '',
  fw_version TEXT DEFAULT '',
  warehouse_id TEXT,
  order_id TEXT,
  contact_id TEXT,
  address_id TEXT,
  qc_result TEXT,
  built_at INTEGER,
  shipped_at INTEGER,
  installed_at INTEGER,
  warranty_until INTEGER,
  notes TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, serial)
);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(org_id, status);
CREATE INDEX IF NOT EXISTS idx_units_order ON units(order_id);
CREATE INDEX IF NOT EXISTS idx_units_contact ON units(contact_id);

/* Mandatory, per-serial production checkpoints. A row means that one
   physical device has completed that step; the work order cannot advance
   until every non-scrapped unit has the required row. */
CREATE TABLE IF NOT EXISTS unit_process_steps (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  completed_by TEXT,
  note TEXT DEFAULT '',
  UNIQUE (unit_id, step)
);
CREATE INDEX IF NOT EXISTS idx_unit_process_steps_work_order ON unit_process_steps(work_order_id, step);

CREATE TABLE IF NOT EXISTS unit_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  user_id TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unit_events ON unit_events(unit_id, at);

CREATE TABLE IF NOT EXISTS qc_checks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  work_order_id TEXT,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  results_json TEXT NOT NULL DEFAULT '[]',
  passed INTEGER NOT NULL,
  inspector_id TEXT,
  note TEXT DEFAULT '',
  at INTEGER NOT NULL
);

/* ───────────── Service management ───────────── */

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  number TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id),
  unit_id TEXT,
  order_id TEXT,
  type TEXT NOT NULL DEFAULT 'support',
  channel TEXT DEFAULT 'phone',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  subject TEXT NOT NULL,
  description TEXT DEFAULT '',
  assignee_id TEXT,
  scheduled_at INTEGER,
  sla_due_at INTEGER,
  under_warranty INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  resolution TEXT DEFAULT '',
  satisfaction INTEGER,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(org_id, status);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT,
  body TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);

/* ───────────── Finance ───────────── */

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL,
  description TEXT DEFAULT '',
  payee TEXT DEFAULT '',
  ref_type TEXT,
  ref_id TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL
);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Backfill checkpoints for databases created before per-device tracking.
  // The current work-order stage proves that all preceding stages were passed.
  db.exec(`
    INSERT OR IGNORE INTO unit_process_steps (id, org_id, unit_id, work_order_id, step, completed_at, completed_by, note)
    SELECT 'ups_mig_fw_' || u.id, u.org_id, u.id, u.work_order_id, 'firmware', COALESCE(w.started_at, u.created_at), NULL, 'بازیابی از سابقه دستور تولید'
    FROM units u JOIN work_orders w ON w.id = u.work_order_id
    WHERE w.stage IN ('assembly', 'testing', 'packaging', 'done');

    INSERT OR IGNORE INTO unit_process_steps (id, org_id, unit_id, work_order_id, step, completed_at, completed_by, note)
    SELECT 'ups_mig_as_' || u.id, u.org_id, u.id, u.work_order_id, 'assembly', COALESCE(w.started_at, u.created_at), NULL, 'بازیابی از سابقه دستور تولید'
    FROM units u JOIN work_orders w ON w.id = u.work_order_id
    WHERE w.stage IN ('testing', 'packaging', 'done');

    INSERT OR IGNORE INTO unit_process_steps (id, org_id, unit_id, work_order_id, step, completed_at, completed_by, note)
    SELECT 'ups_mig_pk_' || u.id, u.org_id, u.id, u.work_order_id, 'packaging', COALESCE(w.completed_at, u.built_at, u.created_at), NULL, 'بازیابی از سابقه دستور تولید'
    FROM units u JOIN work_orders w ON w.id = u.work_order_id
    WHERE w.stage = 'done';
  `);
  return db;
}

export function resetDb() {
  if (db) { db.close(); db = null; }
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + suffix); } catch { /* not there */ }
  }
}

/* ───────────── Query helpers ───────────── */

type Param = string | number | bigint | null | undefined | boolean;

function bind(params: Param[]) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as (string | number | bigint | null)[];
}

// Rows are dynamic (camelCased columns + joins); typed at the edges, not here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;

/** snake_case row → camelCase object; `*_json` columns are parsed and lose the suffix. */
export function camel(row: Row | undefined | null): Row | null {
  if (!row) return null;
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('_json')) {
      const name = key.slice(0, -5).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      try { out[name] = value ? JSON.parse(value as string) : null; } catch { out[name] = null; }
    } else {
      out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }
  return out;
}

export function q(sql: string, ...params: Param[]): Row[] {
  return (getDb().prepare(sql).all(...bind(params)) as Row[]).map((r) => camel(r)!);
}

export function one(sql: string, ...params: Param[]): Row | null {
  return camel(getDb().prepare(sql).get(...bind(params)) as Row | undefined);
}

export function val<T = number>(sql: string, ...params: Param[]): T {
  const row = getDb().prepare(sql).get(...bind(params)) as Row | undefined;
  return (row ? Object.values(row)[0] : null) as T;
}

export function run(sql: string, ...params: Param[]) {
  return getDb().prepare(sql).run(...bind(params));
}

let txDepth = 0;
/** Runs fn atomically. Nested calls join the outer transaction. */
export function tx<T>(fn: () => T): T {
  const database = getDb();
  if (txDepth > 0) return fn();
  database.exec('BEGIN');
  txDepth++;
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

/**
 * Inserts a camelCase object into `table`. Only keys listed in `columns`
 * are written; array/object values go to their `*_json` column.
 */
export function insert(table: string, data: Row, columns: string[]) {
  const cols: string[] = [];
  const params: Param[] = [];
  for (const column of columns) {
    const key = column.replace(/_json$/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in data)) continue;
    cols.push(column);
    const value = data[key];
    params.push(column.endsWith('_json') ? JSON.stringify(value ?? null) : value);
  }
  run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...params);
}

/** Updates whitelisted columns of a row scoped to the org. */
export function update(table: string, id: string, orgId: string, data: Row, columns: string[]) {
  const sets: string[] = [];
  const params: Param[] = [];
  for (const column of columns) {
    const key = column.replace(/_json$/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in data)) continue;
    sets.push(`${column} = ?`);
    const value = data[key];
    params.push(column.endsWith('_json') ? JSON.stringify(value ?? null) : value);
  }
  if (!sets.length) return;
  run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params, id, orgId);
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function normalizeSearch(text: string): string {
  return String(text || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/‌/g, ' ')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toLowerCase()
    .replace(/[\s\-()._]+/g, ' ')
    .trim();
}
