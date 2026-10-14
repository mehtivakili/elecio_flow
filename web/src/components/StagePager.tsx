import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { num } from '../lib/format';

export interface PagerStage { key: string; label: string; color?: string; count: number }

const GLIDE_MS = 560;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Phone pager for stage boards: one stage per screen, swiped sideways with snap.
 * A sticky stage bar sits on top with a liquid-glass lens. The lens is moved by a
 * small spring simulation straight on the DOM (no React renders per frame), so it
 * trails the finger smoothly, stretches like a droplet while moving fast and
 * settles with a soft wobble. After a stage settles the list returns to its top,
 * and edge hints show when there is a neighbouring stage to move to.
 */
export function StagePager({ stages, renderPage }: { stages: PagerStage[]; renderPage: (key: string, index: number) => ReactNode }) {
  const pager = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const lensEl = useRef<HTMLSpanElement>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const rects = useRef<{ left: number; width: number }[]>([]);
  const spring = useRef({ x: 0, v: 0, target: 0, raf: 0 });
  const glide = useRef(0);
  const settled = useRef(0);
  const activeRef = useRef(0);
  const activeKey = useRef<string | undefined>(undefined);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState<number>();
  const [fill, setFill] = useState(0);
  const n = stages.length;
  const signature = stages.map((s) => `${s.key}:${s.label}:${s.count}`).join('|');

  // Pages only re-render when their data changes — not when the active stage flips mid-swipe.
  const pageNodes = useMemo(
    () => stages.map((s, i) => (
      <div key={s.key} ref={(el) => { pages.current[i] = el; }} className="w-full shrink-0 snap-center snap-always px-3.5 pb-1">
        {renderPage(s.key, i)}
      </div>
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderPage, signature],
  );

  const colorAt = (i: number) => stages[Math.max(0, Math.min(n - 1, i))]?.color ?? '#779BE7';

  /** Paint the lens for a fractional stage position plus the spring's current velocity. */
  const paint = (x: number, v: number) => {
    const el = lensEl.current;
    const r = rects.current;
    if (!el || !r.length) return;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(x)));
    const i1 = Math.min(n - 1, i0 + 1);
    const t = Math.max(0, Math.min(1, x - i0));
    const a = r[i0], b = r[i1] ?? a;
    if (!a?.width) return;
    const speed = Math.abs(v);
    const stretch = Math.min(speed * 520, 30);
    const width = a.width + (b.width - a.width) * t + stretch;
    const center = a.left + a.width / 2 + (b.left + b.width / 2 - (a.left + a.width / 2)) * t;
    el.style.left = `${center - width / 2}px`;
    el.style.width = `${width}px`;
    el.style.transform = `scaleY(${1 - Math.min(speed * 3.2, 0.2)})`;
    el.style.setProperty('--tint', colorAt(Math.round(x)));
    el.style.opacity = '1';
  };

  /** Spring follower: slightly under-damped so it eases in and settles with a soft wobble. */
  const step = () => {
    const s = spring.current;
    s.v = (s.v + (s.target - s.x) * 0.1) * 0.68;
    s.x += s.v;
    paint(s.x, s.v);
    if (Math.abs(s.target - s.x) < 0.0008 && Math.abs(s.v) < 0.0004) {
      s.x = s.target; s.v = 0; paint(s.x, 0); s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(step);
  };
  const kick = () => { if (!spring.current.raf) spring.current.raf = requestAnimationFrame(step); };

  // RTL scroll containers count scrollLeft negative from the start edge.
  const direction = () => (pager.current && getComputedStyle(pager.current).direction === 'rtl' ? -1 : 1);

  /** Tap-to-stage: an eased glide (a touch slower than native smooth scroll), snap paused meanwhile. */
  const goTo = (i: number) => {
    const el = pager.current;
    if (!el) return;
    cancelAnimationFrame(glide.current);
    const from = el.scrollLeft;
    const to = direction() * i * el.clientWidth;
    if (from === to) return;
    const start = performance.now();
    el.style.scrollSnapType = 'none';
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / GLIDE_MS);
      el.scrollLeft = from + (to - from) * easeInOutCubic(p);
      if (p < 1) glide.current = requestAnimationFrame(frame);
      else el.style.scrollSnapType = '';
    };
    glide.current = requestAnimationFrame(frame);
  };

  // Open on the first stage that actually has cards.
  useLayoutEffect(() => {
    const first = Math.max(0, stages.findIndex((s) => s.count > 0));
    const el = pager.current;
    if (el && first > 0) el.scrollLeft = direction() * first * el.clientWidth;
    settled.current = first;
    activeRef.current = first;
    setActive(first);
    Object.assign(spring.current, { x: first, target: first, v: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the set of stages changes (e.g. a search narrows it), stay on the same stage
  // if it is still listed, otherwise land on the first remaining one — no glide.
  const keys = stages.map((s) => s.key).join('|');
  const prevKeys = useRef(keys);
  useLayoutEffect(() => {
    if (prevKeys.current === keys) return;
    prevKeys.current = keys;
    const el = pager.current;
    const kept = stages.findIndex((s) => s.key === activeKey.current);
    const index = kept >= 0 ? kept : 0;
    cancelAnimationFrame(glide.current);
    if (el) { el.style.scrollSnapType = ''; el.scrollLeft = direction() * index * el.clientWidth; }
    activeRef.current = index;
    settled.current = index;
    setActive(index);
    Object.assign(spring.current, { x: index, target: index, v: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  useEffect(() => { activeKey.current = stages[active]?.key; });

  // Measure chips for the lens.
  useLayoutEffect(() => {
    const measure = () => {
      rects.current = chips.current.slice(0, n).map((c) => ({ left: c?.offsetLeft ?? 0, width: c?.offsetWidth ?? 0 }));
      paint(spring.current.x, 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, n]);

  // The pager is as tall as the stage in view (eased by CSS, not per frame).
  useLayoutEffect(() => {
    const page = pages.current[active];
    if (!page) return;
    const update = () => setHeight(page.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(page);
    return () => ro.disconnect();
  }, [active, signature]);

  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      const x = Math.abs(el.scrollLeft) / el.clientWidth;
      spring.current.target = x;
      kick();
      const index = Math.max(0, Math.min(n - 1, Math.round(x)));
      if (index !== activeRef.current) { activeRef.current = index; setActive(index); }
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const done = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
        if (done === settled.current) return;
        settled.current = done;
        // A new stage starts from the top of its list.
        const main = document.getElementById('app-main');
        const top = anchor.current?.offsetTop ?? 0;
        if (main && main.scrollTop > top) main.scrollTo({ top, behavior: 'smooth' });
      }, 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      cancelAnimationFrame(spring.current.raf);
      cancelAnimationFrame(glide.current);
      spring.current.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  // The swipe surface always reaches down to the bottom tab bar, so empty space
  // under a short list can be swiped too — not only the cards themselves.
  useLayoutEffect(() => {
    const main = document.getElementById('app-main');
    const el = pager.current;
    if (!main || !el) return;
    const measure = () => {
      const mainTop = main.getBoundingClientRect().top;
      const offset = el.getBoundingClientRect().top + main.scrollTop - mainTop;
      const tabbar = document.querySelector('nav[aria-label="بخش‌های اصلی"]');
      const bottom = tabbar ? tabbar.getBoundingClientRect().top - 6 : window.innerHeight;
      setFill(Math.max(0, Math.round(bottom - (mainTop + offset))));
    };
    // Not tied to main's own resizes: the header folding while scrolling would
    // otherwise resize the pager mid-scroll and make the page stutter.
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [signature]);

  useEffect(() => {
    chips.current[active]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <>
      <div ref={anchor} />
      <div className="sticky top-0 z-20 -mx-3.5 mb-2 bg-night/80 px-3.5 pb-2 pt-1.5 backdrop-blur-xl">
        <div className="no-scrollbar overflow-x-auto rounded-2xl border border-white/[0.07] bg-deep/70 p-1">
          <div ref={track} className="relative flex w-max min-w-full gap-0.5" role="tablist" aria-label="مراحل">
            <span ref={lensEl} aria-hidden className="liquid-glass pointer-events-none absolute inset-y-0 rounded-xl opacity-0" />
            {stages.map((s, i) => (
              <button
                key={s.key}
                ref={(el) => { chips.current[i] = el; }}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => goTo(i)}
                className={clsx('relative z-[1] flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] transition-colors duration-300', i === active ? 'font-bold text-ink' : 'text-mist')}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color ?? '#9DB4C0' }} />
                {s.label}
                <span className={clsx('num text-[11px]', i === active ? 'text-frost' : 'text-mist/70')}>{num(s.count)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={pager}
        className="no-scrollbar -mx-3.5 flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain transition-[height] duration-300 ease-out"
        style={{ height: height === undefined ? undefined : Math.max(height, fill), minHeight: fill }}
      >
        {pageNodes}
      </div>

      {active < n - 1 && (
        <button type="button" onClick={() => goTo(active + 1)} className="edge-hint left-1" aria-label={`مرحله بعد: ${stages[active + 1].label}`}>
          <ChevronLeft size={16} strokeWidth={2.6} />
        </button>
      )}
      {active > 0 && (
        <button type="button" onClick={() => goTo(active - 1)} className="edge-hint right-1" aria-label={`مرحله قبل: ${stages[active - 1].label}`}>
          <ChevronRight size={16} strokeWidth={2.6} />
        </button>
      )}
    </>
  );
}
