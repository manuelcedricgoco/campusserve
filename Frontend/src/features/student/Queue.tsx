import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/query';
import { QueueTicket, type TicketData } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, Section, Facts, Notice } from '@/components/ui/page';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { Tabs } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { date, dateTime, humanize, time } from '@/lib/format';

interface Service { id: string; name: string; office_name: string; service_kind: string; allow_reschedule: boolean; cancellation_cutoff_minutes: number; description: string | null }
interface Slot { id: string; slot_date: string; start_time: string; end_time: string; capacity: number; available: number; status: string }
type Ticket = TicketData & { id: string; service_id: string; cancel_reason?: string | null; events?: { id: string; event_type: string; to_status: string | null; created_at: string; notes: string | null }[] };

function SlotPicker({ serviceId, onPick, excludeSlot }: { serviceId: string; onPick: (s: Slot) => void; excludeSlot?: string }) {
  const slots = useQuery({ queryKey: ['slots', serviceId], queryFn: () => api.get<Slot[]>(`/queue/services/${serviceId}/slots`) });
  const byDate = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) if (s.id !== excludeSlot) m.set(s.slot_date, [...(m.get(s.slot_date) ?? []), s]);
    return [...m.entries()];
  }, [slots.data, excludeSlot]);
  const [day, setDay] = useState<string | null>(null);
  const current = day ?? byDate[0]?.[0] ?? null;
  if (slots.isLoading) return <LoadingBlock rows={2} />;
  if (byDate.length === 0) return <EmptyState title="No open times in the next two weeks" body="The office has not opened slots for this service yet. Check again later or visit the office." />;
  return (
    <div>
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Day">
        {byDate.map(([d, list]) => {
          const free = list.reduce((a, s) => a + (s.status === 'open' ? s.available : 0), 0);
          return (
            <button key={d} role="tab" aria-selected={d === current} onClick={() => setDay(d)}
              className={cn('shrink-0 rounded-xl px-4 py-2 text-left ring-1', d === current ? 'bg-lagoon text-white ring-lagoon' : 'bg-white ring-mist hover:ring-lagoon')}>
              <span className="block font-semibold">{date(d)}</span><span className={cn('text-sm', d === current ? 'text-white/80' : 'text-ink-faint')}>{free} open</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {byDate.find(([d]) => d === current)?.[1].map((s) => {
          const disabled = s.status !== 'open' || s.available <= 0;
          return (
            <button key={s.id} disabled={disabled} onClick={() => onPick(s)}
              className="rounded-xl bg-white p-3 text-left ring-1 ring-mist hover:ring-2 hover:ring-lagoon disabled:cursor-not-allowed disabled:opacity-50">
              <span className="numeral block font-bold">{time(s.start_time)}</span>
              <span className="text-sm text-ink-soft">{disabled ? (s.status !== 'open' ? humanize(s.status) : 'Full') : `${s.available} of ${s.capacity} left`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BookSlot() {
  const navigate = useNavigate();
  const services = useQuery({ queryKey: ['services', 'queue'], queryFn: () => api.get<Service[]>('/catalog/services', { kind: 'queue' }) });
  const [serviceId, setServiceId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const svc = services.data?.find((s) => s.id === serviceId);
  const reserve = useAction((slotId: string) => api.post<Ticket>('/queue/tickets', { slotId }), {
    invalidate: ['tickets', 'slots'], success: (t) => `Reserved. Your number is ${t.queue_number}.`,
    onSuccess: (t) => navigate(`/student/queue/${t.id}`),
  });
  return (
    <div className="space-y-6">
      <Field label="Service" className="max-w-md">
        <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null); }}>
          <option value="">Choose a service</option>
          {services.data?.map((s) => <option key={s.id} value={s.id}>{s.office_name}: {s.name}</option>)}
        </Select>
      </Field>
      {svc?.description && <p className="max-w-[68ch] text-ink-soft">{svc.description}</p>}
      {serviceId && <SlotPicker serviceId={serviceId} onPick={setSlot} />}
      <ConfirmDialog open={Boolean(slot)} onOpenChange={(o) => !o && setSlot(null)} title="Reserve this time?"
        description={slot && svc ? `${svc.office_name}, ${svc.name}, on ${date(slot.slot_date)} at ${time(slot.start_time)}.` : undefined}
        confirmLabel="Reserve" loading={reserve.isPending} onConfirm={() => slot && reserve.mutate(slot.id)}>
        {svc && <p className="text-sm text-ink-soft">You can cancel up to {svc.cancellation_cutoff_minutes} minutes before your time.</p>}
      </ConfirmDialog>
    </div>
  );
}

function MyTickets() {
  const active = useQuery({ queryKey: ['tickets', 'mine'], queryFn: () => api.get<Ticket[]>('/queue/tickets/mine') });
  const history = useQuery({ queryKey: ['tickets', 'history'], queryFn: () => api.get<Ticket[]>('/queue/tickets/mine', { status: 'history' }) });
  return (
    <div className="space-y-8">
      <QueryView query={active} empty={(d) => d.length === 0 ? <EmptyState title="No upcoming reservations" /> : null}>
        {(list) => <div className="grid gap-4 md:grid-cols-2">{list.map((t) => <Link key={t.id} to={`/student/queue/${t.id}`} className="block"><QueueTicket t={t} compact /></Link>)}</div>}
      </QueryView>
      {history.data && history.data.length > 0 && (
        <Section title="Past reservations">
          <ul className="divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
            {history.data.map((t) => (
              <li key={t.id}><Link to={`/student/queue/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-lagoon-50/60">
                <span><span className="font-semibold">{t.service_name}</span><span className="block text-sm text-ink-faint">No. {t.queue_number}, {date(t.slot_date)}</span></span>
                <Status value={t.status} /></Link></li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function StudentQueue() {
  return (
    <>
      <PageHeader title="Queue" description="Reserve a time at a campus office and keep your number on your phone." />
      <Tabs tabs={[{ value: 'mine', label: 'My reservations', content: <MyTickets /> }, { value: 'book', label: 'Book a slot', content: <BookSlot /> }]} />
    </>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['tickets', id], queryFn: () => api.get<Ticket>(`/queue/tickets/${id}`) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useAction(() => api.post(`/queue/tickets/${id}/cancel`, { reason: reason || undefined }), { invalidate: ['tickets', 'slots'], success: 'Reservation cancelled', onSuccess: () => setCancelOpen(false) });
  const move = useAction((slotId: string) => api.post<Ticket>(`/queue/tickets/${id}/reschedule`, { slotId }), { invalidate: ['tickets', 'slots'], success: 'Reservation moved', onSuccess: () => setMoveOpen(false) });
  return (
    <>
      <PageHeader title="Reservation" back={<Button variant="link" asChild className="mb-2"><Link to="/student/queue"><ArrowLeft className="h-4 w-4" aria-hidden />Queue</Link></Button>} />
      <QueryView query={q}>
        {(t) => (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <div className="space-y-4">
              <QueueTicket t={t} />
              {t.status === 'reserved' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setMoveOpen(true)}>Change time</Button>
                  <Button variant="ghost" className="text-danger" onClick={() => setCancelOpen(true)}>Cancel reservation</Button>
                </div>
              )}
              {t.status === 'reserved' && <Notice title="On the day">Go to the office before your time and tell the staff your number to check in.</Notice>}
            </div>
            <Section title="History">
              <ol className="space-y-3">
                {t.events?.map((e) => (
                  <li key={e.id} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-lagoon" aria-hidden />
                    <span><span className="font-medium">{humanize(e.to_status ?? e.event_type)}</span><span className="block text-sm text-ink-faint">{dateTime(e.created_at)}{e.notes ? `, ${e.notes}` : ''}</span></span></li>
                ))}
              </ol>
              {t.cancel_reason && <div className="mt-4"><Facts items={[['Cancellation reason', t.cancel_reason]]} /></div>}
            </Section>
            <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this reservation?" confirmLabel="Cancel reservation" danger loading={cancel.isPending} onConfirm={() => cancel.mutate(undefined)}>
              <Field label="Reason" optional><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
            </ConfirmDialog>
            <Dialog open={moveOpen} onOpenChange={setMoveOpen} title="Choose a new time" wide>
              <SlotPicker serviceId={t.service_id} excludeSlot={undefined} onPick={(s) => move.mutate(s.id)} />
            </Dialog>
          </div>
        )}
      </QueryView>
    </>
  );
}
