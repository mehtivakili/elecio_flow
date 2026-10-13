import { useState } from 'react';
import { LogIn, Users, ShoppingCart, Truck, Boxes, Factory, Cpu, LifeBuoy } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/session';
import { Button, Field, Input } from '../components/ui';

const MODULES = [
  [Users, 'CRM', 'سرنخ، پیگیری، قیف فروش'],
  [ShoppingCart, 'OMS', 'پیش‌فاکتور تا تحویل'],
  [Truck, 'SCM', 'تأمین‌کننده و خرید'],
  [Boxes, 'WMS', 'انبار و موجودی'],
  [Factory, 'MES', 'تولید و کنترل کیفیت'],
  [Cpu, 'Traceability', 'شناسنامه هر دستگاه'],
  [LifeBuoy, 'Service', 'نصب، گارانتی، تیکت'],
] as const;

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await api<{ token: string }>('/auth/login', { method: 'POST', body: { username, password } });
      login(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid-bg relative flex min-h-full items-center justify-center overflow-hidden p-6" dir="rtl">
      <div className="aurora -left-32 top-10 bg-iris" style={{ opacity: 0.22 }} />
      <div className="aurora -right-40 bottom-0 bg-rose" style={{ opacity: 0.12 }} />
      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden lg:block">
          <img src="/brand.svg" alt="" className="mb-6 h-16 w-16 animate-pulseScale" />
          <h1 className="text-4xl font-extrabold leading-tight" dir="ltr" style={{ textAlign: 'right' }}>
            ELECIO <span className="bg-gradient-to-l from-iris to-frost bg-clip-text text-transparent">FLOW</span>
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-8 text-frost">
            سیستم یکپارچه عملیات کسب‌وکار — از اولین تماس با سرنخ تا تولید، ارسال، نصب و پشتیبانی هر دستگاه، در یک جریان واحد.
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
            {MODULES.map(([Icon, title, desc]) => (
              <div key={title} className="glass flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris/15 text-iris"><Icon size={16} /></span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink" dir="ltr" style={{ textAlign: 'right' }}>{title}</div>
                  <div className="truncate text-[11px] text-mist">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="glass-strong mx-auto w-full max-w-sm p-7">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/brand.svg" alt="" className="h-10 w-10" />
            <span className="text-xl font-extrabold" dir="ltr">ELECIO <span className="text-iris">FLOW</span></span>
          </div>
          <h2 className="text-lg font-bold">ورود به فضای کار</h2>
          <p className="mt-1 text-sm text-mist">با حساب سازمانی خود وارد شوید.</p>
          <div className="mt-6 space-y-4">
            <Field label="نام کاربری">
              <Input className="ltr text-left" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="رمز عبور">
              <Input className="ltr text-left" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="rounded-xl bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>}
            <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={loading} className="w-full">ورود</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
