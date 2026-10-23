import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, q, val } from './db.ts';
import { errorHandler, requireAuth } from './core.ts';
import { authRouter, metaRouter } from './routes/auth.ts';
import { crmRouter } from './routes/crm.ts';
import { inventoryRouter, supplyRouter } from './routes/supply.ts';
import { ordersRouter, productionRouter, serviceRouter, unitsRouter } from './routes/operations.ts';
import { financeRouter, insightsRouter, tasksRouter } from './routes/insights.ts';
import { adminRouter, runScheduledBackup } from './routes/admin.ts';
import { notesRouter } from './routes/notes.ts';
import { filesRouter } from './routes/files.ts';
import { machinesRouter } from './routes/machines.ts';
import { DB_PATH, closeDb } from './db.ts';
import { rescoreOrg } from './services/crm.ts';
import { seed } from './seed.ts';

// Not PORT: dev tooling often sets PORT for the web client, which would collide.
const PORT = Number(process.env.ELECIO_API_PORT) || 4600;
const here = path.dirname(fileURLToPath(import.meta.url));

getDb();
if (val<number>("SELECT COUNT(*) FROM users WHERE password_hash NOT LIKE '$2a$%' AND password_hash NOT LIKE '$2b$%' AND password_hash NOT LIKE '$2y$%'")) {
  throw new Error('Unsafe password storage detected; refusing to start');
}
if (!val<number>('SELECT COUNT(*) FROM orgs')) {
  console.log('[elecio-flow] empty database — seeding Elecio workspace');
  seed();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// API answers are live data (stock, orders…): never let a browser, proxy or CDN serve an old copy.
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', metaRouter);
app.use('/api', requireAuth, crmRouter, inventoryRouter, supplyRouter, ordersRouter, productionRouter, unitsRouter,
  serviceRouter, tasksRouter, financeRouter, insightsRouter, notesRouter, adminRouter, filesRouter, machinesRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد' }));
app.use(errorHandler);

// In production the API also serves the built web client.
const webDist = path.resolve(here, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

console.log(`[elecio-flow] database: ${DB_PATH}`);

// On shutdown fold the write-ahead log back into the main file, so elecio-flow.db on
// its own is always a complete database (it can be copied or uploaded as-is).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    try { getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)'); closeDb(); } catch { /* already closed */ }
    process.exit(0);
  });
}

// Automatic backups (schedule set by the owner in Settings → Backup).
const backupTick = () => { try { runScheduledBackup(); } catch (err) { console.error('[elecio-flow] automatic backup failed', err); } };
backupTick();
setInterval(backupTick, 30 * 60_000);

// Scores decay with time (stale leads cool down), so refresh them periodically.
setInterval(() => {
  for (const { id } of q('SELECT id FROM orgs')) rescoreOrg(id);
}, 6 * 3_600_000);

app.listen(PORT, () => console.log(`[elecio-flow] API ready on http://localhost:${PORT}`));
