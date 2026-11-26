import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Clock, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, usePaged } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { newIdempotencyKey } from '@/components/ui/extra';
import { Facts, Notice, PageHeader, Panel, Section } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { DataTable, Pagination } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { date, dateTime, money, today } from '@/lib/format';

export interface PenaltyRow { id: string; status: string; organization_code: string; policy_name: string; violation_count: number; required_hours: number; required_amount: number;
  assessed_at: string; student_name: string; student_number: string; resolution: { id: string; resolution_type: string; status: string } | null; policy_snapshot?: { allowed_resolutions?: string[] } }
interface PenaltyDetail extends PenaltyRow {
  resolutions: { id: string; resolution_type: string; status: string; selected_at: string }[];
  communityService: { id: string; service_date: string; hours_rendered: number; description: string; status: string; decision_notes: string | null }[];
  payments: { id: string; reference: string; amount: number; provider: string; status: string; verification_status: string; created_at: string }[];
  violations: { id: string; description: string; quantity: number | null; violation_count: number; occurred_on: string | null; status: string }[];
}
interface ViolationRow { id: string; organization_code: string; policy_name: string; description: string; status: string; occurred_on: string | null; created_at: string; violation_count: number | null; event_name: string | null }
interface Provider { code: string; label: string; mode: string; available: boolean; notice: string | null }

function Violations() {
  const q = usePaged<ViolationRow>('violations', '/violations', { scope: 'mine' });
  const [dispute, setDispute] = useState<ViolationRow | null>(null);
  const [reason, setReason] = useState('');
  const file = useAction(() => api.post(`/violations/${dispute!.id}/disputes`, { reason }), { invalidate: ['violations'], success: 'Dispute sent to the organization', onSuccess: () => { setDispute(null); setReason(''); } });
  return (
    <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No violations on record" /> : null}>
      {(d) => (<>
        <DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => `${r.organization_code}: ${r.policy_name}`} caption="Violations" columns={[
          { header: 'Policy', cell: (r) => <span className="font-semibold">{r.organization_code}: {r.policy_name}</span>, hideOnMobile: true },
          { header: 'What happened', cell: (r) => r.description },
          { header: 'Date', cell: (r) => date(r.occurred_on ?? r.created_at) },
          { header: 'Status', cell: (r) => <Status value={r.status} /> },
          { header: '', cell: (r) => ['reported', 'verified'].includes(r.status) ? <Button variant="link" onClick={() => setDispute(r)}>Dispute</Button> : null },
        ]} />
        <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        <ConfirmDialog open={Boolean(dispute)} onOpenChange={(o) => !o && setDispute(null)} title="Dispute this violation"
          description="Explain why it is wrong. The organization reviews it and tells you its decision." confirmLabel="Send dispute" loading={file.isPending}
          onConfirm={() => reason.trim().length >= 10 && file.mutate(undefined)}>
          <Field label="Reason" hint="At least 10 characters. Mention any proof you can show."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} /></Field>
        </ConfirmDialog>
      </>)}
    </QueryView>
  );
}

