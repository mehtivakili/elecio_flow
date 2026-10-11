/**
 * Workspace settings.
 *
 * Every workflow, label and threshold in Elecio Flow is data, not code: each
 * organization (tenant) stores its own copy of these settings. A new workspace
 * starts from ELECIO_DEFAULTS — the presets for Elecio's own operation — and
 * can then be reshaped from the Settings page without touching the code.
 */

export interface StageDef {
  key: string;
  label: string;
  color: string;
  /** Expected days in this stage; overdue stages are flagged as delayed. */
  slaDays?: number;
  /** Built-in check that must pass before leaving the stage. */
  gate?: GateKind;
  /** Only applies to orders fulfilled this way (make-to-order vs. from stock). */
  onlyFor?: 'mto' | 'stock';
  /** Terminal stage — reaching it closes the record. */
  final?: boolean;
}

export type GateKind =
  | 'deposit'        // paid >= depositPct of total
  | 'full_payment'   // paid >= total
  | 'allocation'     // every serialized line has units reserved
  | 'shipment'       // at least one outbound shipment exists
  | 'kitting'        // BOM components available & consumed (work orders)
  | 'qc_pass';       // every unit of the work order passed QC

export interface OptionDef {
  key: string;
  label: string;
  color?: string;
}

export interface CustomFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'multiselect';
  options?: string[];
}

export interface ScoringSettings {
  hotThreshold: number;
  warmThreshold: number;
  /** Controllers that make a lead a strong product fit. */
  targetControllers: string[];
  /** Estimated deal value (in currency units) that counts as a big deal. */
  highValue: number;
  /** Days without contact after which the score decays. */
  staleDays: number;
  /** Hours a brand-new lead may stay untouched before it is flagged. */
  firstTouchHours: number;
}

export interface WorkspaceSettings {
  company: {
    name: string;
    brand: string;
    currency: string;
    taxRate: number;
    depositPct: number;
    warrantyMonths: number;
    orderPrefix: string;
    poPrefix: string;
    woPrefix: string;
    ticketPrefix: string;
    serialPattern: string;
  };
  lifecycleStages: StageDef[];
  leadSources: OptionDef[];
  customerTypes: OptionDef[];
  lostReasons: string[];
  customFields: CustomFieldDef[];
  scoring: ScoringSettings;
  orderStages: StageDef[];
  workOrderStages: StageDef[];
  qcChecklist: string[];
  ticketTypes: OptionDef[];
  ticketSlaHours: Record<'urgent' | 'high' | 'normal' | 'low', number>;
  expenseCategories: string[];
}

