import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSearchText } from '../../shared/search.ts';

/**
 * Single SQLite file, multi-tenant by `org_id` on every business table.
 * Moving to Postgres later only means swapping this module — the routes
 * talk to `q`, `one`, `run` and `tx`, never to the driver.
 */

/**
 * Where the database lives, in order of preference:
 *  1. ELECIO_DATA_DIR (explicit, e.g. on the server)
 *  2. elecio-flow.db in the project root — the file shipped with the project
 *  3. server/data (first-run default; seeded automatically)
 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT_DB = path.join(PROJECT_ROOT, 'elecio-flow.db');
export const DATA_DIR = process.env.ELECIO_DATA_DIR || (fs.existsSync(ROOT_DB) ? PROJECT_ROOT : path.join(process.cwd(), 'data'));
export const DB_PATH = path.join(DATA_DIR, 'elecio-flow.db');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

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
  db.function('normalize_search', { deterministic: true }, normalizeSearchText);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
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

/* ───────────── Schema migrations ─────────────
 * Versioned with PRAGMA user_version. Every step is idempotent (columns are added
 * only when missing), so an older database file dropped into the project is brought
 * up to date on start-up — after a safety copy is written to backups/.
 */

function addColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  const exists = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (!exists) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const MIGRATIONS: { version: number; run: (database: DatabaseSync) => void }[] = [
  {
    // Archive instead of hard-delete, multi-role users, company contact people, notes,
    // manually entered historical sales and devices without known serials.
    version: 1,
    run: (d) => {
      for (const table of ['contacts', 'items', 'suppliers', 'orders', 'purchase_orders', 'tickets', 'units']) {
        addColumn(d, table, 'deleted_at', 'INTEGER');
      }
      addColumn(d, 'users', 'roles_json', "TEXT NOT NULL DEFAULT '[]'");
      addColumn(d, 'orders', 'legacy', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(d, 'orders', 'legacy_date', 'INTEGER');
      addColumn(d, 'units', 'serial_unknown', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(d, 'units', 'manual', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(d, 'units', 'sale_price', 'INTEGER');
      d.exec(`
        CREATE TABLE IF NOT EXISTS contact_people (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT DEFAULT '',
          department TEXT DEFAULT '',
          buying_role TEXT DEFAULT '',
          phones_json TEXT NOT NULL DEFAULT '[]',
          email TEXT DEFAULT '',
          rating INTEGER NOT NULL DEFAULT 0,
          is_primary INTEGER NOT NULL DEFAULT 0,
          notes TEXT DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_people_contact ON contact_people(contact_id, sort_order);

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          title TEXT DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT 'iris',
          visibility TEXT NOT NULL DEFAULT 'private',
          recipients_json TEXT NOT NULL DEFAULT '[]',
          ref_type TEXT,
          ref_id TEXT,
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_org ON notes(org_id, updated_at DESC);
      `);
      // Each company's single "رابط" (stored on the contact) becomes its first contact person.
      d.exec(`
        INSERT INTO contact_people (id, org_id, contact_id, name, title, phones_json, is_primary, sort_order, created_at)
        SELECT 'ppl_' || c.id, c.org_id, c.id, c.company, COALESCE(c.job_title, ''), c.phones_json, 1, 0, c.created_at
        FROM contacts c
        WHERE TRIM(COALESCE(c.company, '')) != ''
          AND NOT EXISTS (SELECT 1 FROM contact_people p WHERE p.contact_id = c.id);
      `);
    },
  },
  {
    // Scanned invoices / receipts stored inside the database (so a backup or an uploaded
    // .db file carries them), several people per production stage, sales invoice numbers.
    version: 2,
    run: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'other',
          title TEXT NOT NULL DEFAULT '',
          doc_number TEXT NOT NULL DEFAULT '',
          doc_date INTEGER,
          amount INTEGER,
          contact_id TEXT,
          order_id TEXT,
          supplier_id TEXT,
          po_id TEXT,
          file_name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size INTEGER NOT NULL,
          data BLOB NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          uploaded_by TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_contact ON attachments(contact_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_order ON attachments(order_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_supplier ON attachments(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_po ON attachments(po_id);

        CREATE TABLE IF NOT EXISTS work_order_crew (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
          stage TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'assigned',
          added_by TEXT,
          added_at INTEGER NOT NULL,
          UNIQUE (work_order_id, stage, user_id, role)
        );
        CREATE INDEX IF NOT EXISTS idx_work_order_crew_user ON work_order_crew(user_id, role);
      `);
      addColumn(d, 'unit_process_steps', 'performers_json', "TEXT NOT NULL DEFAULT '[]'");
      addColumn(d, 'orders', 'invoice_number', 'TEXT');
      addColumn(d, 'orders', 'invoiced_at', 'INTEGER');
      // Whoever recorded a device step so far is the best record of who performed it.
      d.exec(`UPDATE unit_process_steps SET performers_json = json_array(completed_by)
              WHERE completed_by IS NOT NULL AND performers_json = '[]'`);
      // The work order's single assignee becomes the assigned person of every stage it has reached.
      d.exec(`
        INSERT OR IGNORE INTO work_order_crew (id, org_id, work_order_id, stage, user_id, role, added_by, added_at)
        SELECT 'woc_mig_' || s.id, w.org_id, w.id, s.stage, w.assignee_id, 'assigned', NULL, s.entered_at
        FROM work_orders w JOIN stage_log s ON s.entity_type = 'work_order' AND s.entity_id = w.id
        WHERE w.assignee_id IS NOT NULL;
      `);
    },
  },
  {
    // The CNC machines at each customer / lead: controller brand (required), controller model,
    // machine maker / model / type (optional), how many, and how many run an Elecio device.
    // controller_models keeps the models a workspace adds beyond the built-in catalogue.
    version: 3,
    run: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS machines (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          address_id TEXT,
          controller_brand TEXT NOT NULL,
          controller_model TEXT NOT NULL DEFAULT '',
          machine_maker TEXT NOT NULL DEFAULT '',
          machine_model TEXT NOT NULL DEFAULT '',
          machine_type TEXT NOT NULL DEFAULT '',
          year INTEGER,
          qty INTEGER NOT NULL DEFAULT 1,
          elecio_qty INTEGER NOT NULL DEFAULT 0,
          notes TEXT NOT NULL DEFAULT '',
          created_by TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_machines_contact ON machines(contact_id);
        CREATE INDEX IF NOT EXISTS idx_machines_org_brand ON machines(org_id, controller_brand, controller_model);

        CREATE TABLE IF NOT EXISTS controller_models (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          brand TEXT NOT NULL,
          model TEXT NOT NULL,
          created_by TEXT,
          created_at INTEGER NOT NULL,
          UNIQUE (org_id, brand, model)
        );
      `);
    },
  },
  {
    // Controller brands a workspace adds beside the built-in ones (they can be removed again).
    version: 4,
    run: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS controller_brands (
          key TEXT NOT NULL,
          org_id TEXT NOT NULL,
          label TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#9DB4C0',
          created_by TEXT,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (org_id, key)
        );
      `);
    },
  },
  {
    // One row per machine: machines of the same brand usually have different controller
    // models, so a row counting several machines is split into separate machines.
    version: 5,
    run: (d) => {
      const rows = d.prepare('SELECT * FROM machines WHERE qty > 1').all() as Record<string, any>[];
      const insertCopy = d.prepare(
        `INSERT INTO machines (id, org_id, contact_id, address_id, controller_brand, controller_model, machine_maker, machine_model, machine_type, year, qty, elecio_qty, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`,
      );
      for (const r of rows) {
        for (let n = 1; n < r.qty; n++) {
          insertCopy.run(`${r.id}_${n}`, r.org_id, r.contact_id, r.address_id, r.controller_brand, r.controller_model, r.machine_maker, r.machine_model,
            r.machine_type, r.year, r.notes, r.created_by, r.created_at + n, r.updated_at);
        }
        d.prepare('UPDATE machines SET qty = 1, elecio_qty = MIN(elecio_qty, 1) WHERE id = ?').run(r.id);
      }
    },
  },
];

function migrate(database: DatabaseSync) {
  const current = Number((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (!pending.length) return;
  const hasData = Number((database.prepare('SELECT COUNT(*) AS n FROM orgs').get() as { n: number }).n) > 0;
  if (hasData) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `before-upgrade-v${current}-to-v${pending.at(-1)!.version}-${Date.now()}.db`);
    database.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    console.log(`[elecio-flow] database backed up before upgrade → ${file}`);
  }
  for (const m of pending) {
    database.exec('BEGIN');
    try {
      m.run(database);
      database.exec(`PRAGMA user_version = ${m.version}`);
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  }
  console.log(`[elecio-flow] database upgraded to schema v${pending.at(-1)!.version}`);
}

/** Closes the connection so the file can be replaced (restore); the next query reopens it. */
export function closeDb() {
  if (db) { db.close(); db = null; }
}

export function resetDb() {
  if (db) { db.close(); db = null; }
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + suffix); } catch { /* not there */ }
  }
}

/* ───────────── Query helpers ───────────── */

type Param = string | number | bigint | null | undefined | boolean | Uint8Array;

function bind(params: Param[]) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as (string | number | bigint | null | Uint8Array)[];
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
  return normalizeSearchText(text);
}
