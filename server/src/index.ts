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
import { rescoreOrg } from './services/crm.ts';
import { seed } from './seed.ts';

// Not PORT: dev tooling often sets PORT for the web client, which would collide.
const PORT = Number(process.env.ELECIO_API_PORT) || 4600;
const here = path.dirname(fileURLToPath(import.meta.url));

getDb();
if (!val<number>('SELECT COUNT(*) FROM orgs')) {
  console.log('[elecio-flow] empty database — seeding Elecio workspace');
  seed();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', metaRouter);
app.use('/api', requireAuth, crmRouter, inventoryRouter, supplyRouter, ordersRouter, productionRouter, unitsRouter,
  serviceRouter, tasksRouter, financeRouter, insightsRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد' }));
app.use(errorHandler);

// In production the API also serves the built web client.
const webDist = path.resolve(here, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// Scores decay with time (stale leads cool down), so refresh them periodically.
setInterval(() => {
  for (const { id } of q('SELECT id FROM orgs')) rescoreOrg(id);
}, 6 * 3_600_000);

app.listen(PORT, () => console.log(`[elecio-flow] API ready on http://localhost:${PORT}`));
