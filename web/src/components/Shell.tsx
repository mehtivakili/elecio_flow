import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, GitBranch, Flame, PhoneCall, Map, ShoppingCart, Truck, Building2, Boxes, ArrowLeftRight,
  Factory, Cpu, LifeBuoy, Wallet, ListChecks, Settings, PanelRightClose, PanelRightOpen, LogOut, Search, Bell, Warehouse,
  Plus, ChevronLeft, ChevronRight, AlertTriangle, AlertOctagon, Info, CornerDownLeft, UserPlus, FileText, Wrench, PackagePlus,
  Route, X, ChevronDown, StickyNote, type LucideIcon,
  Cog,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useIsMobile } from '../lib/media';
import { useTableLabels } from '../lib/tableLabels';
import { useScrollingDown } from '../lib/scroll';
import { ROLE_LABELS } from '@shared/defaults';
import { Avatar, Sheet } from './ui';
import { isolateCodes, num } from '../lib/format';
import { matchesSearch } from '@shared/search';

/* ───────────────────────── Navigation map ───────────────────────── */

/** `tab` is the very short label used in the phone's fixed sub-section bar (≤ ~11 chars). */
interface NavItem { to: string; label: string; short?: string; tab?: string; hint?: string; icon: LucideIcon; end?: boolean; badge?: string }
interface NavSection { id: string; label: string; tab: string; icon: LucideIcon; items: NavItem[]; create?: [string, string, LucideIcon][] }

/** One map drives the desktop sidebar, the phone tab bar, the sub-section chips and the section sheets. */
const SECTIONS: NavSection[] = [
  {
    id: 'home', label: 'مرکز فرمان', tab: 'خانه', icon: LayoutDashboard,
    items: [{ to: '/', label: 'مرکز فرمان', icon: LayoutDashboard, end: true, hint: 'نمای کلی کسب‌وکار' }],
  },
  {
    id: 'crm', label: 'مشتریان و فروش', tab: 'مشتریان', icon: Users,
    items: [
      { to: '/crm/contacts', label: 'مخاطبین و مشتریان', short: 'مخاطبین', icon: Users, hint: 'پرونده کامل هر مشتری' },
      { to: '/crm/pipeline', label: 'قیف فروش', icon: GitBranch, hint: 'مراحل تبدیل سرنخ' },
      { to: '/crm/leads', label: 'سرنخ‌های داغ', tab: 'سرنخ داغ', icon: Flame, hint: 'بیشترین احتمال خرید' },
      { to: '/crm/followups', label: 'پیگیری‌ها', tab: 'پیگیری', icon: PhoneCall, badge: 'followups', hint: 'صف تماس‌های امروز' },
      { to: '/crm/map', label: 'نقشه عملیات', short: 'نقشه', icon: Map, hint: 'پراکندگی مشتریان' },
      { to: '/crm/machines', label: 'کنترلرها و ماشین‌ها', short: 'کنترلرها', tab: 'کنترلر', icon: Cog, hint: 'آمار کنترلرهای مشتریان' },
    ],
    create: [['مشتری / مخاطب', '/crm/contacts?new=1', UserPlus]],
  },
  {
    id: 'supply', label: 'سفارش و تأمین', tab: 'سفارش‌ها', icon: ShoppingCart,
    items: [
      { to: '/sales/orders', label: 'سفارش فروش', icon: ShoppingCart, badge: 'sales', hint: 'پیش‌فاکتور تا تحویل' },
      { to: '/scm/purchase-orders', label: 'سفارش خرید', icon: Truck, badge: 'scm', hint: 'خرید قطعات و کالا' },
      { to: '/scm/suppliers', label: 'تأمین‌کنندگان', tab: 'تأمین‌کننده', icon: Building2, hint: 'کارنامه تحویل' },
      { to: '/operations/product-flow', label: 'فرآیند تأمین محصول', short: 'فرآیند محصول', tab: 'فرآیند', icon: Route, hint: 'چک‌لیست مراحل' },
    ],
    create: [['سفارش فروش', '/sales/orders?new=1', FileText], ['سفارش خرید', '/scm/purchase-orders?new=1', PackagePlus]],
  },
  {
    id: 'ops', label: 'انبار و تولید', tab: 'عملیات', icon: Factory,
    items: [
      { to: '/inventory/items', label: 'کالاها و قطعات', short: 'کالاها', icon: Boxes, badge: 'inventory', hint: 'تعریف کالا و BOM' },
      { to: '/inventory/stock', label: 'موجودی انبار', short: 'موجودی', icon: Warehouse, hint: 'سطح موجودی و شمارش' },
      { to: '/inventory/moves', label: 'تراکنش‌های انبار', short: 'تراکنش‌ها', tab: 'تراکنش', icon: ArrowLeftRight, hint: 'ورود و خروج کالا' },
      { to: '/production/work-orders', label: 'دستورهای تولید', short: 'تولید', icon: Factory, badge: 'production', hint: 'خط تولید و QC' },
      { to: '/units', label: 'شناسنامه دستگاه‌ها', short: 'دستگاه‌ها', icon: Cpu, hint: 'سریال، گارانتی، تعمیر' },
    ],
    create: [['دستور تولید', '/production/work-orders?new=1', Factory]],
  },
  {
    id: 'service', label: 'خدمات و مدیریت', tab: 'خدمات', icon: LifeBuoy,
    items: [
      { to: '/service/tickets', label: 'خدمات پس از فروش', short: 'تیکت‌ها', icon: LifeBuoy, badge: 'service', hint: 'نصب، گارانتی، تعمیر' },
      { to: '/finance', label: 'مالی و هزینه‌ها', short: 'مالی', icon: Wallet, hint: 'وصولی و مطالبات' },
      { to: '/tasks', label: 'کارهای من', short: 'کارها', icon: ListChecks, badge: 'tasks', hint: 'کارهای داخلی تیم' },
      { to: '/notes', label: 'یادداشت‌ها', tab: 'یادداشت', icon: StickyNote, hint: 'یادداشت‌های شخصی و تیمی' },
      { to: '/settings', label: 'تنظیمات', icon: Settings, hint: 'کاربران، پشتیبان و پیکربندی' },
    ],
    create: [['تیکت پشتیبانی', '/service/tickets?new=1', Wrench], ['یادداشت', '/notes?new=1', StickyNote]],
  },
];

