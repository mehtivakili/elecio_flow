import { Router } from 'express';
import { insert, normalizeSearch, one, q, run, uid, update, val } from '../db.ts';
import { DAY, HttpError, getSettings, guard, h, mustFind, orderStagesFor } from '../core.ts';
import { toJalali, fromJalali, JALALI_MONTHS } from '../../../shared/jalali.ts';

/* ═════════════════════════ Tasks ═════════════════════════ */

export const tasksRouter = Router();
tasksRouter.use(guard('tasks'));

tasksRouter.get('/tasks', h((req) => q(
  `SELECT t.*, u.full_name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
   WHERE t.org_id = ? ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END, COALESCE(t.due_at, 9e15)`, req.user.orgId,
)));

const TASK_COLUMNS = ['title', 'description', 'assignee_id', 'due_at', 'status', 'priority', 'ref_type', 'ref_id'];

tasksRouter.post('/tasks', h((req) => {
  if (!req.body?.title?.trim()) throw new HttpError(400, 'عنوان کار الزامی است');
  const id = uid('task');
  const now = Date.now();
  insert('tasks', { status: 'todo', priority: 'normal', ...req.body, id, orgId: req.user.orgId, createdBy: req.user.id,
    assigneeId: req.body.assigneeId ?? req.user.id, createdAt: now, updatedAt: now },
  ['id', 'org_id', 'created_by', 'created_at', 'updated_at', ...TASK_COLUMNS]);
  return { id };
}));

tasksRouter.put('/tasks/:id', h((req) => {
  const t = mustFind('tasks', req.params.id, req.user.orgId, 'کار');
  update('tasks', t.id, req.user.orgId, { ...req.body, updatedAt: Date.now() }, [...TASK_COLUMNS, 'updated_at']);
}));

tasksRouter.delete('/tasks/:id', h((req) => {
  run('DELETE FROM tasks WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
}));

/* ═════════════════════════ Finance ═════════════════════════ */

export const financeRouter = Router();
financeRouter.use(guard('finance'));

const EXPENSE_COLUMNS = ['category', 'amount', 'at', 'description', 'payee', 'ref_type', 'ref_id'];

financeRouter.get('/expenses', h((req) => q(
  'SELECT * FROM expenses WHERE org_id = ? ORDER BY at DESC LIMIT 500', req.user.orgId,
)));

financeRouter.post('/expenses', h((req) => {
  const b = req.body ?? {};
  if (!(Number(b.amount) > 0) || !b.category) throw new HttpError(400, 'دسته و مبلغ هزینه الزامی است');
  const id = uid('exp');
  insert('expenses', { at: Date.now(), ...b, id, orgId: req.user.orgId, userId: req.user.id, createdAt: Date.now() },
    ['id', 'org_id', 'user_id', 'created_at', ...EXPENSE_COLUMNS]);
  return { id };
}));

financeRouter.put('/expenses/:id', h((req) => {
  const e = mustFind('expenses', req.params.id, req.user.orgId, 'هزینه');
  update('expenses', e.id, req.user.orgId, req.body ?? {}, EXPENSE_COLUMNS);
}));

financeRouter.delete('/expenses/:id', h((req) => {
  run('DELETE FROM expenses WHERE id = ? AND org_id = ?', req.params.id, req.user.orgId);
}));

/** Start of the Jalali month `offset` months before the current one. */
function jalaliMonthStart(offset: number) {
  const j = toJalali(Date.now());
  let jy = j.jy, jm = j.jm - offset;
  while (jm < 1) { jm += 12; jy--; }
  return { start: fromJalali(jy, jm, 1, 0), label: JALALI_MONTHS[jm - 1] };
}

function monthlySeries(orgId: string, months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const offset = months - 1 - i;
    const { start, label } = jalaliMonthStart(offset);
    const end = offset === 0 ? Date.now() + 1 : jalaliMonthStart(offset - 1).start;
    return {
      label,
      revenue: val<number>('SELECT COALESCE(SUM(amount),0) FROM payments WHERE org_id = ? AND paid_at >= ? AND paid_at < ?', orgId, start, end),
      expenses: val<number>('SELECT COALESCE(SUM(amount),0) FROM expenses WHERE org_id = ? AND at >= ? AND at < ?', orgId, start, end),
      booked: val<number>("SELECT COALESCE(SUM(total),0) FROM orders WHERE org_id = ? AND status != 'cancelled' AND stage != 'quote' AND created_at >= ? AND created_at < ?", orgId, start, end),
    };
  });
}