export const ELECIO_DEFAULTS: WorkspaceSettings = {
  company: {
    name: 'الکیو',
    brand: 'Elecio',
    currency: 'تومان',
    taxRate: 10,
    depositPct: 50,
    warrantyMonths: 18,
    orderPrefix: 'SO',
    poPrefix: 'PO',
    woPrefix: 'WO',
    ticketPrefix: 'TK',
    serialPattern: '{SKU}-{YY}{MM}-{SEQ}',
  },
  lifecycleStages: [
    { key: 'cold_lead', label: 'سرنخ سرد', color: '#9DB4C0', slaDays: 14 },
    { key: 'warm_lead', label: 'سرنخ گرم', color: '#F5B85A', slaDays: 10 },
    { key: 'qualified', label: 'واجد شرایط / دمو', color: '#779BE7', slaDays: 10 },
    { key: 'negotiation', label: 'مذاکره و پیش‌فاکتور', color: '#B48CF2', slaDays: 14 },
    { key: 'customer', label: 'مشتری', color: '#0FD69D', final: true },
    { key: 'lost', label: 'از دست‌رفته', color: '#FF499E', final: true },
  ],
  leadSources: [
    { key: 'exhibition', label: 'نمایشگاه' },
    { key: 'referral', label: 'معرفی مشتری' },
    { key: 'instagram', label: 'اینستاگرام' },
    { key: 'website', label: 'وب‌سایت' },
    { key: 'phone', label: 'تماس ورودی' },
    { key: 'cold_call', label: 'تماس سرد' },
    { key: 'dealer', label: 'نماینده فروش' },
    { key: 'whatsapp', label: 'واتساپ / تلگرام' },
    { key: 'other', label: 'سایر' },
  ],
  customerTypes: [
    { key: 'workshop', label: 'کارگاه CNC', color: '#0FD69D' },
    { key: 'factory', label: 'کارخانه تولیدی', color: '#779BE7' },
    { key: 'dealer', label: 'نماینده / بازرگانی', color: '#F5B85A' },
    { key: 'education', label: 'دانشگاه و آموزشی', color: '#C2DFE3' },
  ],
  lostReasons: ['قیمت', 'زمان تحویل', 'انتخاب رقیب', 'عدم نیاز فعلی', 'عدم پاسخگویی', 'ناسازگاری فنی'],
  customFields: [
    { key: 'machines', label: 'تعداد ماشین CNC', type: 'number' },
    {
      key: 'controllers',
      label: 'کنترلرها',
      type: 'multiselect',
      options: ['Heidenhain', 'Fanuc', 'Siemens', 'Mitsubishi', 'Haas', 'Syntec', 'سایر'],
    },
    {
      key: 'industry',
      label: 'صنعت',
      type: 'select',
      options: ['قالب‌سازی', 'قطعه‌سازی خودرو', 'هوافضا', 'تجهیزات پزشکی', 'نفت و گاز', 'ماشین‌سازی', 'سایر'],
    },
  ],
  scoring: {
    hotThreshold: 70,
    warmThreshold: 40,
    targetControllers: ['Heidenhain', 'Fanuc', 'Siemens'],
    highValue: 300_000_000,
    staleDays: 30,
    firstTouchHours: 48,
  },
  orderStages: [
    { key: 'quote', label: 'پیش‌فاکتور', color: '#9DB4C0', slaDays: 5 },
    { key: 'confirmed', label: 'تأیید سفارش', color: '#C2DFE3', slaDays: 2 },
    { key: 'deposit', label: 'دریافت پیش‌پرداخت', color: '#F5B85A', slaDays: 4, gate: 'deposit' },
    { key: 'production', label: 'تأمین / تولید', color: '#779BE7', slaDays: 12, onlyFor: 'mto', gate: 'allocation' },
    { key: 'allocation', label: 'تخصیص از انبار', color: '#779BE7', slaDays: 1, onlyFor: 'stock', gate: 'allocation' },
    { key: 'packing', label: 'آماده‌سازی و بسته‌بندی', color: '#B48CF2', slaDays: 2 },
    { key: 'shipping', label: 'ارسال', color: '#5EC8E5', slaDays: 4, gate: 'shipment' },
    { key: 'installation', label: 'نصب و راه‌اندازی', color: '#0FD69D', slaDays: 7, gate: 'full_payment' },
    { key: 'delivered', label: 'تحویل نهایی', color: '#0FD69D', final: true },
  ],
  workOrderStages: [
    { key: 'planned', label: 'برنامه‌ریزی', color: '#9DB4C0', slaDays: 3 },
    { key: 'kitting', label: 'کیتینگ قطعات', color: '#F5B85A', slaDays: 2, gate: 'kitting' },
    { key: 'assembly', label: 'مونتاژ', color: '#779BE7', slaDays: 3 },
    { key: 'firmware', label: 'نصب فریمور', color: '#B48CF2', slaDays: 1 },
    { key: 'testing', label: 'تست و کنترل کیفیت', color: '#5EC8E5', slaDays: 2, gate: 'qc_pass' },
    { key: 'packaging', label: 'بسته‌بندی', color: '#C2DFE3', slaDays: 1 },
    { key: 'done', label: 'تکمیل و ورود به انبار', color: '#0FD69D', final: true },
  ],
  qcChecklist: [
    'روشن‌شدن و تست ولتاژ تغذیه',
    'اتصال WiFi و دسترسی به پنل وب',
    'انتقال فایل سریال با کنترلر نمونه',
    'تست برد آنتن (۳۰ متر)',
    'بررسی بدنه، لیبل و شماره سریال',
  ],
  ticketTypes: [
    { key: 'installation', label: 'نصب و راه‌اندازی', color: '#0FD69D' },
    { key: 'support', label: 'پشتیبانی فنی', color: '#779BE7' },
    { key: 'warranty_repair', label: 'تعمیر گارانتی', color: '#F5B85A' },
    { key: 'paid_repair', label: 'تعمیر خارج از گارانتی', color: '#B48CF2' },
    { key: 'training', label: 'آموزش', color: '#C2DFE3' },
    { key: 'complaint', label: 'شکایت', color: '#FF499E' },
  ],
  ticketSlaHours: { urgent: 4, high: 24, normal: 72, low: 168 },
  expenseCategories: ['خرید قطعات', 'حمل‌ونقل و گمرک', 'دستمزد', 'اجاره و سربار', 'بازاریابی', 'سفر و نصب', 'ابزار و تجهیزات', 'سایر'],
};

/* ───────────────────────── Roles & permissions ───────────────────────── */

