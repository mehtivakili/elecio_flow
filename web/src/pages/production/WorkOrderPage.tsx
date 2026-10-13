import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Factory, ArrowLeft, ShieldAlert, ClipboardCheck, Layers, Cpu, PackagePlus, CheckCircle2, XCircle, History, Ban, ShoppingCart, Code2, Wrench, PackageCheck } from 'lucide-react';
import clsx from 'clsx';
import { ApiError, post } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { Button, Card, Field, Input, KV, Modal, PageHeader, Pill, Spinner, Textarea, useConfirm } from '../../components/ui';
import { PriorityPill, UnitStatusPill, WoStagePill } from '../../components/domain';
import { StageTrack, Timeline } from '../../components/flow';
import { date, dateTime, num } from '../../lib/format';

const DEVICE_STEPS = [
  { key: 'firmware', label: 'نرم‌افزار', icon: Code2, color: '#B48CF2' },
  { key: 'assembly', label: 'مونتاژ', icon: Wrench, color: '#779BE7' },
  { key: 'testing', label: 'QC', icon: ClipboardCheck, color: '#5EC8E5' },
  { key: 'packaging', label: 'بسته‌بندی', icon: PackageCheck, color: '#C2DFE3' },
] as const;

export default function WorkOrderPage() {
  const { id } = useParams();
  const { settings, userName, warehouses } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any>(`/work-orders/${id}`);
  const [blocked, setBlocked] = useState<ApiError | null>(null);
  const [note, setNote] = useState('');
  const [qcUnit, setQcUnit] = useState<any>(null);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const advance = useAction((body: any) => post(`/work-orders/${id}/advance`, body), {
    success: 'دستور تولید به مرحله بعد رفت',
    onSuccess: () => { setBlocked(null); setNote(''); },
    onError: (e) => { if (e.status === 409 && e.details?.blockers) setBlocked(e); else toast(e.message, 'error'); },
  });
  const cancel = useAction(() => post(`/work-orders/${id}/cancel`), { success: 'دستور تولید لغو شد' });
  const setUnitSteps = useAction(
    (body: { unitIds: string[]; step: string; completed: boolean }) => post(`/work-orders/${id}/unit-steps`, body),
    { success: (r: any) => `مرحله برای ${num(r.updated)} دستگاه ثبت شد`, onSuccess: () => setSelectedUnits([]) },
  );

  if (isLoading || !data) return <Spinner />;
  const w = data.workOrder;
  const stages = settings.workOrderStages;
  const idx = stages.findIndex((s) => s.key === w.stage);
  const next = stages[idx + 1];
  const open = w.status === 'open';
  const short = data.needs.filter((n: any) => n.short > 0);
  const passed = data.units.filter((u: any) => u.qcResult === 'pass').length;
  const stepDone = (unit: any, step: string) => step === 'testing'
    ? unit.qcResult === 'pass'
    : data.unitSteps.some((s: any) => s.unitId === unit.id && s.step === step);
  const currentDeviceStep = DEVICE_STEPS.find((s) => s.key === w.stage);
  const activeUnits = data.units.filter((u: any) => u.status !== 'scrapped');
  const currentPending = currentDeviceStep ? activeUnits.filter((u: any) => !stepDone(u, currentDeviceStep.key)) : [];

  return (
    <div className="space-y-6">
      <PageHeader icon={Factory}
        title={<span className="flex items-center gap-3"><span className="ltr">{w.number}</span><WoStagePill stage={w.stage} status={w.status} /><PriorityPill priority={w.priority} /></span>}
        subtitle={<span>{num(w.qty)} × {w.itemName}{w.orderNumber && <> · برای سفارش <Link className="text-iris" to={`/sales/orders/${w.orderId}`}>{w.orderNumber}</Link></>}</span>}
        actions={<>
          {open && !w.startedAt && <Button variant="danger" icon={Ban} onClick={async () => (await confirm({ title: 'لغو دستور تولید', danger: true })) && cancel.mutate(undefined)} />}
          {open && next && <Button variant="glow" icon={ArrowLeft} loading={advance.isPending} onClick={() => advance.mutate({})}>انتقال به «{next.label}»</Button>}
        </>} />

      <Card><StageTrack stages={stages} current={w.stage} history={data.history} closed={w.status === 'done'} /></Card>

      {data.units.length > 0 && (
        <Card
          title="رهگیری اجباری هر دستگاه"
          subtitle={`${num(activeUnits.length)} شماره‌سریال — هر دستگاه باید چهار ایستگاه تولید را به‌ترتیب کامل کند`}
          icon={Cpu}
          pad={false}
          actions={currentDeviceStep && currentDeviceStep.key !== 'testing' && open && <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedUnits(currentPending.map((u: any) => u.id))}>انتخاب دستگاه‌های معطل</Button>
            <Button size="sm" variant="action" icon={CheckCircle2} loading={setUnitSteps.isPending} disabled={!selectedUnits.length}
              onClick={() => setUnitSteps.mutate({ unitIds: selectedUnits, step: currentDeviceStep.key, completed: true })}>
              تکمیل «{currentDeviceStep.label}» برای انتخاب‌شده‌ها
            </Button>
          </div>}
        >
          <div className="border-b border-line/50 px-5 pb-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DEVICE_STEPS.map((step) => {
                const done = activeUnits.filter((u: any) => stepDone(u, step.key)).length;
                const active = w.stage === step.key;
                return <div key={step.key} className={clsx('rounded-xl border px-3 py-2.5', active ? 'bg-ink/[0.06]' : 'border-line/50 bg-ink/[0.025]')} style={active ? { borderColor: `${step.color}80` } : undefined}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: step.color }}><step.icon size={14} />{step.label}</div>
                  <div className="mt-1 text-sm font-bold text-ink"><span className="num">{num(done)}</span><span className="text-xs font-normal text-mist"> از {num(activeUnits.length)} دستگاه</span></div>
                </div>;
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead><tr>
                <th className="w-10">{currentDeviceStep && currentDeviceStep.key !== 'testing' && <input type="checkbox" aria-label="انتخاب همه دستگاه‌های معطل" checked={currentPending.length > 0 && currentPending.every((u: any) => selectedUnits.includes(u.id))} onChange={(e) => setSelectedUnits(e.target.checked ? currentPending.map((u: any) => u.id) : [])} />}</th>
                <th>شماره سریال</th>
                {DEVICE_STEPS.map((s) => <th key={s.key} className="text-center">{s.label}</th>)}
                <th>پیشرفت</th>
              </tr></thead>
              <tbody>{data.units.map((unit: any) => {
                const completed = DEVICE_STEPS.filter((s) => stepDone(unit, s.key)).length;
                const selectable = !!currentDeviceStep && currentDeviceStep.key !== 'testing' && !stepDone(unit, currentDeviceStep.key) && unit.status !== 'scrapped';
                return <tr key={unit.id} className={unit.status === 'scrapped' ? 'opacity-40' : ''}>
                  <td><input type="checkbox" aria-label={`انتخاب ${unit.serial}`} disabled={!selectable} checked={selectedUnits.includes(unit.id)} onChange={(e) => setSelectedUnits((old) => e.target.checked ? [...old, unit.id] : old.filter((x) => x !== unit.id))} /></td>
                  <td><Link to={`/units/${unit.serial}`} className="ltr font-mono text-xs text-ink hover:text-iris">{unit.serial}</Link></td>
                  {DEVICE_STEPS.map((step) => {
                    const done = stepDone(unit, step.key);
                    return <td key={step.key} className="text-center">
                      <span className={clsx('inline-flex h-7 w-7 items-center justify-center rounded-full', done ? 'bg-mint/15 text-mint' : w.stage === step.key ? 'bg-amber/15 text-amber' : 'bg-ink/[0.04] text-slate')} title={done ? 'تکمیل شده' : w.stage === step.key ? 'در انتظار انجام' : 'انجام نشده'}>
                        {done ? <CheckCircle2 size={15} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                    </td>;
                  })}
                  <td><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${completed / DEVICE_STEPS.length * 100}%` }} /></div><span className="num text-[11px] text-mist">{num(completed)}/{num(DEVICE_STEPS.length)}</span></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {currentDeviceStep?.key === 'testing' && <p className="border-t border-line/50 px-5 py-3 text-xs text-mist">در مرحله QC، نتیجه هر دستگاه از جدول «دستگاه‌ها و کنترل کیفیت» ثبت می‌شود.</p>}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {!w.startedAt && (
            <Card title="نیازمندی قطعات (کیتینگ)" subtitle={`از ${warehouses.find((x) => x.id === w.sourceWh)?.name ?? 'انبار قطعات'} — هنگام خروج از کیتینگ مصرف می‌شود`} icon={Layers} pad={false} bodyClass="overflow-x-auto"
              actions={short.length > 0 && <Link to="/scm/purchase-orders?new=1"><Button size="sm" variant="outline" icon={PackagePlus}>سفارش خرید کسری</Button></Link>}>
              <table className="tbl">
                <thead><tr><th>قطعه</th><th>مورد نیاز</th><th>موجودی آزاد</th><th>وضعیت</th></tr></thead>
                <tbody>{data.needs.map((n: any) => (
                  <tr key={n.componentId}>
                    <td><Link to={`/inventory/items/${n.componentId}`} className="text-ink hover:text-iris">{n.name}</Link></td>
                    <td className="num">{num(n.need)} {n.unit}</td>
                    <td className="num">{num(n.available)}</td>
                    <td>{n.short > 0 ? <Pill color="#FF499E">کسری {num(n.short)}</Pill> : <Pill color="#0FD69D">کافی</Pill>}</td>
                  </tr>
                ))}</tbody>
              </table>
              {data.needs.length === 0 && <p className="px-5 pb-5 text-sm text-amber">برای این محصول BOM تعریف نشده است.</p>}
            </Card>
          )}

          <Card title="دستگاه‌ها و کنترل کیفیت" subtitle={w.startedAt ? `${num(passed)} از ${num(data.units.length)} دستگاه QC را گذرانده‌اند` : 'شماره‌سریال‌ها پس از کیتینگ صادر می‌شوند'} icon={Cpu} pad={false} bodyClass="overflow-x-auto">
            {data.units.length === 0 ? <p className="px-5 pb-5 text-sm text-mist">هنوز دستگاهی ساخته نشده است.</p> : (
              <table className="tbl">
                <thead><tr><th>سریال</th><th>وضعیت</th><th>فریمور</th><th>QC</th><th /></tr></thead>
                <tbody>{data.units.map((u: any) => (
                  <tr key={u.id}>
                    <td><Link to={`/units/${u.serial}`} className="ltr font-mono text-xs text-ink hover:text-iris">{u.serial}</Link></td>
                    <td><UnitStatusPill status={u.status} /></td>
                    <td className="ltr text-right text-xs">{u.fwVersion || '—'}</td>
                    <td>{u.qcResult === 'pass' ? <span className="flex items-center gap-1 text-xs text-mint"><CheckCircle2 size={14} />قبول</span>
                      : u.qcResult === 'fail' ? <span className="flex items-center gap-1 text-xs text-rose"><XCircle size={14} />مردود</span> : <span className="text-xs text-mist">انجام نشده</span>}</td>
                    <td>{open && w.stage === 'testing' && u.status === 'in_production' && <Button size="sm" variant={u.qcResult === 'pass' ? 'ghost' : 'action'} icon={ClipboardCheck} onClick={() => setQcUnit(u)}>{u.qcResult ? 'QC مجدد' : 'ثبت QC'}</Button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Card>

          {data.qc.length > 0 && (
            <Card title="سوابق QC" icon={ClipboardCheck}>
              <Timeline items={data.qc.map((q: any) => ({
                id: q.id, at: q.at, color: q.passed ? '#0FD69D' : '#FF499E',
                title: <span className="ltr">{q.serial} — {q.passed ? 'PASS' : 'FAIL'}</span>,
                body: !q.passed ? q.results.filter((r: any) => !r.ok).map((r: any) => r.check).join('، ') : q.note,
                meta: `${userName(q.inspectorId)} · ${dateTime(q.at)}`,
              }))} />
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="مشخصات">
            <KV cols={1} items={[
              ['محصول', <Link to={`/inventory/items/${w.itemId}`} className="hover:text-iris">{w.itemName}</Link>],
              ['تعداد', num(w.qty)],
              ['نسخه سخت‌افزار / فریمور', <span className="ltr">{w.hwRev} / {w.fwVersion}</span>],
              ['مسئول', userName(w.assigneeId)],
              ['موعد', <span className={w.dueAt && w.dueAt < Date.now() && open ? 'text-rose' : ''}>{date(w.dueAt)}</span>],
              ['شروع (کیتینگ)', date(w.startedAt)], ['تکمیل', date(w.completedAt)],
              ['انبار مقصد', warehouses.find((x) => x.id === w.targetWh)?.name ?? '—'],
            ]} />
            {w.orderId && <Link to={`/sales/orders/${w.orderId}`} className="mt-4 flex items-center gap-2 rounded-xl bg-lilac/10 p-3 text-sm text-lilac"><ShoppingCart size={15} />پس از تکمیل، دستگاه‌ها خودکار برای سفارش {w.orderNumber} رزرو می‌شوند</Link>}
            {w.notes && <p className="mt-4 text-sm leading-6 text-frost">{w.notes}</p>}
          </Card>
          <Card title="مصرف و تولید" icon={History}>
            <Timeline items={data.moves.map((m: any) => ({ id: m.id, at: m.at, color: m.kind === 'consume' ? '#BE7C38' : '#0FD69D', title: `${m.kind === 'consume' ? 'مصرف' : 'تولید'} ${num(m.qty)} ${m.unit} ${m.itemName}` }))} empty="هنوز موجودی جابه‌جا نشده" />
          </Card>
        </div>
      </div>

      <Modal open={!!blocked} onClose={() => setBlocked(null)} title="کنترل مرحله" icon={ShieldAlert} size="sm"
        footer={<><Button variant="ghost" onClick={() => setBlocked(null)}>بستن</Button>
          {blocked?.details?.canForce && <Button variant="danger" disabled={!note.trim()} onClick={() => advance.mutate({ force: true, note })}>عبور با مسئولیت مدیر</Button>}</>}>
        {blocked?.details?.blockers?.map((b: any, i: number) => <p key={i} className="rounded-xl bg-rose/10 px-3 py-2 text-sm"><b className="text-rose">{b.stage}:</b> {b.reason}</p>)}
        {blocked?.details?.canForce
          ? <Field label="دلیل" className="mt-4"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          : <p className="mt-3 text-xs text-mist">کیتینگ موجودی واقعی مصرف می‌کند و تا تأمین کسری قابل عبور نیست.</p>}
      </Modal>
      <QcModal unit={qcUnit} woId={w.id} onClose={() => setQcUnit(null)} />
    </div>
  );
}

function QcModal({ unit, woId, onClose }: { unit: any; woId: string; onClose: () => void }) {
  const { settings } = useSession();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  useEffect(() => { if (unit) { setChecks(Object.fromEntries(settings.qcChecklist.map((c) => [c, true]))); setNote(''); } }, [unit, settings.qcChecklist]);
  const allOk = Object.values(checks).every(Boolean);
  const save = useAction(() => post(`/work-orders/${woId}/qc`, { unitId: unit.id, results: settings.qcChecklist.map((check) => ({ check, ok: !!checks[check] })), note }), {
    success: allOk ? 'QC تأیید شد' : 'QC مردود ثبت شد', onSuccess: onClose,
  });
  return (
    <Modal open={!!unit} onClose={onClose} icon={ClipboardCheck} title="چک‌لیست کنترل کیفیت" subtitle={<span className="ltr">{unit?.serial}</span>} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant={allOk ? 'success' : 'danger'} loading={save.isPending} onClick={() => save.mutate(undefined)}>{allOk ? 'ثبت قبولی' : 'ثبت مردودی'}</Button></>}>
      <ul className="space-y-2">
        {settings.qcChecklist.map((c) => (
          <li key={c}>
            <button onClick={() => setChecks({ ...checks, [c]: !checks[c] })} className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right text-sm transition', checks[c] ? 'border-mint/40 bg-mint/10' : 'border-rose/40 bg-rose/10')}>
              {checks[c] ? <CheckCircle2 size={18} className="text-mint" /> : <XCircle size={18} className="text-rose" />}{c}
            </button>
          </li>
        ))}
      </ul>
      <Field label="یادداشت" className="mt-4"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