const CREATE_ACTIONS = SECTIONS.flatMap((s) => s.create ?? []);

/** Which section/page the path belongs to, and whether it is a record inside that page. */
function locate(pathname: string) {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of SECTIONS) {
    for (const item of section.items) {
      const hit = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (hit && (!best || item.to.length > best.item.to.length)) best = { section, item };
    }
  }
  const found = best ?? { section: SECTIONS[0], item: SECTIONS[0].items[0] };
  return { ...found, detail: pathname !== found.item.to };
}

const LAST_KEY = 'elecio_flow_last_pages';
function readLast(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(LAST_KEY) ?? '{}'); } catch { return {}; }
}

function useAlerts() {
  return useQuery({ queryKey: ['alerts'], queryFn: () => api<any[]>('/alerts'), refetchInterval: 60_000 });
}

/** Badge counts keyed by NavItem.badge. */
function useNavBadges() {
  const { data: followups = [] } = useQuery({ queryKey: ['/followups'], queryFn: () => api<any[]>('/followups') });
  const { data: alerts = [] } = useAlerts();
  const { data: tasks = [] } = useQuery({ queryKey: ['/tasks'], queryFn: () => api<any[]>('/tasks') });
  const { me } = useSession();
  return useMemo(() => {
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const out: Record<string, number> = {
      followups: followups.filter((f) => f.dueAt <= endToday.getTime()).length,
      // Open tasks waiting on me: overdue, due today, urgent, or handed to me by a colleague.
      tasks: tasks.filter((t) => t.assigneeId === me.id && t.status !== 'done'
        && ((t.dueAt && t.dueAt <= endToday.getTime()) || ['urgent', 'high'].includes(t.priority) || (t.createdBy && t.createdBy !== me.id))).length,
    };
    for (const a of alerts) if (a.severity !== 'info') out[a.module] = (out[a.module] ?? 0) + 1;
    return out;
  }, [followups, alerts, tasks, me.id]);
}