export const MODULES = [
  'crm', 'sales', 'scm', 'inventory', 'production', 'units', 'service', 'finance', 'tasks', 'settings',
] as const;
export type Module = (typeof MODULES)[number];

export const ROLES = ['owner', 'admin', 'sales', 'warehouse', 'production', 'support', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'مالک',
  admin: 'مدیر سیستم',
  sales: 'فروش',
  warehouse: 'انبار و تأمین',
  production: 'تولید',
  support: 'پشتیبانی',
  viewer: 'فقط مشاهده',
};

/** Modules each role may change. `viewer` can read everything and change nothing. */
export const ROLE_MODULES: Record<Role, Module[]> = {
  owner: [...MODULES],
  admin: [...MODULES],
  sales: ['crm', 'sales', 'tasks', 'service'],
  warehouse: ['inventory', 'scm', 'sales', 'units', 'tasks'],
  production: ['production', 'inventory', 'units', 'tasks'],
  support: ['service', 'units', 'crm', 'tasks'],
  viewer: [],
};

export function canWrite(role: Role, module: Module): boolean {
  return ROLE_MODULES[role]?.includes(module) ?? false;
}

/* ─────────────────────────── Fixed vocabularies ─────────────────────────── */

export const PRIORITY_LABELS = { low: 'کم', normal: 'عادی', high: 'بالا', urgent: 'فوری' } as const;
export const PRIORITY_COLORS = { low: '#9DB4C0', normal: '#C2DFE3', high: '#F5B85A', urgent: '#FF499E' } as const;

export const UNIT_STATUS: Record<string, { label: string; color: string }> = {
  in_production: { label: 'در حال تولید', color: '#779BE7' },
  qc_failed: { label: 'مردود QC', color: '#FF499E' },
  in_stock: { label: 'موجود در انبار', color: '#C2DFE3' },
  reserved: { label: 'رزرو برای سفارش', color: '#F5B85A' },
  shipped: { label: 'ارسال‌شده', color: '#5EC8E5' },
  installed: { label: 'نصب‌شده نزد مشتری', color: '#0FD69D' },
  in_repair: { label: 'در تعمیر', color: '#B48CF2' },
  scrapped: { label: 'اسقاط', color: '#5C6B73' },
};

export const PO_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'پیش‌نویس', color: '#9DB4C0' },
  sent: { label: 'ارسال به تأمین‌کننده', color: '#C2DFE3' },
  confirmed: { label: 'تأیید تأمین‌کننده', color: '#779BE7' },
  in_transit: { label: 'در مسیر حمل', color: '#5EC8E5' },
  partial: { label: 'دریافت جزئی', color: '#F5B85A' },
  received: { label: 'دریافت کامل', color: '#0FD69D' },
  cancelled: { label: 'لغو شده', color: '#FF499E' },
};

export const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'جدید', color: '#FF499E' },
  open: { label: 'باز', color: '#F5B85A' },
  in_progress: { label: 'در حال انجام', color: '#779BE7' },
  waiting: { label: 'منتظر مشتری', color: '#9DB4C0' },
  resolved: { label: 'حل‌شده', color: '#0FD69D' },
  closed: { label: 'بسته', color: '#5C6B73' },
};

export const MOVE_KINDS: Record<string, string> = {
  receipt: 'ورود به انبار',
  issue: 'خروج از انبار',
  transfer: 'انتقال بین انبار',
  adjust: 'اصلاح موجودی',
  consume: 'مصرف در تولید',
  produce: 'تولید محصول',
  ship: 'ارسال به مشتری',
  return: 'مرجوعی',
};

export const INTERACTION_TYPES: Record<string, string> = {
  call: 'تماس تلفنی',
  meeting: 'جلسه / دمو',
  visit: 'بازدید حضوری',
  email: 'ایمیل',
  message: 'پیام',
  note: 'یادداشت',
};

export const CALL_OUTCOMES: Record<string, string> = {
  answered: 'پاسخ داد',
  no_answer: 'پاسخ نداد',
  busy: 'مشغول',
  callback: 'درخواست تماس مجدد',
  interested: 'ابراز علاقه',
  not_interested: 'عدم علاقه',
};

export const ITEM_KINDS: Record<string, string> = {
  product: 'محصول نهایی',
  component: 'قطعه / مواد اولیه',
  service: 'خدمت',
};

export const PAYMENT_METHODS: Record<string, string> = {
  transfer: 'انتقال بانکی',
  card: 'کارتخوان',
  cheque: 'چک',
  cash: 'نقد',
  credit: 'اعتباری',
};
