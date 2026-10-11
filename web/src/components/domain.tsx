import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldOff, ShieldAlert } from 'lucide-react';
import {
  PO_STATUS, PRIORITY_COLORS, PRIORITY_LABELS, TICKET_STATUS, UNIT_STATUS,
} from '@shared/defaults';
import { useSession } from '../lib/session';
import { useApi } from '../lib/hooks';
import { Pill } from './ui';
import { Picker, type PickOption } from './inputs';
import { daysLeft, num } from '../lib/format';

export function LifecyclePill({ stage }: { stage?: string | null }) {
  const { lifecycle } = useSession();
  const s = lifecycle(stage);
  return <Pill color={s?.color} dot>{s?.label ?? stage ?? '—'}</Pill>;
}

export function OrderStagePill({ stage, status }: { stage: string; status?: string }) {
  const { settings } = useSession();
  if (status === 'cancelled') return <Pill color="#FF499E">لغو شده</Pill>;
  const s = settings.orderStages.find((x) => x.key === stage);
  return <Pill color={s?.color} dot>{s?.label ?? stage}</Pill>;
}

export function WoStagePill({ stage, status }: { stage: string; status?: string }) {
  const { settings } = useSession();
  if (status === 'cancelled') return <Pill color="#FF499E">لغو شده</Pill>;
  const s = settings.workOrderStages.find((x) => x.key === stage);
  return <Pill color={s?.color} dot>{s?.label ?? stage}</Pill>;
}

export function UnitStatusPill({ status }: { status: string }) {
  const s = UNIT_STATUS[status];
  return <Pill color={s?.color} dot>{s?.label ?? status}</Pill>;
}

export function TicketStatusPill({ status }: { status: string }) {
  const s = TICKET_STATUS[status];
  return <Pill color={s?.color} dot>{s?.label ?? status}</Pill>;
}

export function PoStatusPill({ status }: { status: string }) {
  const s = PO_STATUS[status];
  return <Pill color={s?.color} dot>{s?.label ?? status}</Pill>;
}

export function PriorityPill({ priority }: { priority: string }) {
  const key = priority as keyof typeof PRIORITY_LABELS;
  if (key === 'normal' || key === 'low') return <span className="text-xs text-mist">{PRIORITY_LABELS[key]}</span>;
  return <Pill color={PRIORITY_COLORS[key]}>{PRIORITY_LABELS[key] ?? priority}</Pill>;
}

export function TicketTypePill({ type }: { type: string }) {
  const { settings } = useSession();
  const t = settings.ticketTypes.find((x) => x.key === type);
  return <Pill color={t?.color}>{t?.label ?? type}</Pill>;
}

export function WarrantyBadge({ until }: { until?: number | null }) {
  const left = daysLeft(until);
  if (left === null) return <span className="inline-flex items-center gap-1 text-xs text-mist"><ShieldOff size={13} />بدون گارانتی</span>;
  if (left < 0) return <span className="inline-flex items-center gap-1 text-xs text-rose"><ShieldOff size={13} />گارانتی تمام شده</span>;
  if (left <= 30) return <span className="inline-flex items-center gap-1 text-xs text-amber"><ShieldAlert size={13} />{num(left)} روز تا پایان گارانتی</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-mint"><ShieldCheck size={13} />گارانتی تا {num(Math.round(left / 30))} ماه دیگر</span>;
}

export function ContactLink({ id, name }: { id?: string | null; name?: string | null }) {
  if (!id) return <span className="text-mist">—</span>;
  return <Link to={`/crm/contacts/${id}`} className="text-ink hover:text-iris">{name ?? '—'}</Link>;
}

/* ───────────── Data-bound pickers ───────────── */

export function ContactPicker({ value, onChange, placeholder = 'انتخاب مشتری…' }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string }) {
  const { data = [] } = useApi<any[]>('/contacts');
  const { lifecycle } = useSession();
  const options: PickOption[] = data.map((c) => ({ value: c.id, label: c.name, hint: lifecycle(c.stage)?.label, color: lifecycle(c.stage)?.color }));
  return <Picker options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

export function ItemPicker({ value, onChange, kinds, placeholder = 'انتخاب کالا…' }: { value: string | null | undefined; onChange: (v: string | null) => void; kinds?: string[]; placeholder?: string }) {
  const { data = [] } = useApi<any[]>('/items');
  const options: PickOption[] = data
    .filter((i) => !kinds || kinds.includes(i.kind))
    .map((i) => ({ value: i.id, label: i.name, hint: `${i.sku}${i.kind !== 'service' ? ` · موجود ${num(i.available)}` : ''}` }));
  return <Picker options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

export function UserPicker({ value, onChange, placeholder = 'انتخاب کارشناس…' }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string }) {
  const { users } = useSession();
  return <Picker options={users.filter((u) => u.active !== 0).map((u) => ({ value: u.id, label: u.fullName }))} value={value} onChange={onChange} placeholder={placeholder} clearable />;
}

export function UnitPicker({ value, onChange, contactId, placeholder = 'انتخاب شماره سریال…' }: { value: string | null | undefined; onChange: (v: string | null) => void; contactId?: string | null; placeholder?: string }) {
  const { data = [] } = useApi<any[]>('/units');
  const options: PickOption[] = data
    .filter((u) => !contactId || u.contactId === contactId)
    .map((u) => ({ value: u.id, label: u.serial, hint: `${u.itemName}${u.contactName ? ` — ${u.contactName}` : ''}` }));
  return <Picker options={options} value={value} onChange={onChange} placeholder={placeholder} clearable />;
}

export function WarehousePicker({ value, onChange, placeholder = 'انتخاب انبار…' }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string }) {
  const { warehouses } = useSession();
  return <Picker options={warehouses.map((w) => ({ value: w.id, label: w.name, hint: w.code }))} value={value} onChange={onChange} placeholder={placeholder} />;
}