function Badge({ value, className }: { value?: number; className?: string }) {
  if (!value) return null;
  return (
    <span className={clsx('num flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1.5 text-[10px] font-bold leading-none text-white', className)}>
      {value > 99 ? '۹۹+' : num(value)}
    </span>
  );
}

/* ───────────────────────── Desktop sidebar ───────────────────────── */

const COLLAPSE_KEY = 'elecio_flow_sidebar';

function Sidebar() {
  const { me, org, logout } = useSession();
  const badges = useNavBadges();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);

  return (
    <aside
      className={clsx(
        'no-print relative z-30 flex h-full shrink-0 flex-col border-l border-line/60 bg-deep/40 backdrop-blur-md transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      <div className={clsx('flex h-16 shrink-0 items-center gap-3 border-b border-line/50', collapsed ? 'justify-center px-2' : 'px-4')}>
        <img src="/brand.svg" alt="" className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-extrabold tracking-wide text-ink" dir="ltr">ELECIO <span className="text-iris">FLOW</span></div>
            <div className="truncate text-[11px] text-mist">{org.name} — سیستم عملیات کسب‌وکار</div>
          </div>
        )}
      </div>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -left-3 top-1/2 z-40 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-night shadow hover:shadow-custom-hover"
        aria-label={collapsed ? 'باز کردن منو' : 'جمع کردن منو'}
      >
        {collapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
      </button>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            {section.id !== 'home' && !collapsed && <div className="mb-1.5 px-3 text-[11px] font-medium text-mist/70">{section.label}</div>}
            {section.id !== 'home' && collapsed && <div className="mx-3 mb-2 h-px bg-line/60" />}
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => clsx(
                      'relative flex items-center rounded-xl text-sm transition-colors',
                      collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-3',
                      isActive ? 'nav-active font-semibold' : 'text-frost/85 hover:bg-ink/[0.06] hover:text-ink',
                    )}
                  >
                    <item.icon size={19} className="shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    <Badge value={item.badge ? badges[item.badge] : 0} className={clsx(collapsed && 'absolute -left-0.5 -top-0.5 h-4 min-w-4 text-[9px]')} />
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={clsx('flex shrink-0 items-center gap-3 border-t border-line/50 p-3', collapsed && 'flex-col')}>
        <Avatar name={me.fullName} size={34} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{me.fullName}</div>
            <div className="truncate text-[11px] text-mist">{ROLE_LABELS[me.role]}</div>
          </div>
        )}
        <button onClick={logout} title="خروج" className="rounded-lg p-2 text-mist transition hover:bg-rose/15 hover:text-rose" aria-label="خروج">
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}

/* ───────────────────────── Alerts ───────────────────────── */

const SEVERITY = {
  critical: { icon: AlertOctagon, color: 'text-rose', bg: 'bg-rose/10' },
  warning: { icon: AlertTriangle, color: 'text-amber', bg: 'bg-amber/10' },
  info: { icon: Info, color: 'text-iris', bg: 'bg-iris/10' },
} as const;

export function AlertRow({ alert, onClick }: { alert: any; onClick?: () => void }) {
  const s = SEVERITY[alert.severity as keyof typeof SEVERITY];
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-right transition hover:bg-ink/[0.05] active:bg-ink/[0.07] md:py-2.5">
      <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl md:h-7 md:w-7 md:rounded-lg', s.bg, s.color)}><s.icon size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-6 text-ink">{isolateCodes(alert.title)}</span>
        <span className="block text-xs leading-5 text-mist md:truncate">{isolateCodes(alert.detail)}</span>
      </span>
      <ChevronLeft size={15} className="mt-1.5 shrink-0 text-mist" />
    </button>
  );
}

