import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, GitBranch, Flame, PhoneCall, Map, ShoppingCart, Truck, Building2, Boxes, ArrowLeftRight,
  Factory, Cpu, LifeBuoy, Wallet, ListChecks, Settings, PanelRightClose, PanelRightOpen, LogOut, Search, Bell,
  Plus, ChevronLeft, AlertTriangle, AlertOctagon, Info, CornerDownLeft, UserPlus, FileText, Wrench, PackagePlus,
  Route, type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { ROLE_LABELS } from '@shared/defaults';
import { Avatar } from './ui';
import { isolateCodes, num } from '../lib/format';

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number }
interface NavGroup { label: string; items: NavItem[] }

const COLLAPSE_KEY = 'elecio_flow_sidebar';

function useAlerts() {
  return useQuery({ queryKey: ['alerts'], queryFn: () => api<any[]>('/alerts'), refetchInterval: 60_000 });
}

function Sidebar() {
  const { me, org, logout } = useSession();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  const { data: followups = [] } = useQuery({ queryKey: ['/followups'], queryFn: () => api<any[]>('/followups') });
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const dueFollowups = followups.filter((f) => f.dueAt <= endToday.getTime()).length;
  const { data: alerts = [] } = useAlerts();
  const count = (module: string) => alerts.filter((a) => a.module === module && a.severity !== 'info').length;

  const groups: NavGroup[] = [
    { label: '', items: [{ to: '/', label: 'مرکز فرمان', icon: LayoutDashboard, end: true }] },
    {
      label: 'مشتریان و فروش', items: [
        { to: '/crm/contacts', label: 'مخاطبین و مشتریان', icon: Users },
        { to: '/crm/pipeline', label: 'قیف فروش', icon: GitBranch },
        { to: '/crm/leads', label: 'سرنخ‌های داغ', icon: Flame },
        { to: '/crm/followups', label: 'پیگیری‌ها', icon: PhoneCall, badge: dueFollowups },
        { to: '/crm/map', label: 'نقشه عملیات', icon: Map },
      ],
    },
    {
      label: 'سفارش و تأمین', items: [
        { to: '/operations/product-flow', label: 'فرآیند تأمین محصول', icon: Route },
        { to: '/sales/orders', label: 'سفارش‌ها', icon: ShoppingCart, badge: count('sales') },
        { to: '/scm/purchase-orders', label: 'سفارش‌های خرید', icon: Truck, badge: count('scm') },
        { to: '/scm/suppliers', label: 'تأمین‌کنندگان', icon: Building2 },
      ],
    },
    {
      label: 'انبار و تولید', items: [
        { to: '/inventory/items', label: 'کالاها و قطعات', icon: Boxes, badge: count('inventory') },
        { to: '/inventory/stock', label: 'موجودی و تراکنش‌ها', icon: ArrowLeftRight },
        { to: '/production/work-orders', label: 'دستورهای تولید', icon: Factory, badge: count('production') },
        { to: '/units', label: 'شناسنامه دستگاه‌ها', icon: Cpu },
      ],
    },
    {
      label: 'خدمات و مدیریت', items: [
        { to: '/service/tickets', label: 'خدمات پس از فروش', icon: LifeBuoy, badge: count('service') },
        { to: '/finance', label: 'مالی و هزینه‌ها', icon: Wallet },
        { to: '/tasks', label: 'کارهای من', icon: ListChecks },
        { to: '/settings', label: 'تنظیمات', icon: Settings },
      ],
    },
  ];

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
        className="absolute -left-3 top-1/2 z-40 hidden h-6 w-6 items-center justify-center rounded-full bg-ink text-night shadow hover:shadow-custom-hover md:flex"
        aria-label={collapsed ? 'باز کردن منو' : 'جمع کردن منو'}
      >
        {collapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
      </button>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && !collapsed && <div className="mb-1.5 px-3 text-[11px] font-medium text-mist/70">{g.label}</div>}
            {g.label && collapsed && <div className="mx-3 mb-2 h-px bg-line/60" />}
            <ul className="space-y-1">
              {g.items.map((item) => (
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
                    {!!item.badge && (
                      <span className={clsx(
                        'num flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1.5 text-[10px] font-bold text-white',
                        collapsed && 'absolute -left-0.5 -top-0.5 h-4 min-w-4 text-[9px]',
                      )}>{item.badge > 99 ? '۹۹+' : num(item.badge)}</span>
                    )}
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

/* ───────────────────────── Alerts panel ───────────────────────── */

const SEVERITY = {
  critical: { icon: AlertOctagon, color: 'text-rose', bg: 'bg-rose/10' },
  warning: { icon: AlertTriangle, color: 'text-amber', bg: 'bg-amber/10' },
  info: { icon: Info, color: 'text-iris', bg: 'bg-iris/10' },
} as const;

export function AlertRow({ alert, onClick }: { alert: any; onClick?: () => void }) {
  const s = SEVERITY[alert.severity as keyof typeof SEVERITY];
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-right transition hover:bg-ink/[0.05]">
      <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', s.bg, s.color)}><s.icon size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-6 text-ink">{isolateCodes(alert.title)}</span>
        <span className="block truncate text-xs text-mist">{isolateCodes(alert.detail)}</span>
      </span>
      <ChevronLeft size={15} className="mt-1.5 shrink-0 text-mist" />
    </button>
  );
}

function AlertsMenu() {
  const [open, setOpen] = useState(false);
  const { data: alerts = [] } = useAlerts();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line/70 text-frost transition hover:border-mist hover:text-ink" aria-label="هشدارها">
        <Bell size={17} />
        {alerts.length > 0 && (
          <span className={clsx('num absolute -left-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white', critical ? 'bg-rose' : 'bg-amber text-night')}>
            {num(alerts.length)}
          </span>
        )}
      </button>
      {open && (
        <div className="glass-strong absolute left-0 top-11 z-50 w-[380px] animate-fade-up p-2">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold">مرکز هشدار</span>
            <span className="text-xs text-mist">{num(critical)} بحرانی · {num(alerts.length - critical)} سایر</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {alerts.length === 0 && <p className="py-8 text-center text-sm text-mist">همه‌چیز طبق برنامه است ✓</p>}
            {alerts.map((a) => <AlertRow key={a.id} alert={a} onClick={() => { setOpen(false); navigate(a.link); }} />)}
          </div>
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
    { type: 'action', id: 'a1', title: 'مخاطب / سرنخ جدید', subtitle: 'ثبت در CRM', link: '/crm/contacts?new=1', icon: UserPlus },
    { type: 'action', id: 'a2', title: 'پیش‌فاکتور / سفارش جدید', subtitle: 'فروش', link: '/sales/orders?new=1', icon: FileText },
    { type: 'action', id: 'a3', title: 'تیکت پشتیبانی جدید', subtitle: 'خدمات پس از فروش', link: '/service/tickets?new=1', icon: Wrench },
    { type: 'action', id: 'a4', title: 'سفارش خرید جدید', subtitle: 'زنجیره تأمین', link: '/scm/purchase-orders?new=1', icon: PackagePlus },
    { type: 'action', id: 'a5', title: 'دستور تولید جدید', subtitle: 'تولید', link: '/production/work-orders?new=1', icon: Factory },
  ], []);
  const list = debounced.trim().length >= 2 ? results : actions.filter((a) => !query || a.title.includes(query));
  useEffect(() => setActive(0), [debounced]);
  if (!open) return null;
  const go = (item: any) => { onClose(); navigate(item.link); };
  return (
    <div className="fixed inset-0 z-[950] flex items-start justify-center bg-[#0c1214]/70 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-strong w-full max-w-xl animate-fade-up overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line/70 px-4">
          <Search size={18} className="text-mist" />
          <input
            autoFocus
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-mist/60"
            placeholder="نام مشتری، شماره تلفن، سریال دستگاه، شماره سفارش…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && list[active]) go(list[active]);
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {debounced.trim().length >= 2 && results.length === 0 && <li className="py-8 text-center text-sm text-mist">نتیجه‌ای یافت نشد</li>}
          {list.map((r: any, i: number) => (
            <li key={`${r.type}-${r.id}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right', i === active ? 'bg-iris/20' : '')}
              >
                <span className="w-16 shrink-0 rounded-md bg-ink/[0.06] py-0.5 text-center text-[10px] text-mist">{TYPE_LABELS[r.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{r.title}</span>
                  <span className="block truncate text-xs text-mist">{r.subtitle}</span>
                </span>
                {i === active && <CornerDownLeft size={14} className="text-mist" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-line/70 px-4 py-2 text-[11px] text-mist">
          <span><span className="kbd">↑↓</span> انتخاب</span><span><span className="kbd">Enter</span> باز کردن</span>
          <span className="mr-auto">جستجوی یکپارچه در همه ماژول‌ها</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Shell ───────────────────────── */

function QuickCreate() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const items: [string, string, LucideIcon][] = [
    ['سرنخ / مخاطب', '/crm/contacts?new=1', UserPlus],
    ['پیش‌فاکتور', '/sales/orders?new=1', FileText],
    ['تیکت پشتیبانی', '/service/tickets?new=1', Wrench],
    ['سفارش خرید', '/scm/purchase-orders?new=1', PackagePlus],
    ['دستور تولید', '/production/work-orders?new=1', Factory],
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="glow-btn flex h-9 items-center gap-2 px-3.5 text-sm text-ink">
        <Plus size={16} /> <span className="hidden sm:inline">ثبت سریع</span>
      </button>
      {open && (
        <div className="glass-strong absolute left-0 top-11 z-50 w-56 animate-fade-up p-1.5">
          {items.map(([label, to, Icon]) => (
            <button key={to} onClick={() => { setOpen(false); navigate(to); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-frost hover:bg-ink/[0.06] hover:text-ink">
              <Icon size={16} className="text-iris" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children?: ReactNode }) {
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [location.pathname]);

  return (
    <div className="grid-bg flex h-full overflow-hidden" dir="rtl">
      <div className="aurora -left-40 -top-40 bg-iris" />
      <div className="aurora -bottom-56 left-1/3 bg-rose" style={{ opacity: 0.08 }} />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-16 shrink-0 items-center gap-3 border-b border-line/50 bg-night/40 px-5 backdrop-blur-md">
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
        </header>
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] px-5 py-6 lg:px-8">{children ?? <Outlet />}</div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