financeRouter.get('/finance/summary', h((req) => {
  const orgId = req.user.orgId;
  const monthStart = jalaliMonthStart(0).start;
  const receivables = q(
    `SELECT o.id, o.number, o.total, o.paid, o.stage, o.status, c.name AS contact_name, o.created_at
     FROM orders o JOIN contacts c ON c.id = o.contact_id
     WHERE o.org_id = ? AND o.status != 'cancelled' AND o.stage != 'quote' AND o.total > o.paid ORDER BY (o.total - o.paid) DESC`, orgId,
  );
  // Gross margin per closed/open order: line revenue vs. current item cost.
  const margin = one(
    `SELECT COALESCE(SUM(l.qty * l.unit_price * (1 - l.discount_pct/100.0)),0) AS revenue, COALESCE(SUM(l.qty * i.cost),0) AS cost
     FROM order_lines l JOIN orders o ON o.id = l.order_id JOIN items i ON i.id = l.item_id
     WHERE o.org_id = ? AND o.status != 'cancelled' AND o.stage != 'quote'`, orgId,
  )!;
  return {
    revenueMonth: val<number>('SELECT COALESCE(SUM(amount),0) FROM payments WHERE org_id = ? AND paid_at >= ?', orgId, monthStart),
    expensesMonth: val<number>('SELECT COALESCE(SUM(amount),0) FROM expenses WHERE org_id = ? AND at >= ?', orgId, monthStart),
    receivable: receivables.reduce((sum, r) => sum + r.total - r.paid, 0),
    receivables,
    inventoryValue: val<number>('SELECT COALESCE(SUM(s.qty * i.cost),0) FROM stock s JOIN items i ON i.id = s.item_id WHERE s.org_id = ?', orgId),
    payable: val<number>(
      `SELECT COALESCE(SUM((l.qty - l.received_qty) * l.unit_cost),0) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id
       WHERE p.org_id = ? AND p.status IN ('sent','confirmed','in_transit','partial')`, orgId,
    ),
    grossMargin: margin.revenue ? Math.round(((margin.revenue - margin.cost) / margin.revenue) * 100) : 0,
    byCategory: q(
      'SELECT category, SUM(amount) AS total FROM expenses WHERE org_id = ? AND at >= ? GROUP BY category ORDER BY total DESC',
      orgId, jalaliMonthStart(5).start,
    ),
    series: monthlySeries(orgId),
    payments: q(
      `SELECT p.*, o.number AS order_number, c.name AS contact_name FROM payments p JOIN orders o ON o.id = p.order_id
       JOIN contacts c ON c.id = o.contact_id WHERE p.org_id = ? ORDER BY p.paid_at DESC LIMIT 30`, orgId,
    ),
  };
}));

/* ═════════════════════════ Dashboard, alerts, search, activity ═════════════════════════ */

export const insightsRouter = Router();

/**
 * Cross-module exceptions that need a human. This is what makes the system an
 * operating system rather than seven filing cabinets: one list of what is late,
 * short, at risk or waiting — wherever it lives.
 */
