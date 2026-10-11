import {
  createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ComponentType, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Inbox, Star } from 'lucide-react';
import clsx from 'clsx';
import { initials, num } from '../lib/format';

type Icon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/* ───────────────────────── Buttons ───────────────────────── */

const VARIANTS = {
  primary: 'bg-ink text-night hover:bg-white shadow-sm',
  action: 'bg-iris text-night hover:brightness-110 shadow-sm',
  ghost: 'text-mist hover:bg-ink/[0.07] hover:text-ink',
  outline: 'border border-line text-frost hover:border-mist hover:text-ink bg-deep/40',
  danger: 'bg-rose/15 text-rose hover:bg-rose/25 border border-rose/30',
  success: 'bg-mint/15 text-mint hover:bg-mint/25 border border-mint/30',
  glow: 'glow-btn text-ink',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: 'sm' | 'md' | 'lg';
  icon?: Icon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon: IconCmp, loading, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/60 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : size === 'lg' ? 'h-11 px-5 text-[15px]' : 'h-9 px-4 text-sm',
        !children && (size === 'sm' ? 'w-8 px-0' : 'w-9 px-0'),
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : IconCmp && <IconCmp size={size === 'sm' ? 14 : 17} />}
      {children}
    </button>
  );
});

/* ───────────────────────── Surfaces ───────────────────────── */

