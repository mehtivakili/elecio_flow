import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: Tone; text: string }

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1000] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-5 md:left-5 md:top-auto md:items-stretch" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertTriangle : Info;
          return (
            <div key={t.id} className="glass-strong pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 px-4 py-3 text-sm">
              <Icon size={18} className={clsx('mt-0.5 shrink-0', t.tone === 'success' ? 'text-mint' : t.tone === 'error' ? 'text-rose' : 'text-iris')} />
              <span className="flex-1 leading-6">{t.text}</span>
              <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-mist hover:text-ink" aria-label="بستن">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