function Assessments() {
  const navigate = useNavigate();
  const q = usePaged<PenaltyRow>('penalties', '/penalties', { scope: 'mine' });
  return (
    <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No penalties" body="Penalties appear only after an organization verifies a violation." /> : null}>
      {(d) => (<>
        <DataTable rows={d.data} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/student/penalties/${r.id}`)} primary={(r) => `${r.organization_code}: ${r.policy_name}`} caption="Penalties" columns={[
          { header: 'Policy', cell: (r) => <span className="font-semibold">{r.organization_code}: {r.policy_name}</span>, hideOnMobile: true },
          { header: 'Violations', cell: (r) => r.violation_count },
          { header: 'Settle by', cell: (r) => `${r.required_hours} h or ${money(r.required_amount)}` },
          { header: 'Status', cell: (r) => <Status value={r.status} /> },
        ]} />
        <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
      </>)}
    </QueryView>
  );
}

export function StudentPenalties() {
  return (
    <>
      <PageHeader title="Penalties" description="Only violations your organization has verified count. You can dispute a violation you believe is wrong." />
      <Tabs tabs={[{ value: 'p', label: 'Penalties', content: <Assessments /> }, { value: 'v', label: 'Violations', content: <Violations /> }]} />
    </>
  );
}

const serviceSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date of the service.'),
  hours: z.coerce.number<number>().positive('Enter the hours you rendered.').max(24),
  description: z.string().trim().min(5, 'Describe what you did.').max(1000),
  supervisorName: z.string().max(120).optional(),
});

function PayOnline({ penalty }: { penalty: PenaltyDetail }) {
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => api.get<Provider[]>('/payments/providers') });
  const key = useMemo(() => newIdempotencyKey(), []);
  const pay = useAction((provider: string) => api.post<{ provider_checkout_url: string; sandbox: boolean }>('/payments', { assessmentId: penalty.id, provider }, { 'Idempotency-Key': key }), {
    onSuccess: (p) => { window.location.assign(p.provider_checkout_url); },
  });
  const sandbox = providers.data?.some((p) => p.mode === 'sandbox');
  const anyAvailable = providers.data?.some((p) => p.available);
  return (
    <div className="space-y-3">
      {sandbox && <Notice tone="sandbox" title="Test mode">Payments here are simulated for development. No money moves.</Notice>}
      {providers.data && !anyAvailable && <Notice tone="warning" title="Online payment is not available yet">GCash, Maya and LANDBANK will open after the university completes merchant setup. Pay your organization treasurer instead; they will record it.</Notice>}
      <div className="flex flex-wrap gap-2">
        {providers.data?.map((p) => (
          <Button key={p.code} variant={p.available ? 'primary' : 'secondary'} disabled={!p.available} loading={pay.isPending && pay.variables === p.code} onClick={() => pay.mutate(p.code)}>
            Pay {money(penalty.required_amount)} with {p.label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-ink-soft">After the provider confirms your payment, your organization verifies it. The penalty is settled only then.</p>
    </div>
  );
}

export function PenaltyDetailPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['penalty', id], queryFn: () => api.get<PenaltyDetail>(`/penalties/${id}`) });
  const [choice, setChoice] = useState<'community_service' | 'payment' | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const choose = useAction((type: string) => api.post(`/penalties/${id}/resolution`, { type }), { invalidate: ['penalty', 'penalties'], success: 'Choice saved', onSuccess: () => setChoice(null) });
  const form = useForm<z.infer<typeof serviceSchema>>({ resolver: zodResolver(serviceSchema), defaultValues: { serviceDate: today(), hours: 1, description: '', supervisorName: '' } });
  const submitService = useAction((v: z.infer<typeof serviceSchema>) => api.post(`/penalties/resolutions/${q.data!.resolution!.id}/community-service`, { ...v, supervisorName: v.supervisorName || undefined }),
    { invalidate: ['penalty', 'penalties'], success: 'Service hours sent for verification', onSuccess: () => { setServiceOpen(false); form.reset(); } });

  return (
    <QueryView query={q}>
      {(p) => {
        const allowed = p.policy_snapshot?.allowed_resolutions ?? ['community_service', 'payment'];
        const res = p.resolutions.find((r) => !['cancelled', 'rejected'].includes(r.status));
        const hoursDone = p.communityService.filter((s) => s.status !== 'rejected').reduce((a, s) => a + Number(s.hours_rendered), 0);
        return (<>
          <PageHeader title={`${p.organization_code}: ${p.policy_name}`} back={<Button variant="link" asChild className="mb-2"><Link to="/student/penalties"><ArrowLeft className="h-4 w-4" aria-hidden />Penalties</Link></Button>} />
          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0 space-y-8">
              <Panel><Facts items={[['Status', <Status key="s" value={p.status} />], ['Verified violations', p.violation_count], ['Community service', `${p.required_hours} hours`], ['Or payment', money(p.required_amount)], ['Assessed', dateTime(p.assessed_at)]]} /></Panel>

              {p.status === 'open' && !res && (
                <Section title="How do you want to settle this?">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {allowed.includes('community_service') && (
                      <button onClick={() => setChoice('community_service')} className="rounded-xl bg-white p-4 text-left ring-1 ring-mist hover:ring-2 hover:ring-lagoon">
                        <Clock className="mb-2 h-5 w-5 text-lagoon" aria-hidden /><span className="block font-bold">{p.required_hours} hours of community service</span>
                        <span className="text-sm text-ink-soft">Render the hours, then submit them for the organization to verify.</span></button>
                    )}
                    {allowed.includes('payment') && (
                      <button onClick={() => setChoice('payment')} className="rounded-xl bg-white p-4 text-left ring-1 ring-mist hover:ring-2 hover:ring-lagoon">
                        <Wallet className="mb-2 h-5 w-5 text-lagoon" aria-hidden /><span className="block font-bold">Pay {money(p.required_amount)}</span>
                        <span className="text-sm text-ink-soft">Pay online when available, or to the organization treasurer.</span></button>
                    )}
                  </div>
                </Section>
              )}

              {res?.resolution_type === 'community_service' && (
                <Section title="Community service" actions={p.status === 'open' ? <Button size="sm" onClick={() => setServiceOpen(true)}>Submit hours</Button> : undefined}>
                  <p className="mb-3 text-ink-soft">{hoursDone} of {p.required_hours} hours submitted.</p>
                  {p.communityService.length > 0 && (
                    <ul className="divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
                      {p.communityService.map((s) => <li key={s.id} className="flex items-start justify-between gap-3 p-3"><span><span className="font-medium">{s.hours_rendered} h on {date(s.service_date)}</span><span className="block text-sm text-ink-soft">{s.description}</span>{s.decision_notes && <span className="block text-sm">{s.decision_notes}</span>}</span><Status value={s.status} /></li>)}
                    </ul>
                  )}
                </Section>
              )}

              {res?.resolution_type === 'payment' && (
                <Section title="Payment">
                  {p.payments.length > 0 && (
                    <ul className="mb-4 divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
                      {p.payments.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><span className="font-medium">{money(x.amount)} via {x.provider.toUpperCase()}</span><span className="block text-sm text-ink-faint">{x.reference}, {dateTime(x.created_at)}</span></span>
                        <span className="flex gap-2"><Status value={x.status} /><Status value={x.verification_status} label={x.verification_status === 'unverified' ? 'Awaiting verification' : undefined} /></span></li>)}
                    </ul>
                  )}
                  {p.status === 'open' && !p.payments.some((x) => ['pending', 'paid'].includes(x.status)) && <PayOnline penalty={p} />}
                </Section>
              )}
            </div>
            <Section title="Violations counted">
              <ul className="space-y-3 text-sm">{p.violations.map((v) => <li key={v.id}><span className="font-medium">{v.description}</span><span className="block text-ink-faint">{date(v.occurred_on)}{v.quantity ? `, quantity ${v.quantity}` : ''}</span></li>)}</ul>
            </Section>
          </div>
          <ConfirmDialog open={Boolean(choice)} onOpenChange={(o) => !o && setChoice(null)} title={choice === 'payment' ? 'Settle by payment?' : 'Settle by community service?'}
            description="You can ask your organization to change this later if needed." confirmLabel="Confirm choice" loading={choose.isPending} onConfirm={() => choice && choose.mutate(choice)} />
          <Dialog open={serviceOpen} onOpenChange={setServiceOpen} title="Submit community service hours"
            footer={<><Button variant="secondary" onClick={() => setServiceOpen(false)}>Cancel</Button><Button form="cs-form" type="submit" loading={submitService.isPending}>Submit hours</Button></>}>
            <form id="cs-form" className="space-y-4" onSubmit={form.handleSubmit((v) => submitService.mutate(v))} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" error={form.formState.errors.serviceDate?.message}><Input type="date" max={today()} {...form.register('serviceDate')} /></Field>
                <Field label="Hours" error={form.formState.errors.hours?.message}><Input type="number" step="0.25" min="0.25" {...form.register('hours')} /></Field>
              </div>
              <Field label="What you did" error={form.formState.errors.description?.message}><Textarea {...form.register('description')} /></Field>
              <Field label="Supervisor" optional><Input {...form.register('supervisorName')} /></Field>
            </form>
          </Dialog>
        </>);
      }}
    </QueryView>
  );
}

interface PaymentRow { id: string; reference: string; amount: number; provider: string; status: string; verification_status: string; organization_code: string; created_at: string }

/** Payment history, and the return page from a provider checkout (or the clearly-marked development sandbox). */
export function StudentPayments() {
  const [params, setParams] = useSearchParams();
  const reference = params.get('reference');
  const isSandbox = params.get('sandbox') === '1';
  const q = usePaged<PaymentRow>('payments', '/payments', { scope: 'mine' });
  const complete = useAction((outcome: string) => api.post<{ result: string }>('/payments/sandbox/complete', { reference, outcome }), {
    invalidate: ['payments', 'penalty', 'penalties'], success: (r) => (r.result === 'processed' ? 'Test payment recorded' : 'No change made'),
    onSuccess: () => setParams({}),
  });
  return (
    <>
      <PageHeader title="Payments" description="Online penalty payments. Each one counts after your organization verifies it." />
      {isSandbox && reference && (
        <div className="mb-8 max-w-xl">
          <Notice tone="sandbox" title="Simulated checkout (development only)">
            <p>This page stands in for the provider’s checkout so the payment flow can be tested. No money moves. Reference {reference}.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" loading={complete.isPending && complete.variables === 'paid'} onClick={() => complete.mutate('paid')}>Simulate a successful payment</Button>
              <Button variant="secondary" loading={complete.isPending && complete.variables === 'failed'} onClick={() => complete.mutate('failed')}>Simulate a failed payment</Button>
              <Button variant="ghost" onClick={() => complete.mutate('cancelled')}>Cancel</Button>
            </div>
          </Notice>
        </div>
      )}
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No online payments" /> : null}>
        {(d) => (<>
          <DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => `${money(r.amount)} to ${r.organization_code}`} caption="Payments" columns={[
            { header: 'Amount', cell: (r) => <span className="font-semibold">{money(r.amount)}</span>, hideOnMobile: true },
            { header: 'Reference', cell: (r) => r.reference },
            { header: 'Method', cell: (r) => r.provider.toUpperCase() },
            { header: 'Payment', cell: (r) => <Status value={r.status} /> },
            { header: 'Organization check', cell: (r) => <Status value={r.verification_status} label={r.verification_status === 'unverified' ? 'Waiting' : undefined} /> },
            { header: 'Date', cell: (r) => date(r.created_at), hideOnMobile: true },
          ]} />
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
    </>
  );
}
