/**
 * Seeds the Elecio workspace: Elecio's own presets plus a realistic four-month
 * operating history (leads, quotes, orders, purchasing, production, devices in
 * the field, service tickets, expenses).
 *
 * The history is produced by running the real workflow services on a simulated
 * clock, so every stock level, serial number, stage log and warranty date is
 * exactly what the application itself would have produced.
 *
 *   npm run seed        → wipe and re-seed
 */
import { fileURLToPath } from 'node:url';
import { getDb, insert, one, q, resetDb, run, uid, val } from './db.ts';
import { DAY, HOUR, getSettings, nextNumber, type AuthUser } from './core.ts';
import { ELECIO_DEFAULTS } from '../../shared/defaults.ts';
import { buildContactSearch, rescore, setStage, syncContactMeta } from './services/crm.ts';
import { moveStock } from './services/inventory.ts';
import { hashPassword, seedPassword } from './security.ts';
import {
  advanceOrder, advanceWorkOrder, allocateOrder, createTicket, createWorkOrder, recalcOrder, recordQc,
  setTicketStatus, shipOrder,
} from './services/workflow.ts';

export function seed(password = seedPassword()) {
  const realNow = Date.now;
  const today = realNow();
  const midnight = new Date(today); midnight.setHours(0, 0, 0, 0);
  const start = midnight.getTime() - 120 * DAY;
  let clock = start;
  Date.now = () => clock;
  /** Move the simulated clock to `day` (0…120) of the story. */
  const at = (day: number, hour = 10) => { clock = start + day * DAY + hour * HOUR; };

  try {
    getDb();
    const orgId = uid('org');
    insert('orgs', {
      id: orgId, name: 'الکیو', slug: 'elecio', settings: ELECIO_DEFAULTS, counters: {}, createdAt: start,
    }, ['id', 'name', 'slug', 'settings_json', 'counters_json', 'created_at']);

    /* ───────── People ───────── */
    const hash = hashPassword(password);
    const people: Record<string, AuthUser> = {};
    for (const [username, fullName, role] of [
      ['admin', 'مدیر سیستم', 'owner'],
      ['sara', 'سارا احمدی', 'sales'],
      ['reza', 'رضا کریمی', 'warehouse'],
      ['ali', 'علی محمدی', 'production'],
      ['neda', 'ندا رضایی', 'support'],
    ] as const) {
      const id = uid('usr');
      insert('users', { id, orgId, username, fullName, passwordHash: hash, role, phone: '', active: 1, createdAt: start },
        ['id', 'org_id', 'username', 'full_name', 'password_hash', 'role', 'phone', 'active', 'created_at']);
      people[username] = { id, orgId, role, fullName };
    }
    const { admin, sara, reza, ali, neda } = people;

    /* ───────── Warehouses ───────── */
    const wh: Record<string, string> = {};
    for (const [code, name, kind] of [
      ['WH-P', 'انبار قطعات الکترونیک', 'parts'],
      ['WH-F', 'انبار محصول نهایی', 'finished'],
      ['WH-R', 'انبار تعمیرات و قرنطینه', 'repair'],
    ]) {
      wh[kind] = uid('wh');
      insert('warehouses', { id: wh[kind], orgId, code, name, kind, address: 'تهران، شهرک صنعتی', createdAt: start },
        ['id', 'org_id', 'code', 'name', 'kind', 'address', 'created_at']);
    }

    /* ───────── Suppliers ───────── */
    const sup: Record<string, string> = {};
    for (const [key, name, person, country, city, categories, lead, rating] of [
      ['hongtai', 'Shenzhen Hongtai Electronics', 'Kevin Liu', 'چین', 'شنزن', 'ماژول WiFi، آی‌سی', 35, 4],
      ['pcb', 'صنایع برد چاپی پارس‌مدار', 'مهندس نوری', 'ایران', 'تهران', 'PCB، مونتاژ SMD', 14, 5],
      ['arad', 'آلومینیوم‌سازی دقیق آراد', 'آقای جعفری', 'ایران', 'اصفهان', 'قاب آلومینیومی', 12, 3],
      ['amin', 'پخش قطعات الکترونیک امین', 'آقای امینی', 'ایران', 'تهران', 'کانکتور، آداپتور، کابل', 3, 4],
      ['naghsh', 'چاپ و بسته‌بندی نقش', 'خانم صادقی', 'ایران', 'تهران', 'جعبه، لیبل', 7, 4],
    ] as const) {
      sup[key] = uid('sup');
      insert('suppliers', {
        id: sup[key], orgId, name, contactPerson: person, phone: country === 'چین' ? '+86 755 0000 0000' : '021-00000000',
        email: '', country, city, categories, leadTimeDays: lead, rating, createdAt: start,
      }, ['id', 'org_id', 'name', 'contact_person', 'phone', 'email', 'country', 'city', 'categories', 'lead_time_days', 'rating', 'created_at']);
    }

    /* ───────── Item master ───────── */
    const item: Record<string, string> = {};
    const addItem = (key: string, data: Record<string, any>) => {
      item[key] = uid('itm');
      insert('items', { unit: 'عدد', active: 1, serialized: 0, ...data, id: item[key], orgId, createdAt: start },
        ['id', 'org_id', 'sku', 'name', 'kind', 'category', 'unit', 'price', 'cost', 'serialized', 'warranty_months', 'hw_rev',
          'fw_version', 'reorder_point', 'reorder_qty', 'lead_time_days', 'supplier_id', 'description', 'active', 'created_at']);
    };
    addItem('E1', { sku: 'ELC-E1', name: 'الکیو DNC وایرلس E1', kind: 'product', category: 'دستگاه DNC', price: 48_000_000, cost: 5_200_000, serialized: 1, warrantyMonths: 18, hwRev: 'C', fwVersion: '3.2.1', reorderPoint: 3, reorderQty: 8, leadTimeDays: 10, description: 'انتقال بی‌سیم برنامه CNC از طریق WiFi — یک پورت سریال RS232' });
    addItem('E2', { sku: 'ELC-E2', name: 'الکیو DNC Pro E2 (دو پورت)', kind: 'product', category: 'دستگاه DNC', price: 72_000_000, cost: 6_400_000, serialized: 1, warrantyMonths: 18, hwRev: 'B', fwVersion: '3.2.1', reorderPoint: 2, reorderQty: 4, leadTimeDays: 12, description: 'دو پورت سریال، پشتیبانی از DNC Drip-Feed و حافظه داخلی' });
    addItem('ACC_ANT', { sku: 'ACC-ANT8', name: 'آنتن تقویتی 8dBi با پایه مغناطیسی', kind: 'product', category: 'لوازم جانبی', price: 1_800_000, cost: 650_000, reorderPoint: 6, reorderQty: 20 });
    addItem('ACC_CBL', { sku: 'ACC-CBL5', name: 'کابل RS232 شیلددار ۵ متری', kind: 'product', category: 'لوازم جانبی', price: 950_000, cost: 320_000, reorderPoint: 8, reorderQty: 30, supplierId: sup.amin });
    addItem('INST', { sku: 'SRV-INST', name: 'نصب و راه‌اندازی در محل', kind: 'service', category: 'خدمات', price: 4_500_000 });
    addItem('TRN', { sku: 'SRV-TRN', name: 'آموزش اپراتور و نرم‌افزار', kind: 'service', category: 'خدمات', price: 3_000_000 });
    addItem('WEXT', { sku: 'SRV-WEXT', name: 'تمدید گارانتی ۱۲ ماهه', kind: 'service', category: 'خدمات', price: 8_000_000 });
    addItem('LIC', { sku: 'SW-MGR', name: 'لایسنس Elecio Manager (Bridge/TNC)', kind: 'service', category: 'نرم‌افزار', price: 6_000_000 });
    const parts: [string, string, string, number, number, string, number][] = [
      ['ESP', 'CMP-ESP32S3', 'ماژول ESP32-S3-WROOM-1', 420_000, 20, 'hongtai', 50],
      ['PCB1', 'CMP-PCB-E1C', 'برد اصلی E1 — Rev C', 1_900_000, 8, 'pcb', 20],
      ['PCB2', 'CMP-PCB-E2B', 'برد اصلی E2 — Rev B', 2_600_000, 4, 'pcb', 10],
      ['MAX', 'CMP-MAX3232', 'آی‌سی مبدل سطح MAX3232', 85_000, 30, 'hongtai', 60],
      ['DB9', 'CMP-DB9M', 'کانکتور DB9 نری فلزی', 60_000, 25, 'amin', 40],
      ['DB25', 'CMP-DB25M', 'کانکتور DB25 نری', 110_000, 8, 'amin', 20],
      ['ANT', 'CMP-ANT5', 'آنتن 5dBi با کانکتور SMA', 230_000, 15, 'hongtai', 40],
      ['ENC', 'CMP-ENC-AL', 'قاب آلومینیومی اکسترود + درپوش', 780_000, 10, 'arad', 20],
      ['PSU', 'CMP-PSU12', 'آداپتور صنعتی 12V 2A', 350_000, 12, 'amin', 20],
      ['BOX', 'CMP-BOX', 'جعبه بسته‌بندی با فوم', 140_000, 12, 'naghsh', 30],
      ['LBL', 'CMP-LBL', 'لیبل سریال و برچسب پلمپ', 15_000, 40, 'naghsh', 200],
    ];
    for (const [key, sku, name, cost, rp, s, rq] of parts) {
      addItem(key, { sku, name, kind: 'component', category: 'قطعات الکترونیک', cost, reorderPoint: rp, reorderQty: rq, supplierId: sup[s], leadTimeDays: one('SELECT lead_time_days FROM suppliers WHERE id = ?', sup[s])!.leadTimeDays });
    }
    const bom = (parent: string, lines: [string, number][]) => {
      for (const [c, qty] of lines) {
        run('INSERT INTO bom_lines (id, org_id, parent_id, component_id, qty) VALUES (?, ?, ?, ?, ?)', uid('bom'), orgId, item[parent], item[c], qty);
      }
    };
    bom('E1', [['ESP', 1], ['PCB1', 1], ['MAX', 1], ['DB9', 1], ['ANT', 1], ['ENC', 1], ['PSU', 1], ['BOX', 1], ['LBL', 2]]);
    bom('E2', [['ESP', 1], ['PCB2', 1], ['MAX', 2], ['DB9', 1], ['DB25', 1], ['ANT', 1], ['ENC', 1], ['PSU', 1], ['BOX', 1], ['LBL', 2]]);

    /* ───────── Opening balance ───────── */
    at(0, 9);
    for (const [key, qty] of [
      ['ESP', 26], ['PCB1', 17], ['PCB2', 6], ['MAX', 40], ['DB9', 30], ['DB25', 8], ['ANT', 24], ['ENC', 24],
      ['PSU', 27], ['BOX', 24], ['LBL', 90], ['ACC_ANT', 14], ['ACC_CBL', 22],
    ] as [string, number][]) {
      const kind = one('SELECT kind FROM items WHERE id = ?', item[key])!.kind;
      moveStock(reza, { itemId: item[key], kind: 'receipt', qty, toWh: kind === 'component' ? wh.parts : wh.finished, note: 'موجودی اول دوره' });
    }

    /* ───────── Tags ───────── */
    const tag: Record<string, string> = {};
    for (const [key, name, color] of [
      ['expo', 'نمایشگاه ماشین‌ابزار ۱۴۰۵', '#779BE7'],
      ['heid', 'کاربر هایدن‌هاین', '#0FD69D'],
      ['vip', 'VIP', '#FF499E'],
      ['demo', 'دمو گرفته', '#F5B85A'],
      ['tender', 'مناقصه', '#B48CF2'],
    ]) {
      tag[key] = uid('tag');
      insert('tags', { id: tag[key], orgId, name, color, createdAt: start }, ['id', 'org_id', 'name', 'color', 'created_at']);
    }

    /* ───────── Contacts ───────── */
    const contact: Record<string, string> = {};
    const geo: Record<string, [string, string, number, number]> = {
      tehran: ['تهران', 'شهریار', 35.659, 51.059], tehranRey: ['تهران', 'ری', 35.597, 51.436], pakdasht: ['تهران', 'پاکدشت', 35.475, 51.68],
      tehranCity: ['تهران', 'تهران', 35.715, 51.404], isfahan: ['اصفهان', 'اصفهان', 32.612, 51.631], shiraz: ['فارس', 'شیراز', 29.626, 52.531],
      mashhad: ['خراسان رضوی', 'مشهد', 36.337, 59.512], karaj: ['البرز', 'کرج', 35.829, 50.951], tabriz: ['آذربایجان شرقی', 'تبریز', 38.066, 46.373],
      arak: ['مرکزی', 'اراک', 34.069, 49.689], kermanshah: ['کرمانشاه', 'کرمانشاه', 34.33, 47.09], yazd: ['یزد', 'یزد', 31.861, 54.355],
      qazvin: ['قزوین', 'قزوین', 36.275, 50.006], qom: ['قم', 'قم', 34.61, 50.86], saveh: ['مرکزی', 'ساوه', 35.021, 50.357],
      rasht: ['گیلان', 'رشت', 37.272, 49.594], ahvaz: ['خوزستان', 'اهواز', 31.318, 48.67], shahrekord: ['چهارمحال و بختیاری', 'شهرکرد', 32.326, 50.864],
    };
    const addContact = (key: string, day: number, d: {
      name: string; person: string; title: string; phone: string; place: keyof typeof geo; source: string; type?: string;
      machines: number; controllers: string[]; industry: string; value?: number; starred?: boolean; tags?: string[]; owner?: AuthUser;
      detail?: string; area?: string;
    }) => {
      at(day, 11);
      const id = uid('ct');
      contact[key] = id;
      const [province, county, lat, lng] = geo[d.place];
      const record = {
        id, orgId, ownerId: (d.owner ?? sara).id, kind: 'company', name: d.name, company: d.person, jobTitle: d.title,
        phones: [{ type: 'mobile', value: d.phone }, { type: 'work', value: `0${21 + (day % 60)}-${3300 + day * 7}` }],
        emails: [], website: '', leadSource: d.source, leadSourceDetail: d.detail ?? '', stage: 'cold_lead',
        customerType: d.type ?? 'workshop', rating: 0, starred: d.starred ? 1 : 0, estimatedValue: d.value ?? null,
        attrs: { machines: d.machines, controllers: d.controllers, industry: d.industry }, notes: '',
        stageChangedAt: clock, createdAt: clock, updatedAt: clock,
      };
      const addresses = [{ title: 'کارخانه', province, county, address: d.area ?? `${county}، شهرک صنعتی`, lat, lng }];
      insert('contacts', { ...record, search: buildContactSearch(record, addresses) },
        ['id', 'org_id', 'owner_id', 'kind', 'name', 'company', 'job_title', 'phones_json', 'emails_json', 'website', 'lead_source',
          'lead_source_detail', 'stage', 'customer_type', 'rating', 'starred', 'estimated_value', 'attrs_json', 'notes',
          'stage_changed_at', 'search', 'created_at', 'updated_at']);
      insert('contact_addresses', { id: uid('adr'), orgId, contactId: id, ...addresses[0], isPrimary: 1, sortOrder: 0 },
        ['id', 'org_id', 'contact_id', 'title', 'province', 'county', 'address', 'lat', 'lng', 'is_primary', 'sort_order']);
      for (const t of d.tags ?? []) run('INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', id, tag[t]);
      rescore(id);
    };
    const touch = (key: string, day: number, type: string, outcome: string, body: string, user: AuthUser = sara, hour = 11) => {
      at(day, hour);
      insert('interactions', {
        id: uid('int'), orgId, contactId: contact[key], userId: user.id, type, direction: outcome === 'inbound' ? 'inbound' : 'outbound',
        outcome: outcome === 'inbound' ? 'answered' : outcome, subject: '', body, durationMin: type === 'call' ? 4 + (day % 9) : type === 'meeting' ? 60 : null,
        at: clock, createdAt: clock,
      }, ['id', 'org_id', 'contact_id', 'user_id', 'type', 'direction', 'outcome', 'subject', 'body', 'duration_min', 'at', 'created_at']);
      syncContactMeta(contact[key]);
    };
    const followUp = (key: string, day: number, dueDay: number, note: string, priority = 'normal', user: AuthUser = sara, status = 'pending') => {
      at(day, 12);
      insert('followups', {
        id: uid('fu'), orgId, contactId: contact[key], userId: user.id, dueAt: start + dueDay * DAY + 10 * HOUR, priority, note,
        status, completedAt: status === 'done' ? start + dueDay * DAY + 11 * HOUR : null, createdAt: clock,
      }, ['id', 'org_id', 'contact_id', 'user_id', 'due_at', 'priority', 'note', 'status', 'completed_at', 'created_at']);
      syncContactMeta(contact[key]);
    };
    const stage = (key: string, day: number, st: string, reason?: string) => { at(day, 15); setStage(contact[key], st, reason); };

    addContact('pars', 2, { name: 'صنایع قالب‌سازی پارس', person: 'مهندس حسینی', title: 'مدیر تولید', phone: '09121110001', place: 'tehran', source: 'exhibition', type: 'factory', machines: 12, controllers: ['Heidenhain', 'Fanuc'], industry: 'قالب‌سازی', value: 120_000_000, starred: true, tags: ['expo', 'heid', 'vip'] });
    addContact('arya', 4, { name: 'ماشین‌سازی دقیق آریا', person: 'آقای رحیمی', title: 'مالک', phone: '09131110002', place: 'isfahan', source: 'referral', machines: 8, controllers: ['Heidenhain'], industry: 'ماشین‌سازی', value: 160_000_000, tags: ['heid'] });
    addContact('sepehr', 8, { name: 'قطعه‌سازان خودرو سپهر', person: 'مهندس کاظمی', title: 'سرپرست CNC', phone: '09121110003', place: 'tehranRey', source: 'website', type: 'factory', machines: 15, controllers: ['Siemens', 'Fanuc'], industry: 'قطعه‌سازی خودرو', value: 150_000_000 });
    addContact('novin', 12, { name: 'صنایع هوایی نوین‌فن', person: 'دکتر شریفی', title: 'مدیر فنی', phone: '09171110004', place: 'shiraz', source: 'exhibition', type: 'factory', machines: 22, controllers: ['Heidenhain', 'Siemens'], industry: 'هوافضا', value: 260_000_000, starred: true, tags: ['expo', 'heid', 'tender'] });
    addContact('toos', 30, { name: 'قالب و پرس توس', person: 'آقای قاسمی', title: 'مدیر کارگاه', phone: '09151110005', place: 'mashhad', source: 'instagram', machines: 5, controllers: ['Fanuc'], industry: 'قالب‌سازی', value: 85_000_000 });
    addContact('alborz', 55, { name: 'تراشکاری صنعتی البرز', person: 'آقای مرادی', title: 'مالک', phone: '09121110006', place: 'karaj', source: 'cold_call', machines: 4, controllers: ['Syntec', 'Fanuc'], industry: 'ماشین‌سازی', value: 100_000_000 });
    addContact('azartek', 70, { name: 'شرکت مهندسی آذرتک', person: 'مهندس عباسی', title: 'مدیر خرید', phone: '09141110007', place: 'tabriz', source: 'dealer', type: 'factory', machines: 10, controllers: ['Heidenhain'], industry: 'نفت و گاز', value: 210_000_000, tags: ['heid', 'demo'] });
    addContact('kaveh', 85, { name: 'گروه صنعتی کاوه', person: 'آقای نجفی', title: 'مدیر نت', phone: '09181110008', place: 'arak', source: 'exhibition', type: 'factory', machines: 18, controllers: ['Siemens'], industry: 'ماشین‌سازی', value: 90_000_000, tags: ['expo'] });
    addContact('zagros', 20, { name: 'ابزارسازی زاگرس', person: 'آقای کریمیان', title: 'مالک', phone: '09181110009', place: 'kermanshah', source: 'phone', machines: 3, controllers: ['Fanuc'], industry: 'قالب‌سازی', value: 50_000_000 });
    addContact('yazd', 60, { name: 'فن‌آوران قطعه یزد', person: 'مهندس دهقان', title: 'مدیر تولید', phone: '09131110010', place: 'yazd', source: 'referral', machines: 6, controllers: ['Heidenhain'], industry: 'قطعه‌سازی خودرو', value: 55_000_000, tags: ['heid'] });
    addContact('omid', 88, { name: 'کارگاه CNC امید', person: 'آقای صالحی', title: 'مالک', phone: '09121110011', place: 'qazvin', source: 'instagram', machines: 3, controllers: ['Fanuc'], industry: 'ماشین‌سازی', value: 48_000_000 });
    addContact('sahand', 92, { name: 'صنایع ریخته‌گری سهند', person: 'آقای اسدی', title: 'سرپرست تعمیرات', phone: '09141110012', place: 'tabriz', source: 'cold_call', type: 'factory', machines: 7, controllers: ['Siemens', 'Mitsubishi'], industry: 'ماشین‌سازی' });
    addContact('iut', 45, { name: 'دانشکده مهندسی مکانیک — دانشگاه صنعتی', person: 'دکتر طاهری', title: 'مسئول آزمایشگاه CNC', phone: '09131110013', place: 'isfahan', source: 'website', type: 'education', machines: 4, controllers: ['Heidenhain', 'Siemens'], industry: 'سایر', value: 96_000_000, tags: ['tender'] });
    addContact('alpha', 96, { name: 'قالب‌سازی آلفا', person: 'مهندس فرهادی', title: 'مدیرعامل', phone: '09121110014', place: 'pakdasht', source: 'exhibition', machines: 9, controllers: ['Heidenhain'], industry: 'قالب‌سازی', value: 384_000_000, starred: true, tags: ['expo', 'heid', 'demo'] });
    addContact('kian', 117, { name: 'ماشین‌کاری دقیق کیان', person: 'آقای کیانی', title: 'مالک', phone: '09121110015', place: 'qom', source: 'website', machines: 6, controllers: ['Fanuc'], industry: 'قطعه‌سازی خودرو' });
    addContact('setareh', 75, { name: 'تولیدی پیچ و مهره ستاره', person: 'آقای نیک‌نام', title: 'مدیر کارخانه', phone: '09151110016', place: 'mashhad', source: 'cold_call', type: 'factory', machines: 11, controllers: ['Mitsubishi'], industry: 'ماشین‌سازی' });
    addContact('turbine', 65, { name: 'توربین‌سازان شرق', person: 'مهندس رضوی', title: 'مدیر مهندسی', phone: '09151110017', place: 'mashhad', source: 'referral', type: 'factory', machines: 25, controllers: ['Siemens', 'Heidenhain'], industry: 'نفت و گاز', value: 480_000_000, starred: true, tags: ['heid', 'tender', 'vip'] });
    addContact('rakhsh', 98, { name: 'قطعه‌سازی رخش', person: 'آقای بهرامی', title: 'سرپرست تولید', phone: '09181110018', place: 'saveh', source: 'dealer', machines: 5, controllers: ['Fanuc', 'Syntec'], industry: 'قطعه‌سازی خودرو', value: 96_000_000 });
    addContact('arian', 102, { name: 'صنایع تجهیزات پزشکی آرین‌طب', person: 'خانم دکتر یوسفی', title: 'مدیر تولید', phone: '09121110019', place: 'tehranCity', source: 'website', type: 'factory', machines: 6, controllers: ['Haas', 'Fanuc'], industry: 'تجهیزات پزشکی', value: 144_000_000 });
    addContact('negin', 108, { name: 'قالب‌سازی نگین', person: 'آقای پورعلی', title: 'مالک', phone: '09111110020', place: 'rasht', source: 'instagram', machines: 2, controllers: ['Fanuc'], industry: 'قالب‌سازی' });
    addContact('petro', 80, { name: 'پتروصنعت جنوب', person: 'مهندس موسوی', title: 'کارشناس خرید', phone: '09161110021', place: 'ahvaz', source: 'exhibition', type: 'factory', machines: 14, controllers: ['Siemens'], industry: 'نفت و گاز', value: 220_000_000, tags: ['expo', 'tender'] });
    addContact('pouya', 110, { name: 'مدل‌سازی صنعتی پویا', person: 'آقای شاکری', title: 'مالک', phone: '09121110022', place: 'karaj', source: 'phone', machines: 3, controllers: ['Syntec'], industry: 'قالب‌سازی' });
    addContact('abzar', 50, { name: 'بازرگانی ابزار صنعت', person: 'آقای توکلی', title: 'مدیر فروش', phone: '09171110023', place: 'shiraz', source: 'dealer', type: 'dealer', machines: 0, controllers: [], industry: 'سایر', value: 200_000_000 });
    addContact('pishro', 90, { name: 'چرخ‌دنده‌سازی پیشرو', person: 'مهندس ملکی', title: 'مدیر فنی', phone: '09121110024', place: 'tehranCity', source: 'referral', type: 'factory', machines: 13, controllers: ['Heidenhain', 'Fanuc'], industry: 'ماشین‌سازی', value: 240_000_000, tags: ['heid'] });
    addContact('saina', 119, { name: 'قالب‌های تزریق پلاستیک ساینا', person: 'آقای حیدری', title: 'مالک', phone: '09121110025', place: 'qazvin', source: 'instagram', machines: 4, controllers: ['Fanuc'], industry: 'قالب‌سازی' });
    addContact('kouhrang', 35, { name: 'صنایع فلزی کوهرنگ', person: 'آقای امیری', title: 'مدیر خرید', phone: '09131110026', place: 'shahrekord', source: 'exhibition', machines: 5, controllers: ['Fanuc'], industry: 'ماشین‌سازی', value: 96_000_000, tags: ['expo'] });

    // Conversations that led to the sales below.
    touch('pars', 3, 'call', 'answered', 'پس از نمایشگاه تماس گرفته شد؛ مشکل انتقال برنامه با فلاپی/کابل دارند.');
    touch('pars', 9, 'meeting', 'interested', 'دمو در کارخانه روی ماشین DMG با کنترل هایدن‌هاین — رضایت کامل.');
    stage('pars', 9, 'qualified');
    touch('arya', 5, 'call', 'answered', 'معرفی توسط صنایع پارس. ۸ ماشین هایدن‌هاین دارند.');
    touch('arya', 16, 'visit', 'interested', 'بازدید حضوری و تست روی TNC 530.');
    touch('sepehr', 9, 'call', 'answered', 'از طریق سایت فرم پر کرده‌اند. نیاز به اتصال زیمنس 840D.');
    touch('sepehr', 30, 'meeting', 'interested', 'جلسه با واحد فنی و خرید.');
    touch('novin', 13, 'call', 'answered', 'نیاز به راهکار بدون سیم برای سالن ۲۲ ماشینه.');
    touch('novin', 40, 'meeting', 'interested', 'ارائه فنی و بررسی امنیت شبکه.');
    touch('novin', 70, 'call', 'callback', 'منتظر تأیید هیئت‌مدیره برای سفارش ۵ دستگاه.');
    touch('toos', 31, 'message', 'answered', 'درخواست کاتالوگ در اینستاگرام.');
    touch('toos', 60, 'call', 'interested', 'قیمت تأیید شد.');
    touch('alborz', 56, 'call', 'no_answer', '');
    touch('alborz', 58, 'call', 'answered', 'معرفی محصول؛ علاقه‌مند به E1.');
    touch('alborz', 90, 'visit', 'interested', 'دمو در کارگاه.');
    touch('azartek', 71, 'call', 'answered', 'از طریق نماینده تبریز. ۱۰ ماشین هایدن‌هاین.');
    touch('azartek', 95, 'meeting', 'interested', 'دمو آنلاین و ارسال مشخصات فنی.');
    touch('kaveh', 86, 'call', 'answered', 'در نمایشگاه کارت گرفتیم؛ پروژه بازسازی ماشین‌ها.');
    touch('zagros', 21, 'call', 'answered', 'استعلام قیمت.');
    touch('zagros', 50, 'call', 'not_interested', 'قیمت را بالا دانستند و نمونه چینی خریدند.');
    touch('yazd', 61, 'call', 'answered', 'معرفی توسط آریا.');
    touch('yazd', 75, 'visit', 'interested', 'بازدید و تست.');
    touch('omid', 89, 'call', 'answered', 'کارگاه کوچک، بودجه محدود.');
    touch('omid', 110, 'call', 'callback', 'خواستند بعد از پایان ماه تماس بگیریم.');
    touch('sahand', 93, 'call', 'no_answer', '');
    touch('iut', 46, 'call', 'answered', 'برای آزمایشگاه دانشگاه — نیاز به مناقصه.');
    touch('iut', 80, 'meeting', 'interested', 'ارائه در دانشکده؛ درخواست پیش‌فاکتور رسمی.');
    stage('iut', 80, 'qualified');
    touch('alpha', 97, 'call', 'answered', 'در نمایشگاه بسیار علاقه‌مند بودند.');
    touch('alpha', 104, 'meeting', 'interested', 'دمو روی ۲ ماشین؛ قصد خرید ۸ دستگاه.');
    touch('alpha', 115, 'call', 'inbound', 'خودشان تماس گرفتند و زمان تحویل پرسیدند.');
    stage('alpha', 104, 'qualified');
    touch('setareh', 76, 'call', 'no_answer', '');
    touch('setareh', 82, 'call', 'no_answer', '');
    touch('setareh', 95, 'call', 'no_answer', '');
    touch('turbine', 66, 'call', 'answered', 'معرفی توسط نوین‌فن؛ ۲۵ ماشین.');
    touch('turbine', 85, 'meeting', 'interested', 'جلسه فنی با تیم IT کارخانه.');
    touch('turbine', 112, 'call', 'interested', 'درخواست پایلوت روی ۳ ماشین.');
    stage('turbine', 85, 'qualified');
    touch('rakhsh', 99, 'call', 'answered', 'نماینده ساوه معرفی کرد.');
    touch('arian', 103, 'call', 'answered', 'درخواست اطلاعات فنی سازگاری با Haas.');
    touch('arian', 113, 'email', 'answered', 'ارسال دیتاشیت و ویدیو دمو.');
    touch('petro', 81, 'call', 'answered', 'در نمایشگاه آشنا شدیم.');
    touch('petro', 100, 'meeting', 'interested', 'دمو آنلاین برای تیم خرید.');
    stage('petro', 100, 'qualified');
    touch('abzar', 51, 'meeting', 'interested', 'مذاکره نمایندگی فروش در استان فارس.');
    touch('pishro', 91, 'call', 'answered', 'معرفی توسط سپهر.');
    touch('pishro', 106, 'visit', 'interested', 'بازدید و تست روی TNC 640.');
    stage('pishro', 106, 'qualified');
    touch('negin', 109, 'message', 'answered', 'پرسش قیمت در دایرکت.');
    touch('kouhrang', 36, 'call', 'answered', 'از نمایشگاه.');
    touch('kouhrang', 62, 'call', 'not_interested', 'محصول مشابه داخلی خریدند.');
    // Leads whose conversation has started but are not qualified yet.
    stage('omid', 89, 'warm_lead');
    stage('rakhsh', 99, 'warm_lead');
    stage('arian', 103, 'warm_lead');
    stage('sahand', 93, 'warm_lead');
    stage('kouhrang', 62, 'lost', 'انتخاب رقیب');
    stage('zagros', 50, 'lost', 'قیمت');
    run('UPDATE contacts SET referred_by_id = ? WHERE id IN (?, ?)', contact.pars, contact.arya, contact.yazd);
    run('UPDATE contacts SET referred_by_id = ? WHERE id = ?', contact.novin, contact.turbine);

    /* ───────── Helper: create an order the same way the API does ───────── */
    const s = getSettings(orgId);
    const order = (key: string, day: number, lines: [string, number, number?][], o: { fulfillment?: 'stock' | 'mto'; install?: boolean; promiseDays?: number; priority?: string; user?: AuthUser } = {}) => {
      at(day, 12);
      const id = uid('so');
      const stages = s.orderStages.filter((st) => (!st.onlyFor || st.onlyFor === (o.fulfillment ?? 'stock')) && (o.install !== false || st.key !== 'installation'));
      insert('orders', {
        id, orgId, number: nextNumber(orgId, s.company.orderPrefix), contactId: contact[key],
        addressId: one('SELECT id FROM contact_addresses WHERE contact_id = ?', contact[key])!.id, ownerId: (o.user ?? sara).id,
        stage: stages[0].key, stageEnteredAt: clock, status: 'open', fulfillment: o.fulfillment ?? 'stock', priority: o.priority ?? 'normal',
        promisedAt: o.promiseDays ? clock + o.promiseDays * DAY : null, discount: 0, taxRate: s.company.taxRate,
        needsInstallation: o.install === false ? 0 : 1, notes: '', createdAt: clock, updatedAt: clock,
      }, ['id', 'org_id', 'number', 'contact_id', 'address_id', 'owner_id', 'stage', 'stage_entered_at', 'status', 'fulfillment',
        'priority', 'promised_at', 'discount', 'tax_rate', 'needs_installation', 'notes', 'created_at', 'updated_at']);
      lines.forEach(([k, qty, price], index) => run(
        'INSERT INTO order_lines (id, order_id, item_id, qty, unit_price, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        uid('ol'), id, item[k], qty, price ?? one('SELECT price FROM items WHERE id = ?', item[k])!.price, index,
      ));
      recalcOrder(id);
      run("INSERT INTO stage_log (id, org_id, entity_type, entity_id, stage, entered_at, user_id) VALUES (?, ?, 'order', ?, ?, ?, ?)",
        uid('sl'), orgId, id, stages[0].key, clock, (o.user ?? sara).id);
      const c = one('SELECT stage FROM contacts WHERE id = ?', contact[key])!;
      if (['cold_lead', 'warm_lead', 'qualified'].includes(c.stage)) setStage(contact[key], 'negotiation');
      return id;
    };
    const pay = (orderId: string, day: number, pct: number | 'rest', method = 'transfer') => {
      at(day, 13);
      const o = one('SELECT total, paid FROM orders WHERE id = ?', orderId)!;
      const amount = pct === 'rest' ? o.total - o.paid : Math.round(o.total * pct / 100);
      run('INSERT INTO payments (id, org_id, order_id, amount, method, reference, paid_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        uid('pay'), orgId, orderId, amount, method, `TRX-${Math.floor(100000 + Math.random() * 899999)}`, clock, admin.id);
      recalcOrder(orderId);
    };
    const advance = (orderId: string, day: number, to?: string, user: AuthUser = sara, hour = 14) => { at(day, hour); advanceOrder(user, orderId, { to }); };
    const allocate = (orderId: string, day: number, bulkOnly = false) => {
      at(day, 10);
      for (const l of q(`SELECT l.id FROM order_lines l JOIN items i ON i.id = l.item_id WHERE l.order_id = ? AND i.kind != 'service' ${bulkOnly ? 'AND i.serialized = 0' : ''}`, orderId)) {
        allocateOrder(reza, orderId, { lineId: l.id });
      }
    };
    const ship = (orderId: string, day: number, carrier: string, tracking: string, cost = 0) => { at(day, 16); shipOrder(reza, orderId, { carrier, trackingNo: tracking, cost }); };
    const ticketOf = (orderId: string) => one("SELECT id FROM tickets WHERE order_id = ? AND type = 'installation'", orderId)?.id as string;
    const resolve = (ticketId: string, day: number, text: string, csat?: number) => {
      at(day, 17);
      run("UPDATE tickets SET assignee_id = ?, status = 'in_progress' WHERE id = ?", neda.id, ticketId);
      setTicketStatus(neda, ticketId, 'resolved', text);
      if (csat) run('UPDATE tickets SET satisfaction = ? WHERE id = ?', csat, ticketId);
    };

    /* ───────── Production: run a work order through every stage with QC ───────── */
    const produce = (key: string, qty: number, day: number, stepDays: number[], failOne = false, orderId?: string) => {
      at(day, 9);
      const woId = orderId
        ? one('SELECT id FROM work_orders WHERE order_id = ? ORDER BY created_at DESC', orderId)!.id
        : createWorkOrder(ali, { itemId: item[key], qty, priority: 'normal', dueAt: clock + 14 * DAY, assigneeId: ali.id, notes: 'تولید برای انبار' });
      run('UPDATE work_orders SET assignee_id = ? WHERE id = ?', ali.id, woId);
      const stages = s.workOrderStages.map((st) => st.key);
      stepDays.forEach((d, i) => {
        const target = stages[i + 1];
        if (!target) return;
        if (target === 'packaging') {
          // QC happens while in "testing" — just before leaving it.
          at(d, 11);
          const units = q('SELECT id FROM units WHERE work_order_id = ?', woId);
          units.forEach((u, index) => {
            const fail = failOne && index === 0;
            recordQc(ali, woId, { unitId: u.id, results: s.qcChecklist.map((check, ci) => ({ check, ok: !(fail && ci === 3) })) });
            if (fail) recordQc(ali, woId, { unitId: u.id, results: s.qcChecklist.map((check) => ({ check, ok: true })), note: 'تعویض آنتن و تست مجدد' });
          });
        }
        at(d, 15);
        advanceWorkOrder(ali, woId, { to: target });
      });
      return woId;
    };

    produce('E1', 8, 1, [2, 4, 6, 8, 9, 10], true);
    produce('E2', 4, 6, [7, 9, 11, 13, 14, 15]);

    /* ───────── Purchasing history ───────── */
    const po = (supplier: string, day: number, lines: [string, number][], expectedDay: number, status: string, method = '') => {
      at(day, 10);
      const id = uid('po');
      insert('purchase_orders', {
        id, orgId, number: nextNumber(orgId, s.company.poPrefix), supplierId: sup[supplier], status: 'draft',
        expectedAt: start + expectedDay * DAY, shippingMethod: method, shippingCost: supplier === 'hongtai' ? 9_500_000 : 0,
        notes: '', createdBy: reza.id, createdAt: clock, updatedAt: clock,
      }, ['id', 'org_id', 'number', 'supplier_id', 'status', 'expected_at', 'shipping_method', 'shipping_cost', 'notes', 'created_by', 'created_at', 'updated_at']);
      for (const [k, qty] of lines) {
        run('INSERT INTO po_lines (id, po_id, item_id, qty, unit_cost) VALUES (?, ?, ?, ?, ?)', uid('pol'), id, item[k], qty,
          one('SELECT cost FROM items WHERE id = ?', item[k])!.cost);
      }
      if (status !== 'draft') run("UPDATE purchase_orders SET status = ?, ordered_at = ? WHERE id = ?", status, clock, id);
      return id;
    };
    const receive = (poId: string, day: number) => {
      at(day, 11);
      for (const l of q('SELECT * FROM po_lines WHERE po_id = ?', poId)) {
        moveStock(reza, { itemId: l.itemId, kind: 'receipt', qty: l.qty, toWh: wh.parts, refType: 'po', refId: poId,
          note: one('SELECT number FROM purchase_orders WHERE id = ?', poId)!.number });
        run('UPDATE po_lines SET received_qty = qty WHERE id = ?', l.id);
      }
      const total = val<number>('SELECT SUM(qty * unit_cost) FROM po_lines WHERE po_id = ?', poId)
        + one('SELECT shipping_cost FROM purchase_orders WHERE id = ?', poId)!.shippingCost;
      run("UPDATE purchase_orders SET status = 'received', received_at = ? WHERE id = ?", clock, poId);
      run(`INSERT INTO expenses (id, org_id, category, amount, at, description, ref_type, ref_id, user_id, created_at)
           VALUES (?, ?, 'خرید قطعات', ?, ?, ?, 'po', ?, ?, ?)`, uid('exp'), orgId, total, clock,
        `سفارش خرید ${one('SELECT number FROM purchase_orders WHERE id = ?', poId)!.number}`, poId, reza.id, clock);
    };
    const po1 = po('hongtai', 20, [['ESP', 50], ['MAX', 60], ['ANT', 30]], 55, 'in_transit', 'هوایی — DHL');
    run("UPDATE purchase_orders SET tracking_no = 'DHL 7731 0044 12' WHERE id = ?", po1);
    const po2 = po('pcb', 38, [['PCB1', 20], ['PCB2', 8]], 52, 'confirmed', 'تحویل درب کارخانه');
    receive(po2, 50);
    receive(po1, 58);
    const po3 = po('arad', 95, [['ENC', 20]], 107, 'in_transit', 'باربری');
    run("UPDATE purchase_orders SET tracking_no = 'BAR-14050712-88' WHERE id = ?", po3);
    po('amin', 112, [['DB9', 40], ['PSU', 20], ['DB25', 12]], 123, 'confirmed', 'پیک');
    po('naghsh', 116, [['BOX', 30], ['LBL', 200]], 125, 'sent', 'پیک');
    po('hongtai', 118, [['ANT', 40], ['ESP', 40]], 160, 'draft', 'هوایی');

    /* ───────── Sales history ───────── */
    // O1 — Pars: 2× E1 + install + training, delivered.
    const o1 = order('pars', 18, [['E1', 2], ['INST', 2], ['TRN', 1], ['LIC', 1]], { promiseDays: 21 });
    advance(o1, 19); pay(o1, 20, 50); advance(o1, 21); allocate(o1, 21); advance(o1, 22); advance(o1, 23);
    ship(o1, 24, 'تیپاکس', 'TPX-881204', 650_000); advance(o1, 25); advance(o1, 26);
    pay(o1, 28, 'rest'); resolve(ticketOf(o1), 28, 'نصب روی دو ماشین DMG و آموزش اپراتورها انجام شد.', 5); advance(o1, 29, undefined, neda);

    // O2 — Arya: 3× E1 + cables, delivered.
    const o2 = order('arya', 24, [['E1', 3], ['ACC_CBL', 3], ['INST', 3]], { promiseDays: 25 });
    advance(o2, 26); pay(o2, 27, 50); advance(o2, 28); allocate(o2, 28); advance(o2, 29); advance(o2, 31);
    ship(o2, 32, 'باربری ایران‌پیما', 'IRP-55120', 1_400_000); advance(o2, 35); advance(o2, 36);
    pay(o2, 40, 'rest'); resolve(ticketOf(o2), 39, 'نصب روی ۳ ماشین TNC 530 — تنظیم baud rate روی 115200', 4); advance(o2, 40, undefined, neda);

    // O9 — Zagros: quote that was lost on price.
    const o9 = order('zagros', 30, [['E1', 1], ['INST', 1]]);
    at(50, 12); run("UPDATE orders SET status = 'cancelled', cancel_reason = 'قیمت بالاتر از بودجه', closed_at = ? WHERE id = ?", clock, o9);
    setStage(contact.zagros, 'lost', 'قیمت');

    // O3 — Sepehr: 2× E2, delivered.
    const o3 = order('sepehr', 40, [['E2', 2], ['INST', 2], ['LIC', 1]], { promiseDays: 20 });
    advance(o3, 42); pay(o3, 44, 60); advance(o3, 45); allocate(o3, 45); advance(o3, 46); advance(o3, 47);
    ship(o3, 48, 'تیپاکس', 'TPX-902211', 700_000); advance(o3, 49); advance(o3, 50);
    pay(o3, 55, 'rest'); resolve(ticketOf(o3), 54, 'اتصال به Siemens 840D sl با کابل null-modem — تست موفق', 5); advance(o3, 56, undefined, neda);

    // O10 — Yazd: 1× E1 delivered, balance still open.
    const o10 = order('yazd', 80, [['E1', 1], ['INST', 1]], { promiseDays: 15 });
    advance(o10, 81); pay(o10, 82, 50); advance(o10, 83); allocate(o10, 83); advance(o10, 84); advance(o10, 85);
    ship(o10, 86, 'تیپاکس', 'TPX-930017', 900_000); advance(o10, 87); advance(o10, 88);
    pay(o10, 95, 20); resolve(ticketOf(o10), 93, 'نصب انجام شد؛ مشتری درخواست آموزش تکمیلی دارد.', 4);
    at(96, 10); advanceOrder(admin, o10, { force: true, note: 'تحویل با توافق مدیریت — مانده حساب طی چک ۳۰ روزه' });

    order('iut', 82, [['E1', 2], ['TRN', 2], ['LIC', 1]], { promiseDays: 45 });

    // Restock E1 for upcoming demand.
    produce('E1', 6, 60, [61, 63, 65, 66, 67, 68]);

    // O4 — Novin-Fan: 5× E1 make-to-order, now in production.
    const o4 = order('novin', 98, [['E1', 5], ['ACC_ANT', 5], ['INST', 5], ['TRN', 2], ['LIC', 1]], { fulfillment: 'mto', promiseDays: 30, priority: 'high' });
    run("UPDATE orders SET notes = 'نسخه سفارشی: آنتن خارجی و فریمور با رمزنگاری WPA2-Enterprise' WHERE id = ?", o4);
    advance(o4, 99, undefined, admin); pay(o4, 101, 50); advance(o4, 102, undefined, admin); advance(o4, 102, undefined, admin, 15);
    at(103, 9);
    const wo3 = one('SELECT id FROM work_orders WHERE order_id = ?', o4)!.id;
    run('UPDATE work_orders SET assignee_id = ?, priority = ? WHERE id = ?', ali.id, 'high', wo3);
    at(104, 10); advanceWorkOrder(ali, wo3, {}); // → kitting
    at(106, 10); advanceWorkOrder(ali, wo3, {}); // → assembly (consumes parts, creates serials)
    at(112, 10); advanceWorkOrder(ali, wo3, {}); // → firmware
    at(114, 10); advanceWorkOrder(ali, wo3, {}); // → testing
    at(115, 11);
    q('SELECT id FROM units WHERE work_order_id = ? ORDER BY serial LIMIT 3', wo3).forEach((u) =>
      recordQc(ali, wo3, { unitId: u.id, results: s.qcChecklist.map((check) => ({ check, ok: true })) }));
    // Bulk accessories for O4 are reserved from stock already.
    allocate(o4, 103, true);

    // A stock replenishment order that is stuck in kitting: enclosures are short
    // because the aluminium supplier's shipment is late — visible end to end.
    at(117, 9);
    const wo4 = createWorkOrder(ali, { itemId: item.E1, qty: 6, dueAt: start + 128 * DAY, assigneeId: ali.id, notes: 'تأمین موجودی اطمینان' });
    at(117, 11); advanceWorkOrder(ali, wo4, {});

    // O5 — Toos: 1× E2, shipped, waiting for installation.
    const o5 = order('toos', 100, [['E2', 1], ['ACC_ANT', 1], ['INST', 1]], { promiseDays: 18 });
    advance(o5, 101); pay(o5, 103, 50); advance(o5, 104); allocate(o5, 104); advance(o5, 105); advance(o5, 107);
    ship(o5, 110, 'باربری توس‌بار', 'TB-221-889', 1_800_000); advance(o5, 113); advance(o5, 115);
    at(115, 15);
    run('UPDATE tickets SET assignee_id = ?, status = ?, scheduled_at = ?, sla_due_at = ? WHERE id = ?',
      neda.id, 'open', start + 121 * DAY + 10 * HOUR, start + 122 * DAY + 10 * HOUR, ticketOf(o5));

    // O6 — Alborz: waiting for the deposit (stuck past its SLA).
    const o6 = order('alborz', 104, [['E1', 2], ['INST', 2]], { promiseDays: 20 });
    advance(o6, 108); advance(o6, 109);

    // A reseller order from stock, accessories only, no installation.
    const o12 = order('abzar', 106, [['ACC_ANT', 4], ['ACC_CBL', 6]], { install: false, promiseDays: 7 });
    advance(o12, 106); pay(o12, 107, 'rest'); advance(o12, 107); allocate(o12, 107); advance(o12, 108); advance(o12, 108);
    ship(o12, 109, 'پست پیشتاز', 'PST-77120044'); advance(o12, 112); advance(o12, 113);

    // O7 / O8 — open quotes.
    order('azartek', 113, [['E1', 4], ['INST', 4], ['TRN', 1], ['LIC', 1]], { promiseDays: 30 });
    order('kaveh', 117, [['E2', 2], ['INST', 2]], { promiseDays: 30, user: admin });
    stage('kaveh', 117, 'negotiation');

    /* ───────── Service desk ───────── */
    at(52, 10);
    const pu = one('SELECT id FROM units WHERE order_id = ? ORDER BY serial LIMIT 1', o1)!.id;
    const t1 = createTicket(neda, { unitId: pu, type: 'support', priority: 'normal', channel: 'phone', subject: 'قطع اتصال WiFi هنگام ارسال برنامه‌های طولانی', description: 'برنامه‌های بالای ۲ مگابایت وسط ارسال قطع می‌شود.' });
    at(53, 12); run('INSERT INTO ticket_comments (id, ticket_id, user_id, body, internal, at) VALUES (?, ?, ?, ?, 0, ?)', uid('tc'), t1, neda.id, 'فریمور به 3.2.1 ارتقا یافت و حالت flow-control سخت‌افزاری فعال شد.', clock);
    at(53, 15); run("UPDATE units SET fw_version = '3.2.1' WHERE id = ?", pu);
    resolve(t1, 53, 'ارتقای فریمور و فعال‌سازی RTS/CTS', 5);

    at(108, 9);
    const au = one('SELECT id FROM units WHERE order_id = ? ORDER BY serial LIMIT 1 OFFSET 1', o2)!.id;
    const t2 = createTicket(neda, { unitId: au, type: 'warranty_repair', priority: 'high', channel: 'phone', subject: 'آسیب پورت سریال بر اثر نوسان برق', description: 'دستگاه روشن می‌شود ولی ارسال انجام نمی‌شود. احتمال سوختن MAX3232.' });
    run("UPDATE tickets SET assignee_id = ?, status = 'in_progress' WHERE id = ?", neda.id, t2);
    at(110, 11); run('INSERT INTO ticket_comments (id, ticket_id, user_id, body, internal, at) VALUES (?, ?, ?, ?, 1, ?)', uid('tc'), t2, neda.id, 'دستگاه با پیک دریافت شد — تعویض آی‌سی و تست مجدد در جریان است.', clock);

    at(118, 16);
    const su = one('SELECT id FROM units WHERE order_id = ? ORDER BY serial LIMIT 1', o3)!.id;
    createTicket(neda, { unitId: su, type: 'support', priority: 'high', channel: 'whatsapp', subject: 'عدم شناسایی دستگاه در شبکه جدید کارخانه', description: 'پس از تعویض روتر، دستگاه IP نمی‌گیرد.' });

    at(119, 10);
    createTicket(sara, { contactId: contact.yazd, orderId: o10, type: 'training', priority: 'low', channel: 'phone', subject: 'آموزش تکمیلی ارسال DNC Drip-Feed', scheduledAt: start + 123 * DAY + 10 * HOUR });
    at(115, 14);
    const t5 = createTicket(sara, { contactId: contact.sepehr, type: 'complaint', priority: 'normal', channel: 'email', subject: 'تأخیر در ارسال فاکتور رسمی', description: '' });
    resolve(t5, 116, 'فاکتور رسمی صادر و ارسال شد.', 3);

    /* ───────── Follow-ups ───────── */
    followUp('alpha', 115, 120, 'ارسال پیش‌فاکتور ۸ دستگاه E1 + نصب', 'high');
    followUp('turbine', 112, 121, 'هماهنگی پایلوت ۳ دستگاه', 'high', admin);
    followUp('azartek', 113, 118, 'پیگیری تأیید پیش‌فاکتور', 'high');
    followUp('kaveh', 117, 122, 'تماس با مدیر نت برای تأیید فنی', 'normal', admin);
    followUp('omid', 110, 119, 'تماس بعد از پایان ماه', 'normal');
    followUp('pishro', 106, 116, 'ارسال پیش‌فاکتور برای ۵ دستگاه', 'high');
    followUp('arian', 113, 120, 'پیگیری تست سازگاری Haas', 'normal');
    followUp('petro', 100, 124, 'پیگیری مناقصه', 'normal');
    followUp('alborz', 109, 117, 'یادآوری واریز پیش‌پرداخت', 'high');
    followUp('rakhsh', 99, 123, 'هماهنگی دمو', 'normal');
    followUp('pars', 100, 126, 'پیشنهاد توسعه به ۱۰ ماشین باقیمانده', 'normal');
    followUp('iut', 82, 113, 'پیگیری مناقصه دانشگاه', 'normal');
    followUp('setareh', 95, 119, 'آخرین تلاش برای تماس', 'low');

    /* ───────── Expenses ───────── */
    for (let m = 0; m < 4; m++) {
      const d = 5 + m * 30;
      at(d, 9);
      for (const [category, amount, description] of [
        ['اجاره و سربار', 65_000_000, 'اجاره کارگاه و دفتر'],
        ['دستمزد', 380_000_000, 'حقوق و دستمزد ماهانه'],
        ['بازاریابی', m === 2 ? 140_000_000 : 18_000_000, m === 2 ? 'غرفه نمایشگاه ماشین‌ابزار' : 'تبلیغات اینستاگرام'],
      ] as [string, number, string][]) {
        run('INSERT INTO expenses (id, org_id, category, amount, at, description, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          uid('exp'), orgId, category, amount, clock, description, admin.id, clock);
      }
    }
    for (const [d, amount, description] of [[24, 6_500_000, 'سفر نصب — شهریار'], [34, 14_000_000, 'سفر نصب — اصفهان'], [92, 18_000_000, 'سفر نصب — یزد']] as [number, number, string][]) {
      at(d, 18);
      run("INSERT INTO expenses (id, org_id, category, amount, at, description, user_id, created_at) VALUES (?, ?, 'سفر و نصب', ?, ?, ?, ?, ?)",
        uid('exp'), orgId, amount, clock, description, neda.id, clock);
    }

    /* ───────── Tasks ───────── */
    at(116, 9);
    for (const [title, assignee, dueDay, priority, refType, refKey] of [
      ['آماده‌سازی نسخه فریمور 3.3 برای انتشار', ali, 125, 'normal', null, null],
      ['پیگیری ترخیص محموله Hongtai', reza, 121, 'high', 'po', null],
      ['تهیه پیش‌فاکتور رسمی دانشگاه', sara, 119, 'high', 'contact', 'iut'],
      ['به‌روزرسانی کاتالوگ محصولات', sara, 130, 'low', null, null],
      ['شمارش دوره‌ای انبار قطعات', reza, 122, 'normal', null, null],
    ] as [string, AuthUser, number, string, string | null, string | null][]) {
      run(`INSERT INTO tasks (id, org_id, title, assignee_id, created_by, due_at, status, priority, ref_type, ref_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)`, uid('task'), orgId, title, assignee.id, admin.id, start + dueDay * DAY,
      priority, refType, refKey ? contact[refKey] : null, clock, clock);
    }

    clock = today;
    for (const { id } of q('SELECT id FROM contacts WHERE org_id = ?', orgId)) syncContactMeta(id);
    console.log('[seed] workspace "elecio" ready — initial account passwords were securely hashed');
  } finally {
    Date.now = realNow;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--reset')) {
  const password = seedPassword();
  resetDb();
  seed(password);
}