function buildAlerts(orgId: string) {
  const now = Date.now();
  const s = getSettings(orgId);
  const alerts: { id: string; severity: 'critical' | 'warning' | 'info'; module: string; title: string; detail: string; link: string }[] = [];

  for (const o of q(
    `SELECT o.*, c.name AS contact_name FROM orders o JOIN contacts c ON c.id = o.contact_id
     WHERE o.org_id = ? AND o.status = 'open'`, orgId,
  )) {
    const stage = orderStagesFor(orgId, o.fulfillment, !!o.needsInstallation).find((st) => st.key === o.stage);
    const days = (now - o.stageEnteredAt) / DAY;
    if (o.promisedAt && o.promisedAt < now) {
      alerts.push({ id: `op-${o.id}`, severity: 'critical', module: 'sales', title: `سفارش ${o.number} از موعد تحویل گذشته`, detail: o.contactName, link: `/sales/orders/${o.id}` });
    } else if (stage?.slaDays && days > stage.slaDays) {
      alerts.push({ id: `os-${o.id}`, severity: 'warning', module: 'sales', title: `سفارش ${o.number} در «${stage.label}» معطل مانده`, detail: `${Math.round(days)} روز — ${o.contactName}`, link: `/sales/orders/${o.id}` });
    }
  }
  for (const p of q(
    `SELECT p.*, s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.org_id = ? AND p.status IN ('sent','confirmed','in_transit','partial') AND p.expected_at < ?`, orgId, now,
  )) {
    alerts.push({ id: `po-${p.id}`, severity: 'warning', module: 'scm', title: `تأخیر در خرید ${p.number}`, detail: `${p.supplierName} — ${Math.round((now - p.expectedAt) / DAY)} روز تأخیر`, link: `/scm/purchase-orders/${p.id}` });
  }
  for (const i of q(
    `SELECT i.id, i.name, i.reorder_point,
       COALESCE((SELECT SUM(qty - reserved) FROM stock WHERE item_id = i.id),0) AS free,
       COALESCE((SELECT SUM(l.qty - l.received_qty) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id
                 WHERE l.item_id = i.id AND p.status IN ('sent','confirmed','in_transit','partial')),0) AS incoming
     FROM items i WHERE i.org_id = ? AND i.active = 1 AND i.kind != 'service' AND i.reorder_point > 0`, orgId,
  ).filter((i) => i.free + i.incoming <= i.reorderPoint)) {
    alerts.push({ id: `st-${i.id}`, severity: i.free <= 0 ? 'critical' : 'warning', module: 'inventory', title: `موجودی ${i.name} زیر نقطه سفارش`, detail: `آزاد: ${i.free} — نقطه سفارش: ${i.reorderPoint}`, link: `/inventory/items/${i.id}` });
  }
  for (const t of q(
    `SELECT t.*, c.name AS contact_name FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id
     WHERE t.org_id = ? AND t.status NOT IN ('resolved','closed') AND t.sla_due_at < ?`, orgId, now,
  )) {
    alerts.push({ id: `tk-${t.id}`, severity: 'critical', module: 'service', title: `SLA تیکت ${t.number} نقض شده`, detail: `${t.subject} — ${t.contactName ?? ''}`, link: `/service/tickets/${t.id}` });
  }
  const overdue = val<number>("SELECT COUNT(*) FROM followups WHERE org_id = ? AND status = 'pending' AND due_at < ?", orgId, now - 3_600_000);
  if (overdue) alerts.push({ id: 'fu', severity: 'warning', module: 'crm', title: `${overdue} پیگیری عقب‌افتاده`, detail: 'سرنخ‌ها منتظر تماس شما هستند', link: '/crm/followups' });
  const untouched = val<number>(
    "SELECT COUNT(*) FROM contacts WHERE org_id = ? AND last_contact_at IS NULL AND stage NOT IN ('customer','lost') AND created_at < ?",
    orgId, now - s.scoring.firstTouchHours * 3_600_000,
  );
  if (untouched) alerts.push({ id: 'ut', severity: 'warning', module: 'crm', title: `${untouched} سرنخ بدون اولین تماس`, detail: `بیش از ${s.scoring.firstTouchHours} ساعت از ثبت گذشته`, link: '/crm/contacts?untouched=1' });
  for (const w of q(
    `SELECT w.*, i.name AS item_name FROM work_orders w JOIN items i ON i.id = w.item_id
     WHERE w.org_id = ? AND w.status = 'open' AND w.due_at < ?`, orgId, now,
  )) {
    alerts.push({ id: `wo-${w.id}`, severity: 'warning', module: 'production', title: `دستور تولید ${w.number} از موعد گذشته`, detail: `${w.qty} عدد ${w.itemName}`, link: `/production/work-orders/${w.id}` });
  }
  const expiring = val<number>(
    "SELECT COUNT(*) FROM units WHERE org_id = ? AND status = 'installed' AND warranty_until BETWEEN ? AND ?", orgId, now, now + 30 * DAY,
  );
  if (expiring) alerts.push({ id: 'wr', severity: 'info', module: 'service', title: `گارانتی ${expiring} دستگاه در ۳۰ روز آینده تمام می‌شود`, detail: 'فرصت فروش تمدید گارانتی / سرویس دوره‌ای', link: '/units?warranty=expiring' });
  const order = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

insightsRouter.get('/alerts', h((req) => buildAlerts(req.user.orgId)));

insightsRouter.get('/dashboard', h((req) => {
  const orgId = req.user.orgId;
  const s = getSettings(orgId);
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = startToday.getTime() + DAY;
  const monthStart = jalaliMonthStart(0).start;

  const openOrders = q("SELECT * FROM orders WHERE org_id = ? AND status = 'open'", orgId);
  const funnel = s.lifecycleStages.map((st) => ({
    ...st, count: val<number>('SELECT COUNT(*) FROM contacts WHERE org_id = ? AND stage = ?', orgId, st.key),
  }));
  const pipelineStages = s.orderStages.map((st) => ({
    ...st,
    count: openOrders.filter((o) => o.stage === st.key).length,
    value: openOrders.filter((o) => o.stage === st.key).reduce((sum, o) => sum + o.total, 0),
  }));
  const unitsByStatus = q('SELECT status, COUNT(*) AS n FROM units WHERE org_id = ? GROUP BY status', orgId);

  return {
    kpis: {
      revenueMonth: val<number>('SELECT COALESCE(SUM(amount),0) FROM payments WHERE org_id = ? AND paid_at >= ?', orgId, monthStart),
      bookedMonth: val<number>("SELECT COALESCE(SUM(total),0) FROM orders WHERE org_id = ? AND status != 'cancelled' AND stage != 'quote' AND created_at >= ?", orgId, monthStart),
      openOrders: openOrders.length,
      openOrdersValue: openOrders.reduce((sum, o) => sum + o.total, 0),
      quotes: openOrders.filter((o) => o.stage === 'quote').length,
      receivable: openOrders.reduce((sum, o) => sum + Math.max(0, o.total - o.paid), 0)
        + val<number>("SELECT COALESCE(SUM(total - paid),0) FROM orders WHERE org_id = ? AND status = 'done' AND total > paid", orgId),
      hotLeads: val<number>("SELECT COUNT(*) FROM contacts WHERE org_id = ? AND score >= ? AND stage NOT IN ('customer','lost')", orgId, s.scoring.hotThreshold),
      warmLeads: val<number>("SELECT COUNT(*) FROM contacts WHERE org_id = ? AND score >= ? AND score < ? AND stage NOT IN ('customer','lost')", orgId, s.scoring.warmThreshold, s.scoring.hotThreshold),
      newLeadsMonth: val<number>('SELECT COUNT(*) FROM contacts WHERE org_id = ? AND created_at >= ?', orgId, monthStart),
      conversionsMonth: val<number>("SELECT COUNT(*) FROM contacts WHERE org_id = ? AND stage = 'customer' AND converted_at >= ?", orgId, monthStart),
      wip: val<number>("SELECT COALESCE(SUM(qty),0) FROM work_orders WHERE org_id = ? AND status = 'open'", orgId),
      readyStock: val<number>("SELECT COUNT(*) FROM units WHERE org_id = ? AND status = 'in_stock'", orgId),
      installedBase: val<number>("SELECT COUNT(*) FROM units WHERE org_id = ? AND status IN ('installed','in_repair')", orgId),
      openTickets: val<number>("SELECT COUNT(*) FROM tickets WHERE org_id = ? AND status NOT IN ('resolved','closed')", orgId),
      csat: val<number | null>('SELECT ROUND(AVG(satisfaction), 1) FROM tickets WHERE org_id = ? AND satisfaction IS NOT NULL', orgId),
      lateOrders: openOrders.filter((o) => o.promisedAt && o.promisedAt < now).length,
      delayedPos: val<number>("SELECT COUNT(*) FROM purchase_orders WHERE org_id = ? AND status IN ('sent','confirmed','in_transit','partial') AND expected_at < ?", orgId, now),
    },
    funnel,
    pipelineStages,
    unitsByStatus,
    series: monthlySeries(orgId),
    alerts: buildAlerts(orgId).slice(0, 8),
    agenda: {
      followups: q(
        `SELECT f.*, c.name AS contact_name, c.phones_json FROM followups f JOIN contacts c ON c.id = f.contact_id
         WHERE f.org_id = ? AND f.status = 'pending' AND f.due_at < ? ORDER BY f.due_at LIMIT 8`, orgId, endToday,
      ),
      installations: q(
        `SELECT t.*, c.name AS contact_name FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id
         WHERE t.org_id = ? AND t.status NOT IN ('resolved','closed') AND t.scheduled_at BETWEEN ? AND ? ORDER BY t.scheduled_at LIMIT 6`,
        orgId, startToday.getTime(), startToday.getTime() + 7 * DAY,
      ),
      deliveries: q(
        `SELECT p.id, p.number, p.expected_at, s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.org_id = ? AND p.status IN ('sent','confirmed','in_transit','partial') AND p.expected_at < ? ORDER BY p.expected_at LIMIT 6`,
        orgId, now + 7 * DAY,
      ),
    },
    activity: q(
      `SELECT a.*, u.full_name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.org_id = ? ORDER BY a.at DESC LIMIT 14`, orgId,
    ),
  };
}));

insightsRouter.get('/activity', h((req) => q(
  `SELECT a.*, u.full_name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
   WHERE a.org_id = ? ${req.query.type ? 'AND a.entity_type = ?' : ''} ORDER BY a.at DESC LIMIT 200`,
  req.user.orgId, ...(req.query.type ? [String(req.query.type)] : []),
)));

/** One search box for everything: people, phone numbers, serials, documents, parts. */
insightsRouter.get('/search', h((req) => {
  const raw = String(req.query.q ?? '').trim();
  if (raw.length < 2) return [];
  const orgId = req.user.orgId;
  const like = `%${raw}%`;
  const norm = `%${normalizeSearch(raw)}%`;
  const results: { type: string; id: string; title: string; subtitle: string; link: string }[] = [];
  for (const c of q('SELECT id, name, company, stage FROM contacts WHERE org_id = ? AND search LIKE ? LIMIT 6', orgId, norm)) {
    results.push({ type: 'contact', id: c.id, title: c.name, subtitle: c.company || 'مخاطب', link: `/crm/contacts/${c.id}` });
  }
  for (const u of q(
    `SELECT u.id, u.serial, i.name, c.name AS contact_name FROM units u JOIN items i ON i.id = u.item_id
     LEFT JOIN contacts c ON c.id = u.contact_id WHERE u.org_id = ? AND u.serial LIKE ? LIMIT 6`, orgId, like,
  )) results.push({ type: 'unit', id: u.id, title: u.serial, subtitle: `${u.name}${u.contactName ? ` — ${u.contactName}` : ''}`, link: `/units/${u.serial}` });
  for (const o of q(
    'SELECT o.id, o.number, c.name FROM orders o JOIN contacts c ON c.id = o.contact_id WHERE o.org_id = ? AND o.number LIKE ? LIMIT 5', orgId, like,
  )) results.push({ type: 'order', id: o.id, title: o.number, subtitle: o.name, link: `/sales/orders/${o.id}` });
  for (const p of q(
    'SELECT p.id, p.number, s.name FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id WHERE p.org_id = ? AND (p.number LIKE ? OR p.tracking_no LIKE ?) LIMIT 5', orgId, like, like,
  )) results.push({ type: 'po', id: p.id, title: p.number, subtitle: p.name, link: `/scm/purchase-orders/${p.id}` });
  for (const w of q('SELECT id, number FROM work_orders WHERE org_id = ? AND number LIKE ? LIMIT 4', orgId, like)) {
    results.push({ type: 'work_order', id: w.id, title: w.number, subtitle: 'دستور تولید', link: `/production/work-orders/${w.id}` });
  }
  for (const t of q('SELECT id, number, subject FROM tickets WHERE org_id = ? AND (number LIKE ? OR subject LIKE ?) LIMIT 5', orgId, like, like)) {
    results.push({ type: 'ticket', id: t.id, title: t.number, subtitle: t.subject, link: `/service/tickets/${t.id}` });
  }
  for (const i of q('SELECT id, sku, name FROM items WHERE org_id = ? AND (sku LIKE ? OR name LIKE ?) LIMIT 5', orgId, like, like)) {
    results.push({ type: 'item', id: i.id, title: i.name, subtitle: i.sku, link: `/inventory/items/${i.id}` });
  }
  for (const s of q('SELECT id, name, city FROM suppliers WHERE org_id = ? AND name LIKE ? LIMIT 4', orgId, like)) {
    results.push({ type: 'supplier', id: s.id, title: s.name, subtitle: s.city || 'تأمین‌کننده', link: `/scm/suppliers?focus=${s.id}` });
  }
  return results;
}));
