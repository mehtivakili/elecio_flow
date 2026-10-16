import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Trash2, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { post } from '../lib/api';
import { useAction } from '../lib/hooks';
import { num } from '../lib/format';
import { Button, Modal, useConfirm } from './ui';

type Row = { id: string; name: string; reason: string };
/** deleted = gone for good; archived = removed from lists but linked history kept; blocked = untouched. */
export interface BulkDeleteResult { deleted: number; archived: Row[]; blocked: Row[] }

/** Multi-select state for a list. Ids that leave the list (filtered out, deleted) drop out of the selection. */
export function useSelection(allIds: string[]) {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const key = allIds.join('|');
  useEffect(() => {
    setIds((prev) => {
      const keep = new Set([...prev].filter((id) => allIds.includes(id)));
      return keep.size === prev.size ? prev : keep;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const allSelected = allIds.length > 0 && allIds.every((id) => ids.has(id));
  return {
    active,
    ids,
    count: ids.size,
    total: allIds.length,
    allSelected,
    has: (id: string) => ids.has(id),
    toggle: (id: string) => setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }),
    toggleAll: () => setIds(allSelected ? new Set() : new Set(allIds)),
    start: (id?: string) => { setActive(true); setIds(id ? new Set([id]) : new Set()); },
    stop: () => { setActive(false); setIds(new Set()); },
  };
}
export type Selection = ReturnType<typeof useSelection>;

/** "انتخاب" / "لغو" switch for a list header. Icon-only on phones. */
export function SelectButton({ sel, onStart }: { sel: Selection; onStart?: () => void }) {
  return (
    <Button
      variant={sel.active ? 'action' : 'outline'}
      icon={sel.active ? X : CheckSquare}
      onClick={() => { if (sel.active) sel.stop(); else { onStart?.(); sel.start(); } }}
      aria-label={sel.active ? 'لغو انتخاب' : 'انتخاب چندتایی'}
      title={sel.active ? 'لغو انتخاب' : 'انتخاب چندتایی برای حذف'}
    >
      <span className="hidden md:inline">{sel.active ? 'لغو انتخاب' : 'انتخاب'}</span>
    </Button>
  );
}

/** Header checkbox for tables in selection mode. */
export function SelectAllCell({ sel }: { sel: Selection }) {
  if (!sel.active) return null;
  return <th className="w-10"><input type="checkbox" aria-label="انتخاب همه" checked={sel.allSelected} onChange={sel.toggleAll} /></th>;
}

/** Row checkbox for tables in selection mode. */
export function SelectCell({ sel, id }: { sel: Selection; id: string }) {
  if (!sel.active) return null;
  return (
    <td className="w-10" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" aria-label="انتخاب" checked={sel.has(id)} onChange={() => sel.toggle(id)} />
    </td>
  );
}

/**
 * Floating action bar while selecting: count, select-all and delete. Deletion asks
 * for confirmation, runs server-side in one transaction and then lists any records
 * the server refused to delete, with the reason for each.
 */
export function SelectionBar({ sel, path, noun, extra }: { sel: Selection; path: string; noun: string; extra?: React.ReactNode }) {
  const confirm = useConfirm();
  const [report, setReport] = useState<BulkDeleteResult | null>(null);
  const remove = useAction((ids: string[]) => post<BulkDeleteResult>(path, { ids }), {
    success: (r) => {
      const removed = r.deleted + (r.archived?.length ?? 0);
      return removed ? `${num(removed)} ${noun} حذف شد` : '';
    },
    onSuccess: (r) => { sel.stop(); if (r.blocked.length || r.archived?.length) setReport(r); },
  });

  const run = async () => {
    const ok = await confirm({
      title: `حذف ${num(sel.count)} ${noun}`,
      danger: true,
      confirm: 'حذف',
      body: 'موارد انتخاب‌شده از همه فهرست‌ها حذف می‌شوند. اگر موردی سابقه‌ای دارد (سفارش، دستگاه، گردش انبار…) آن سوابق دست‌نخورده می‌مانند و خود مورد به بایگانی می‌رود تا در صورت نیاز از تنظیمات قابل بازگرداندن باشد.',
    });
    if (ok) remove.mutate([...sel.ids]);
  };

  return (
    <>
      {sel.active && createPortal(
        <div className="selection-bar no-print" role="toolbar" aria-label="عملیات گروهی">
          <button type="button" onClick={sel.stop} className="icon-btn border-0 bg-ink/[0.07]" aria-label="لغو انتخاب"><X size={18} /></button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink"><span className="num">{num(sel.count)}</span> مورد انتخاب شده</div>
            <button type="button" onClick={sel.toggleAll} className="text-xs font-medium text-iris">
              {sel.allSelected ? 'برداشتن همه' : `انتخاب همه (${num(sel.total)})`}
            </button>
          </div>
          {extra}
          <Button variant="danger" icon={Trash2} disabled={!sel.count} loading={remove.isPending} onClick={run} className={clsx(!!sel.count && '!bg-rose !text-white')}>حذف</Button>
        </div>,
        document.body,
      )}
      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        icon={AlertTriangle}
        size="sm"
        title="نتیجه حذف"
        subtitle={report ? `${num(report.deleted + (report.archived?.length ?? 0))} مورد حذف شد${report.blocked.length ? ` · ${num(report.blocked.length)} مورد حذف نشد` : ''}` : undefined}
        footer={<Button variant="action" onClick={() => setReport(null)}>متوجه شدم</Button>}
      >
        {!!report?.archived?.length && (
          <section className="mb-4">
            <h3 className="mb-1 text-sm font-bold text-ink">حذف شد — سوابق مرتبط حفظ شد</h3>
            <p className="mb-2 text-xs leading-5 text-mist">این موارد از فهرست‌ها حذف شدند ولی چون به اسناد دیگر وصل بودند، آن اسناد سالم ماندند. از «تنظیمات › بایگانی» قابل بازگرداندن هستند.</p>
            <ul className="space-y-1.5">
              {report.archived.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.04] px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-ink">{b.name}</span>
                  <span className="shrink-0 text-[11px] text-mint">{b.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!report?.blocked.length && (
          <section>
            <h3 className="mb-2 text-sm font-bold text-ink">حذف نشد</h3>
            <ul className="space-y-1.5">
              {report.blocked.map((b) => (
                <li key={b.id} className="rounded-xl bg-ink/[0.04] px-3 py-2">
                  <div className="truncate text-sm text-ink">{b.name}</div>
                  <div className="mt-0.5 text-[11px] leading-5 text-amber">{b.reason}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Modal>
    </>
  );
}
