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

export interface ProductFlowSubsection {
  id: string;
  title: string;
  items: string[];
}

export interface ProductFlowSection {
  id: string;
  title: string;
  owner: string;
  description: string;
  output: string;
  color: string;
  icon: 'order' | 'supply' | 'production' | 'warehouse' | 'delivery' | 'support';
  to: string;
  action: string;
  subsections: ProductFlowSubsection[];
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
  productFlow: ProductFlowSection[];
  qcChecklist: string[];
  ticketTypes: OptionDef[];
  ticketSlaHours: Record<'urgent' | 'high' | 'normal' | 'low', number>;
  expenseCategories: string[];
  invoice: InvoiceSettings;
}

/**
 * The printable proforma / sales invoice. Text fields may contain placeholders that are
 * filled per document: {شماره} {تاریخ} {مشتری} {مبلغ_کل} {مانده} {اعتبار_روز}
 */
export interface InvoiceSettings {
  sellerName: string;
  economicCode: string;
  nationalId: string;
  registrationNo: string;
  postalCode: string;
  address: string;
  phone: string;
  website: string;
  invoicePrefix: string;
  proformaValidityDays: number;
  proformaTitle: string;
  invoiceTitle: string;
  proformaTerms: string;
  invoiceTerms: string;
  bankInfo: string;
  footer: string;
  showSignatures: boolean;
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
    { key: 'firmware', label: 'آماده‌سازی نرم‌افزار', color: '#B48CF2', slaDays: 1 },
    { key: 'assembly', label: 'مونتاژ', color: '#779BE7', slaDays: 3 },
    { key: 'testing', label: 'تست و کنترل کیفیت', color: '#5EC8E5', slaDays: 2, gate: 'qc_pass' },
    { key: 'packaging', label: 'بسته‌بندی', color: '#C2DFE3', slaDays: 1 },
    { key: 'done', label: 'تکمیل و ورود به انبار', color: '#0FD69D', final: true },
  ],
  productFlow: [
    {
      id: 'order', title: 'سفارش', owner: 'فروش و مهندسی', icon: 'order', color: '#F5B85A', to: '/sales/orders', action: 'مدیریت سفارش‌ها',
      description: 'نیاز مشتری و مدارک فنی قبل از تعهد زمان و قیمت نهایی کنترل می‌شود.', output: 'سفارش تأییدشده و قابل برنامه‌ریزی',
      subsections: [
        { id: 'order-review', title: 'بررسی سفارش', items: ['BOM', 'Gerber', 'Pick & Place', 'بررسی قیمت مناسب', 'بررسی موجودی قطعات'] },
      ],
    },
    {
      id: 'supply', title: 'تأمین و کیتینگ قطعات', owner: 'تأمین و انبار', icon: 'supply', color: '#5EC8E5', to: '/scm/purchase-orders', action: 'سفارش‌های خرید',
      description: 'کسری‌ها خریداری و همه اجزای موردنیاز به‌صورت کیت کامل آماده می‌شوند.', output: 'کیت کامل و رزروشده برای تولید',
      subsections: [
        { id: 'electronics', title: 'قطعات الکترونیکی', items: ['کارت حافظه (SD Card)', 'آداپتور ۱۲ ولت DC', 'کابل DB25', 'نمایشگر OLED', 'سیم SH و فلت', 'پروگرامر و پورت XH'] },
        { id: 'mechanical', title: 'قطعات مکانیکی', items: ['باکس و جعبه لیزر', 'طلق OLED', 'Spacer', 'چسب قطره‌ای', 'آهن‌ربا'] },
      ],
    },
    {
      id: 'production', title: 'تولید', owner: 'خط تولید و کنترل کیفیت', icon: 'production', color: '#779BE7', to: '/production/work-orders', action: 'دستورهای تولید',
      description: 'هر شماره‌سریال مراحل اجباری تولید را جداگانه و به‌ترتیب طی می‌کند.', output: 'دستگاه کامل، تست‌شده و آماده ورود به انبار',
      subsections: [
        { id: 'software', title: 'آماده‌سازی نرم‌افزار', items: ['پروگرام ESP', 'Firmware', 'Flash', 'Mount پوشه Data', 'فعال‌سازی License', 'راه‌اندازی سیستم گزارش‌گیری'] },
        { id: 'assembly', title: 'مونتاژ', items: ['نصب Spacer', 'لحیم‌کاری OLED', 'Power wire', 'Power button', 'بستن پیچ داخل دستگاه', 'نصب OLED و SH', 'نصب Flat', 'چسب‌کاری', 'نصب طلق OLED', 'نصب آهن‌ربا'] },
        { id: 'quality', title: 'تست و کنترل کیفیت', items: ['اجرای چک‌لیست QC', 'ثبت نتیجه برای هر سریال', 'رفع ایراد و QC مجدد'] },
        { id: 'packing', title: 'بسته‌بندی', items: ['نایلون دستگاه', 'آداپتور', 'کابل', 'محافظ حباب‌دار', 'کاتالوگ', 'پرینت جعبه', 'لوگو', 'کارت گارانتی'] },
      ],
    },
    {
      id: 'warehouse', title: 'انبارداری و ارسال', owner: 'انبار محصول و لجستیک', icon: 'warehouse', color: '#F5B85A', to: '/units?status=in_stock', action: 'دستگاه‌های آماده',
      description: 'ورود محصول، تخصیص به سفارش و خروج محموله با اسناد حمل ثبت می‌شود.', output: 'محموله قابل رهگیری',
      subsections: [
        { id: 'warehouse-in', title: 'انبار محصول', items: ['انبارداری محصول', 'تخصیص سریال به سفارش'] },
        { id: 'shipping', title: 'خروج و ارسال', items: ['لیبل و کد تحویل', 'ترخیص و مجوز خروج', 'ثبت حمل‌کننده و رهگیری', 'تحویل محموله'] },
      ],
    },
    {
      id: 'delivery', title: 'تحویل یا نصب', owner: 'لجستیک و نصب', icon: 'delivery', color: '#0FD69D', to: '/service/tickets?type=installation', action: 'برنامه نصب',
      description: 'محصول مستقیم تحویل یا توسط تیم فنی در محل مشتری نصب می‌شود.', output: 'دستگاه فعال نزد مشتری',
      subsections: [
        { id: 'delivery-install', title: 'تحویل مشتری', items: ['هماهنگی زمان تحویل', 'ارسال برای مشتری', 'نصب و راه‌اندازی', 'ثبت محل و تاریخ نصب', 'تأیید تحویل مشتری'] },
      ],
    },
    {
      id: 'support', title: 'پشتیبانی پس از فروش', owner: 'خدمات مشتریان', icon: 'support', color: '#FF499E', to: '/service/tickets', action: 'تیکت‌های خدمات',
      description: 'درخواست‌ها با اتصال به مشتری، سریال، گارانتی و سابقه ساخت پیگیری می‌شوند.', output: 'خدمت قابل سنجش و مشتری پشتیبانی‌شده',
      subsections: [
        { id: 'after-sales', title: 'خدمات پس از فروش', items: ['پشتیبانی فنی', 'گارانتی و تعمیر', 'پیگیری SLA', 'تاریخچه سرویس دستگاه', 'ثبت رضایت مشتری'] },
      ],
    },
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
  invoice: {
    sellerName: 'الکیو',
    economicCode: '',
    nationalId: '',
    registrationNo: '',
    postalCode: '',
    address: '',
    phone: '',
    website: '',
    invoicePrefix: 'INV',
    proformaValidityDays: 7,
    proformaTitle: 'پیش‌فاکتور',
    invoiceTitle: 'صورتحساب فروش کالا و خدمات',
    proformaTerms: 'این پیش‌فاکتور تا {اعتبار_روز} روز از تاریخ صدور معتبر است.\nزمان تحویل پس از دریافت پیش‌پرداخت تعیین می‌شود.',
    invoiceTerms: 'کالای فروخته‌شده مطابق شرایط گارانتی الکیو پشتیبانی می‌شود.',
    bankInfo: '',
    footer: 'با سپاس از اعتماد شما',
    showSignatures: true,
  },
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

/** A user may hold several roles; they can change a module if any of them allows it. */
export function canWrite(roles: Role | Role[], module: Module): boolean {
  return (Array.isArray(roles) ? roles : [roles]).some((role) => ROLE_MODULES[role]?.includes(module));
}

export function isAdminRole(roles: Role | Role[]): boolean {
  return (Array.isArray(roles) ? roles : [roles]).some((role) => role === 'owner' || role === 'admin');
}

/** Primary role first, then any extra roles, de-duplicated and validated. */
export function effectiveRoles(primary: string, extra: unknown): Role[] {
  const list = [primary, ...(Array.isArray(extra) ? extra : [])].filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  return [...new Set(list)];
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
  registered: { label: 'ثبت دستی (بدون مشتری)', color: '#9DB4C0' },
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
  legacy_sale: 'ثبت فروش قبلی (بدون اثر بر موجودی)',
  manual_unit: 'ثبت دستی دستگاه (بدون اثر بر موجودی)',
  unit_removed: 'حذف دستگاه (اصلاح ثبت اشتباه)',
  unit_returned: 'برگشت دستگاه به انبار (اصلاح)',
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

/** Scanned / uploaded documents kept with a customer, order, supplier or purchase order. */
export const ATTACHMENT_KINDS: Record<string, { label: string; side: 'sales' | 'purchase' | 'any' }> = {
  sales_invoice: { label: 'فاکتور فروش', side: 'sales' },
  proforma: { label: 'پیش‌فاکتور', side: 'sales' },
  contract: { label: 'قرارداد', side: 'any' },
  purchase_invoice: { label: 'فاکتور خرید', side: 'purchase' },
  receipt: { label: 'رسید / حواله', side: 'any' },
  payment: { label: 'رسید پرداخت', side: 'any' },
  other: { label: 'سایر اسناد', side: 'any' },
};

export const PAYMENT_METHODS: Record<string, string> = {
  transfer: 'انتقال بانکی',
  card: 'کارتخوان',
  cheque: 'چک',
  cash: 'نقد',
  credit: 'اعتباری',
};