function AlertsMenu() {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { data: alerts = [] } = useAlerts();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || mobile) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, mobile]);
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const list = (
    <>
      {alerts.length === 0 && <p className="py-10 text-center text-sm text-mist">همه‌چیز طبق برنامه است ✓</p>}
      {alerts.map((a) => <AlertRow key={a.id} alert={a} onClick={() => { setOpen(false); navigate(a.link); }} />)}
    </>
  );
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="icon-btn relative" aria-label="هشدارها">
        <Bell size={18} />
        {alerts.length > 0 && (
          <span className={clsx('num absolute -left-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold', critical ? 'bg-rose text-white' : 'bg-amber text-night')}>
            {num(alerts.length)}
          </span>
        )}
      </button>
      {mobile ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="مرکز هشدار" subtitle={`${num(critical)} بحرانی · ${num(alerts.length - critical)} سایر`} icon={Bell} bodyClass="!px-2">
          {list}
        </Sheet>
      ) : open && (
        <div className="glass-strong absolute left-0 top-11 z-[400] w-[380px] animate-fade-up p-2">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold">مرکز هشدار</span>
            <span className="text-xs text-mist">{num(critical)} بحرانی · {num(alerts.length - critical)} سایر</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">{list}</div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Command palette ───────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  contact: 'مخاطب', unit: 'سریال', order: 'سفارش', po: 'خرید', work_order: 'تولید', ticket: 'تیکت', item: 'کالا', supplier: 'تأمین‌کننده', action: 'دستور',
};

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 180); return () => clearTimeout(t); }, [query]);
  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);
  const { data: results = [] } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api<any[]>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length >= 2,
  });
  const actions = useMemo(() => [
    ...CREATE_ACTIONS.map(([title, link, icon], i) => ({ type: 'action', id: `a${i}`, title: `${title} جدید`, subtitle: 'ثبت سریع', link, icon })),
    ...SECTIONS.flatMap((s) => s.items.map((item) => ({ type: 'page', id: item.to, title: item.label, subtitle: s.label, link: item.to, icon: item.icon }))),
  ], []);
  const searching = debounced.trim().length >= 2;
  const list = searching ? results : actions.filter((a) => matchesSearch(`${a.title} ${a.subtitle}`, query));
  useEffect(() => setActive(0), [debounced]);
  if (!open) return null;
  const go = (item: any) => { onClose(); navigate(item.link); };
  return (
    <div
      className={clsx('fixed inset-0 z-[950] flex justify-center', mobile ? 'bg-night' : 'items-start bg-[#0c1214]/70 p-4 pt-[12vh] backdrop-blur-sm')}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={clsx('flex w-full flex-col overflow-hidden', mobile ? 'h-[100dvh] animate-fade-up' : 'glass-strong max-w-xl animate-fade-up rounded-2xl')}>
        <div className={clsx('flex shrink-0 items-center gap-2 border-b border-line/70', mobile ? 'px-2 pt-[env(safe-area-inset-top)]' : 'gap-3 px-4')}>
          {mobile ? (
            <button onClick={onClose} className="icon-btn border-0" aria-label="بازگشت"><ChevronRight size={22} /></button>
          ) : <Search size={18} className="text-mist" />}
          <input
            autoFocus
            enterKeyHint="search"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-mist/60"
            placeholder={mobile ? 'مشتری، تلفن، سریال، سفارش…' : 'نام مشتری، شماره تلفن، سریال دستگاه، شماره سفارش…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && list[active]) go(list[active]);
            }}
          />
          {mobile ? query && <button onClick={() => setQuery('')} className="icon-btn border-0" aria-label="پاک کردن"><X size={18} /></button> : <span className="kbd">Esc</span>}
        </div>
        {!searching && <div className="px-4 pb-1 pt-3 text-[11px] font-medium text-mist">{query ? 'صفحات و دستورها' : 'دسترسی سریع'}</div>}
        <ul className={clsx('overflow-y-auto p-2', mobile ? 'flex-1 pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'max-h-[50vh]')}>
          {searching && results.length === 0 && <li className="py-10 text-center text-sm text-mist">نتیجه‌ای یافت نشد</li>}
          {list.map((r: any, i: number) => {
            const Icon: LucideIcon | undefined = r.icon;
            return (
              <li key={`${r.type}-${r.id}`}>
                <button
                  onMouseEnter={() => !mobile && setActive(i)}
                  onClick={() => go(r)}
                  className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right md:py-2.5', i === active && !mobile ? 'bg-iris/20' : 'active:bg-ink/[0.06]')}
                >
                  {Icon
                    ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-iris"><Icon size={17} /></span>
                    : <span className="w-16 shrink-0 rounded-md bg-ink/[0.06] py-0.5 text-center text-[10px] text-mist">{TYPE_LABELS[r.type]}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-mist">{r.subtitle}</span>
                  </span>
                  {i === active && !mobile ? <CornerDownLeft size={14} className="text-mist" /> : mobile && <ChevronLeft size={16} className="text-mist" />}
                </button>
              </li>
            );
          })}
        </ul>
        {!mobile && (
          <div className="flex items-center gap-4 border-t border-line/70 px-4 py-2 text-[11px] text-mist">
            <span><span className="kbd">↑↓</span> انتخاب</span><span><span className="kbd">Enter</span> باز کردن</span>
            <span className="mr-auto">جستجوی یکپارچه در همه ماژول‌ها</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Quick create ───────────────────────── */

function CreateGrid({ actions, onPick }: { actions: [string, string, LucideIcon][]; onPick: (to: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {actions.map(([label, to, Icon]) => (
        <button key={to} onClick={() => onPick(to)} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-ink/[0.04] p-3 text-right text-sm font-medium text-ink transition active:scale-[.97]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iris/15 text-iris"><Icon size={19} /></span>
          <span className="min-w-0 leading-5">{label}</span>
        </button>
      ))}
    </div>
  );
}

function QuickCreate() {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || mobile) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, mobile]);
  const pick = (to: string) => { setOpen(false); navigate(to); };
  return (
    <div ref={ref} className="relative">
      {mobile
        ? <button onClick={() => setOpen(true)} className="icon-btn" aria-label="ثبت سریع"><Plus size={20} /></button>
        : <button onClick={() => setOpen((o) => !o)} className="glow-btn flex h-9 items-center gap-2 px-3.5 text-sm text-ink"><Plus size={16} /> ثبت سریع</button>}
      {mobile ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="ثبت سریع" subtitle="چه چیزی می‌خواهید ثبت کنید؟" icon={Plus}>
          <CreateGrid actions={CREATE_ACTIONS} onPick={pick} />
        </Sheet>
      ) : open && (
        <div className="glass-strong absolute left-0 top-11 z-[400] w-56 animate-fade-up p-1.5">
          {CREATE_ACTIONS.map(([label, to, Icon]) => (
            <button key={to} onClick={() => pick(to)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-frost hover:bg-ink/[0.06] hover:text-ink">
              <Icon size={16} className="text-iris" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Phone navigation ───────────────────────── */

/** Grid of a section's sub-pages plus its quick-create shortcuts. */
function SectionSheet({ section, onClose, badges }: { section: NavSection | null; onClose: () => void; badges: Record<string, number> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const go = (to: string) => { onClose(); navigate(to); };
  return (
    <Sheet open={!!section} onClose={onClose} title={section?.label} subtitle="زیربخش موردنظر را انتخاب کنید" icon={section?.icon} layer={590}>
      {section && <>
        <div className="grid grid-cols-2 gap-2.5">
          {section.items.map((item) => {
            const active = locate(location.pathname).item.to === item.to;
            return (
              <button
                key={item.to}
                onClick={() => go(item.to)}
                className={clsx(
                  'relative flex min-h-[112px] flex-col items-start justify-between gap-3 rounded-2xl border p-3.5 text-right transition active:scale-[.97]',
                  active ? 'border-iris/60 bg-iris/[0.16]' : 'border-white/[0.06] bg-ink/[0.04]',
                )}
              >
                <span className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', active ? 'bg-iris text-night' : 'bg-ink/[0.07] text-iris')}><item.icon size={20} /></span>
                <span className="block">
                  <span className="block text-[14px] font-bold leading-6 text-ink">{item.label}</span>
                  {item.hint && <span className="block text-[11.5px] leading-5 text-mist">{item.hint}</span>}
                </span>
                <Badge value={item.badge ? badges[item.badge] : 0} className="absolute left-3 top-3" />
              </button>
            );
          })}
        </div>
        {section.create && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-medium text-mist">ثبت سریع در این بخش</div>
            <CreateGrid actions={section.create} onPick={go} />
          </div>
        )}
      </>}
    </Sheet>
  );
}

/** Full app map + profile — opened from the avatar in the top bar. */
function MenuSheet({ open, onClose, badges }: { open: boolean; onClose: () => void; badges: Record<string, number> }) {
  const { me, org, logout } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const current = locate(location.pathname).item.to;
  const go = (to: string) => { onClose(); navigate(to); };
  return (
    <Sheet open={open} onClose={onClose} layer={590} tall>
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-gradient-to-l from-iris/20 to-transparent p-3.5">
        <Avatar name={me.fullName} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold text-ink">{me.fullName}</div>
          <div className="truncate text-xs text-mist">{ROLE_LABELS[me.role]} · {org.name}</div>
        </div>
        <button onClick={logout} className="flex h-10 items-center gap-1.5 rounded-xl bg-rose/15 px-3 text-xs font-semibold text-rose active:scale-95"><LogOut size={15} />خروج</button>
      </div>
      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold text-mist"><section.icon size={14} />{section.label}</div>
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink/[0.035]">
              {section.items.map((item, i) => (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  className={clsx('flex w-full items-center gap-3 px-3.5 py-3 text-right transition active:bg-ink/[0.06]', i > 0 && 'border-t border-line/50', current === item.to && 'bg-iris/[0.12]')}
                >
                  <item.icon size={19} className={current === item.to ? 'text-iris' : 'text-frost'} />
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm', current === item.to ? 'font-bold text-ink' : 'text-ink')}>{item.label}</span>
                    {item.hint && <span className="block truncate text-[11.5px] text-mist">{item.hint}</span>}
                  </span>
                  <Badge value={item.badge ? badges[item.badge] : 0} />
                  <ChevronLeft size={16} className="text-mist" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function MobileTopBar({ onSearch, onMenu, onSection, compact }: { onSearch: () => void; onMenu: () => void; onSection: (s: NavSection) => void; compact: boolean }) {
  const { me, org } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const badges = useNavBadges();
  const here = locate(location.pathname);
  const subs = here.section.items.length > 1 ? here.section.items : [];
  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(here.item.to);
  };
  const isHome = here.section.id === 'home';

  return (
    <div className="pt-[env(safe-area-inset-top)]">
      <div className="flex h-[58px] items-center gap-1.5 px-3">
        {here.detail ? (
          <button onClick={back} className="icon-btn" aria-label="بازگشت"><ChevronRight size={22} /></button>
        ) : (
          <button onClick={onMenu} className="relative shrink-0 rounded-full p-0.5 ring-2 ring-iris/40 active:scale-95" aria-label="منوی کامل">
            <Avatar name={me.fullName} size={36} />
          </button>
        )}
        <button onClick={here.detail ? back : isHome ? onMenu : () => onSection(here.section)} className="min-w-0 flex-1 px-1.5 text-right">
          <div className="truncate text-[11px] leading-4 text-mist">
            {isHome ? <span dir="ltr">ELECIO <span className="text-iris">FLOW</span> · {org.name}</span> : here.detail ? here.section.label : 'ELECIO FLOW'}
          </div>
          <div className="flex items-center gap-1 text-[16px] font-extrabold leading-6 text-ink">
            <span className="truncate">{here.detail ? (here.item.short ?? here.item.label) : here.section.label}</span>
            {!here.detail && !isHome && <ChevronDown size={16} className="shrink-0 text-mist" />}
          </div>
        </button>
        <button onClick={onSearch} className="icon-btn" aria-label="جستجو"><Search size={19} /></button>
        <QuickCreate />
        <AlertsMenu />
      </div>
      {subs.length > 0 && (
        <div className={clsx('grid transition-[grid-template-rows,opacity] duration-200', compact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}>
          <div className="overflow-hidden">
            {/* Fixed, equal-width sub-section bar: every sibling page is one tap away, nothing scrolls sideways */}
            <nav className="grid px-1" style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0, 1fr))` }} aria-label="زیربخش‌ها">
              {subs.map((item) => {
                const active = here.item.to === item.to;
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={clsx('relative flex h-[50px] min-w-0 flex-col items-center justify-center gap-[5px] px-0.5 transition active:scale-95', active ? 'text-ink' : 'text-mist')}
                  >
                    <span className="relative">
                      <item.icon size={18} strokeWidth={active ? 2.4 : 1.9} className={active ? 'text-iris' : undefined} />
                      {count > 0 && <span className="num absolute -left-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[9px] font-bold leading-none text-white">{count > 99 ? '۹۹+' : num(count)}</span>}
                    </span>
                    <span className={clsx('max-w-full truncate text-[11px] leading-none', active && 'font-bold')}>{item.tab ?? item.short ?? item.label}</span>
                    {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-iris" />}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTabBar({ onSection }: { onSection: (s: NavSection) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const badges = useNavBadges();
  const here = locate(location.pathname);
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = SECTIONS.findIndex((s) => s.id === here.section.id);
  // Liquid-glass lens that glides to the active tab and wobbles like a droplet on the way.
  const [lens, setLens] = useState({ left: 0, placed: false, smooth: false, drop: 0 });
  useLayoutEffect(() => {
    const place = (animate: boolean) => {
      const btn = buttons.current[activeIndex];
      if (!btn) return;
      const left = btn.offsetLeft + btn.offsetWidth / 2 - 31;
      setLens((l) => ({ ...l, left, placed: true, drop: animate && l.placed && l.left !== left ? l.drop + 1 : l.drop }));
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex]);
  // Enable the glide only after the first placement so the lens doesn't fly in on load.
  useEffect(() => {
    if (!lens.placed || lens.smooth) return;
    const frame = requestAnimationFrame(() => setLens((l) => ({ ...l, smooth: true })));
    return () => cancelAnimationFrame(frame);
  }, [lens.placed, lens.smooth]);

  const tap = (section: NavSection) => {
    if (section.items.length === 1) return navigate(section.items[0].to);
    if (here.section.id === section.id) {
      if (here.detail) navigate(here.item.to);
      else onSection(section);
      return;
    }
    navigate(readLast()[section.id] ?? section.items[0].to);
  };

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-[580] px-2.5 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden" aria-label="بخش‌های اصلی">
      <div className="tabbar relative mx-auto grid h-[66px] max-w-md grid-cols-5 px-1">
        <span
          aria-hidden
          className={clsx('liquid-glass pointer-events-none absolute top-[6px] h-[54px] w-[62px] rounded-[20px]', lens.smooth && 'liquid-tab', lens.drop > 0 && (lens.drop % 2 ? 'drop-a' : 'drop-b'))}
          style={{ left: lens.left, opacity: lens.placed ? 1 : 0 }}
        />
        {SECTIONS.map((section, index) => {
          const active = here.section.id === section.id;
          const count = section.items.reduce((sum, item) => sum + (item.badge ? badges[item.badge] ?? 0 : 0), 0);
          return (
            <button
              key={section.id}
              ref={(el) => { buttons.current[index] = el; }}
              onPointerDown={() => {
                const timer = window.setTimeout(() => {
                  if (press.current) press.current.long = true;
                  if (section.items.length > 1) { navigator.vibrate?.(12); onSection(section); }
                }, 450);
                press.current = { timer, long: false };
              }}
              onPointerUp={() => { if (press.current) clearTimeout(press.current.timer); }}
              onPointerLeave={() => { if (press.current) clearTimeout(press.current.timer); }}
              onClick={() => { if (press.current?.long) { press.current = null; return; } tap(section); }}
              onContextMenu={(e) => e.preventDefault()}
              className="relative z-[1] flex min-w-0 select-none flex-col items-center justify-center gap-1"
              aria-current={active ? 'page' : undefined}
            >
              <span className={clsx('relative flex h-8 w-[54px] items-center justify-center rounded-full transition-colors duration-300', active ? 'text-ink' : 'text-mist')}>
                <section.icon size={21} strokeWidth={active ? 2.4 : 1.9} className={clsx('transition-transform duration-300', active && 'scale-110')} />
                <Badge value={count} className="absolute -top-1.5 left-1 h-[18px] min-w-[18px] border-2 border-[#1f2b30] px-1" />
              </span>
              <span className={clsx('max-w-full truncate text-[11px] leading-none', active ? 'font-bold text-ink' : 'text-mist')}>{section.tab}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Desktop: back arrow + breadcrumb (section › list) whenever a single record is open. */
function DesktopBack() {
  const location = useLocation();
  const navigate = useNavigate();
  const here = locate(location.pathname);
  if (!here.detail) return null;
  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(here.item.to);
  };
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button onClick={back} className="icon-btn" aria-label="بازگشت" title="بازگشت"><ChevronRight size={18} /></button>
      <nav className="flex items-center gap-1.5 text-sm" aria-label="مسیر">
        <span className="text-mist">{here.section.label}</span>
        <ChevronLeft size={14} className="text-mist/60" />
        <NavLink to={here.item.to} className="font-semibold text-frost hover:text-iris">{here.item.label}</NavLink>
      </nav>
      <span className="mx-1 h-6 w-px bg-line" />
    </div>
  );
}

/* ───────────────────────── Shell ───────────────────────── */

export function Shell({ children }: { children?: ReactNode }) {
  const mobile = useIsMobile();
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sectionSheet, setSectionSheet] = useState<NavSection | null>(null);
  const location = useLocation();
  // Phones: fold the sub-section bar away while reading down, bring it back on the way up.
  const compact = useScrollingDown(mobile, location.pathname);
  const badges = useNavBadges();
  useTableLabels(mobile);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setSectionSheet(null);
    setMenu(false);
    const here = locate(location.pathname);
    try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), [here.section.id]: location.pathname + location.search })); } catch { /* ignore */ }
  }, [location.pathname, location.search]);

  return (
    <div className="grid-bg flex h-[100dvh] overflow-hidden" dir="rtl">
      <div className="aurora -left-40 -top-40 bg-iris" />
      <div className="aurora -bottom-56 left-1/3 bg-rose" style={{ opacity: 0.08 }} />
      <div className="hidden h-full md:block"><Sidebar /></div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="no-print relative z-[300] shrink-0 border-b border-line/50 bg-night/85 backdrop-blur-xl md:bg-night/40 md:backdrop-blur-md">
          {mobile ? (
            <MobileTopBar onSearch={() => setPalette(true)} onMenu={() => setMenu(true)} onSection={setSectionSheet} compact={compact} />
          ) : (
            <div className="flex h-16 items-center gap-3 px-5">
              <DesktopBack />
              <button
                onClick={() => setPalette(true)}
                className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl border border-line/70 bg-deep/50 px-3 text-sm text-mist transition hover:border-mist"
              >
                <Search size={16} />
                <span className="flex-1 truncate text-right">جستجو: مشتری، تلفن، سریال، سفارش، قطعه…</span>
                <span className="kbd ltr">Ctrl K</span>
              </button>
              <div className="mr-auto flex items-center gap-2">
                <QuickCreate />
                <AlertsMenu />
              </div>
            </div>
          )}
        </header>
        <main ref={mainRef} id="app-main" className="relative z-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1500px] px-3.5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-4 md:px-5 md:py-6 lg:px-8">{children ?? <Outlet />}</div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {mobile && <>
        <MobileTabBar onSection={setSectionSheet} />
        <SectionSheet section={sectionSheet} onClose={() => setSectionSheet(null)} badges={badges} />
        <MenuSheet open={menu} onClose={() => setMenu(false)} badges={badges} />
      </>}
    </div>
  );
}