export function Card({
  title, subtitle, icon: IconCmp, actions, children, className, bodyClass, pad = true,
}: {
  title?: ReactNode; subtitle?: ReactNode; icon?: Icon; actions?: ReactNode; children?: ReactNode;
  className?: string; bodyClass?: string; pad?: boolean;
}) {
  return (
    <section className={clsx('glass animate-fade-up', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {IconCmp && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-iris/15 text-iris">
                <IconCmp size={17} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>}
              {subtitle && <p className="mt-0.5 truncate text-xs text-mist">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(pad && 'p-5', !pad && (title || actions) && 'pt-3', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title, subtitle, icon: IconCmp, actions, children,
}: { title: ReactNode; subtitle?: ReactNode; icon?: Icon; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {IconCmp && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-gradient-to-br from-iris/30 to-slate/20 text-ink">
            <IconCmp size={22} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-mist">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}

/* ───────────────────────── Badges ───────────────────────── */

export function Pill({ color = '#9DB4C0', children, className, dot }: { color?: string; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('chip', className)} style={{ background: `${color}1f`, color }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color }} />}
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function Avatar({ name, size = 32, color = '#779BE7' }: { name: string; size?: number; color?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-night"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${color}, #C2DFE3)` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function Stars({ value, onChange, size = 15 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(i === value ? 0 : i)}
          className={clsx('transition', onChange && 'hover:scale-110')}
          aria-label={`${i} ستاره`}
        >
          <Star size={size} className={i <= value ? 'fill-amber text-amber' : 'text-slate'} />
        </button>
      ))}
    </span>
  );
}

/* ───────────────────────── Feedback ───────────────────────── */

export function Spinner({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-mist">
      <Loader2 size={20} className="animate-spin text-iris" /> {label}
    </div>
  );
}

export function Empty({ icon: IconCmp = Inbox, title, hint, action }: { icon?: Icon; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/[0.05] text-mist">
        <IconCmp size={26} strokeWidth={1.5} />
      </span>
      <p className="font-semibold text-frost">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-6 text-mist">{hint}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, color = '#779BE7', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-1.5 overflow-hidden rounded-full bg-ink/[0.08]', className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

/* ───────────────────────── KPI tile ───────────────────────── */

export function Stat({
  label, value, hint, icon: IconCmp, tone = 'iris', onClick, alert,
}: { label: string; value: ReactNode; hint?: ReactNode; icon?: Icon; tone?: 'iris' | 'mint' | 'amber' | 'rose' | 'lilac' | 'sky'; onClick?: () => void; alert?: boolean }) {
  const tones = {
    iris: 'text-iris bg-iris/15', mint: 'text-mint bg-mint/15', amber: 'text-amber bg-amber/15',
    rose: 'text-rose bg-rose/15', lilac: 'text-lilac bg-lilac/15', sky: 'text-sky bg-sky/15',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'glass group relative flex min-w-0 flex-col gap-3 overflow-hidden p-4 text-right transition',
        onClick && 'hover:-translate-y-0.5 hover:border-iris/30 hover:shadow-glow',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-mist">{label}</span>
        {IconCmp && (
          <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>
            <IconCmp size={16} />
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="num text-2xl font-bold leading-none text-ink">{value}</span>
        {alert && <Dot color="#FF499E" pulse />}
      </div>
      {hint && <div className="truncate text-xs text-mist">{hint}</div>}
    </Tag>
  );
}

/* ───────────────────────── Tabs & segmented ───────────────────────── */

export function Tabs<T extends string>({
  tabs, value, onChange, className,
}: { tabs: { key: T; label: string; count?: number; icon?: Icon }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('flex gap-1 overflow-x-auto rounded-xl border border-line/70 bg-deep/50 p-1', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition',
            value === t.key ? 'nav-active font-semibold' : 'text-mist hover:bg-ink/[0.05] hover:text-ink',
          )}
        >
          {t.icon && <t.icon size={15} />}
          {t.label}
          {t.count !== undefined && (
            <span className={clsx('num rounded-full px-1.5 text-[11px]', value === t.key ? 'bg-night/20' : 'bg-ink/10')}>{num(t.count)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Form fields ───────────────────────── */

export function Field({ label, hint, error, children, className }: { label?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-rose">{error}</span> : hint && <span className="mt-1 block text-xs text-mist/80">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx('field', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx('field cursor-pointer', className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('field min-h-[84px] resize-y leading-6', className)} {...rest} />;
}

/** Numeric input that shows thousands separators and returns a number. */
export function MoneyInput({ value, onChange, className, ...rest }: { value: number | null | undefined; onChange: (v: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const shown = value === null || value === undefined ? '' : new Intl.NumberFormat('en-US').format(value);
  return (
    <input
      inputMode="numeric"
      className={clsx('field ltr text-left num', className)}
      value={shown}
      onChange={(e) => {
        const digits = e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '');
        onChange(digits ? Number(digits) : null);
      }}
      {...rest}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm text-frost" role="switch" aria-checked={checked}>
      <span className={clsx('relative h-5 w-9 rounded-full transition', checked ? 'bg-iris' : 'bg-slate/60')}>
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-ink shadow transition-all', checked ? 'right-[18px]' : 'right-0.5')} />
      </span>
      {label}
    </button>
  );
}

/* ───────────────────────── Modal ───────────────────────── */

export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md', icon: IconCmp,
}: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl'; icon?: Icon;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto bg-[#0c1214]/70 p-4 pt-[6vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx('glass-strong w-full animate-fade-up', widths[size])} role="dialog" aria-modal="true">
        <header className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
          <div className="flex items-center gap-3">
            {IconCmp && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris/15 text-iris"><IconCmp size={18} /></span>}
            <div>
              <h2 className="text-base font-bold text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-mist">{subtitle}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="بستن" />
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── Confirm dialog ───────────────────────── */

interface ConfirmOpts { title: string; body?: ReactNode; confirm?: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean } }
const ConfirmContext = createContext<(o: ConfirmOpts) => Promise<string | false>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: string | false) => void }) | null>(null);
  const [text, setText] = useState('');
  const ask = useCallback((o: ConfirmOpts) => new Promise<string | false>((resolve) => { setText(''); setState({ ...o, resolve }); }), []);
  const close = (v: string | false) => { state?.resolve(v); setState(null); };
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => close(false)}>انصراف</Button>
          <Button
            variant={state?.danger ? 'danger' : 'action'}
            disabled={!!state?.input?.required && !text.trim()}
            onClick={() => close(text.trim() || 'ok')}
          >{state?.confirm ?? 'تأیید'}</Button>
        </>}
      >
        {state?.body && <div className="text-sm leading-7 text-frost">{state.body}</div>}
        {state?.input && (
          <Field label={state.input.label} className="mt-4">
            <Input ref={inputRef} autoFocus value={text} placeholder={state.input.placeholder} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

/* ───────────────────────── Misc ───────────────────────── */

export function KV({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3 text-sm', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-mist">{k}</dt>
          <dd className="mt-0.5 truncate text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SearchBox({ value, onChange, placeholder = 'جستجو…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="field pr-9" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
