import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Download, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';
import { useAction, usePaged } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stat } from '@/components/ui/extra';
import { Facts, PageHeader, Panel, Section } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { DataTable, Pagination } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { dateTime, humanize, money, today } from '@/lib/format';
import { Assistant } from './Assistant';
import { CampusMap } from './CampusMap';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Notification { id: string; category: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

export function NotificationsPage() {
  const q = usePaged<Notification>('notifications', '/notifications');
  const readAll = useAction(() => api.post('/notifications/read-all'), { invalidate: ['notifications'], success: 'All marked as read' });
  const read = useAction((id: string) => api.post(`/notifications/${id}/read`), { invalidate: ['notifications'] });
  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" onClick={() => readAll.mutate(undefined)} loading={readAll.isPending}>Mark all as read</Button>} />
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="Nothing new" body="Updates about your requests, queue, clearance and payments appear here." /> : null}>
        {(d) => (<>
          <ul className="divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
            {d.data.map((n) => (
              <li key={n.id} className={cn('flex gap-3 p-4', !n.read_at && 'bg-lagoon-50/50')}>
                <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-mango')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{n.title}<span className="sr-only">{n.read_at ? '' : ' (unread)'}</span></p>
                  {n.body && <p className="text-ink-soft">{n.body}</p>}
                  <p className="mt-1 text-sm text-ink-faint">{humanize(n.category)}, {dateTime(n.created_at)}</p>
                </div>
                {!n.read_at && <Button variant="ghost" size="sm" onClick={() => read.mutate(n.id)}>Mark read</Button>}
              </li>
            ))}
          </ul>
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
    </>
  );
}

const profileSchema = z.object({ fullName: z.string().trim().min(2, 'Enter your name.').max(120), phone: z.string().trim().regex(/^$|^[0-9+() -]{7,30}$/, 'Enter a valid phone number.') });

export function ProfilePage() {
  const access = useAccess();
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { fullName: access.profile.full_name ?? '', phone: access.profile.phone ?? '' } });
  const save = useAction((v: z.infer<typeof profileSchema>) => api.patch('/me', { fullName: v.fullName, phone: v.phone || undefined }), { invalidate: ['me'], success: 'Profile saved' });
  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Panel>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <Field label="Full name" error={form.formState.errors.fullName?.message}><Input autoComplete="name" {...form.register('fullName')} /></Field>
            <Field label="Phone" optional error={form.formState.errors.phone?.message}><Input type="tel" autoComplete="tel" {...form.register('phone')} /></Field>
            <Field label="Email" hint="Ask the Registrar to change your email."><Input value={access.profile.email} disabled readOnly /></Field>
            <Button type="submit" loading={save.isPending}>Save profile</Button>
          </form>
        </Panel>
        <div className="space-y-6">
          {access.student && <Panel><h2 className="mb-3 text-lg">Enrolment</h2><Facts items={[['Student no.', access.student.student_number], ['Program', access.student.program_name], ['Year and section', `${access.student.year_level}, ${access.student.section}`], ['Department organization', access.student.department_organization_code ?? 'Not confirmed yet']]} /></Panel>}
          {access.assignments.length > 0 && (
            <Panel><h2 className="mb-3 text-lg">Positions this year</h2>
              <ul className="space-y-2">{access.assignments.map((a) => <li key={`${a.scope_id}-${a.position_code}`}><span className="font-medium">{a.position_name}</span><span className="text-ink-soft">, {a.scope_name}{a.section ? ` (${a.section})` : ''}</span></li>)}</ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

interface Conversation { id: string; title: string | null; last_message_at: string | null }

export function AssistantPage() {
  const list = useQuery({ queryKey: ['ai-conversations'], queryFn: () => api.page<Conversation>('/ai/conversations', { pageSize: 20 }) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const conv = useQuery({ queryKey: ['ai-conversation', openId], queryFn: () => api.get<{ id: string; messages: { role: 'user' | 'assistant'; content: string; citations: never[]; id: string }[] }>(`/ai/conversations/${openId}`), enabled: Boolean(openId) });
  const [del, setDel] = useState<string | null>(null);
  const remove = useAction((id: string) => api.del(`/ai/conversations/${id}`), { invalidate: ['ai-conversations'], success: 'Conversation deleted', onSuccess: () => { setDel(null); setOpenId(null); setNonce((n) => n + 1); } });
  return (
    <>
      <PageHeader title="Assistant" description="Answers from campus documents you are allowed to see. It cannot approve or change anything." actions={<Button variant="secondary" onClick={() => { setOpenId(null); setNonce((n) => n + 1); }}>New conversation</Button>} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Conversations" className="order-2 lg:order-1">
          <h2 className="mb-2 text-base">Earlier</h2>
          {list.data?.data.length ? (
            <ul className="space-y-1">{list.data.data.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button onClick={() => setOpenId(c.id)} className={cn('min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-lagoon-50', openId === c.id && 'bg-lagoon-50 font-semibold')}>{c.title ?? 'Conversation'}</button>
                <Button variant="ghost" size="icon" aria-label="Delete conversation" onClick={() => setDel(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>))}</ul>
          ) : <p className="text-sm text-ink-faint">No earlier conversations.</p>}
        </nav>
        <div className="order-1 lg:order-2">
          {openId ? (conv.data ? <Assistant key={openId} initialConversation={{ id: conv.data.id, messages: conv.data.messages }} /> : <p className="text-ink-faint">Loading…</p>) : <Assistant key={`new-${nonce}`} />}
        </div>
      </div>
      <ConfirmDialog open={Boolean(del)} onOpenChange={(o) => !o && setDel(null)} title="Delete this conversation?" confirmLabel="Delete" danger loading={remove.isPending} onConfirm={() => del && remove.mutate(del)} />
    </>
  );
}

export function CampusMapPage() {
  return (<><PageHeader title="Campus map" description="Verified places are solid; places not yet verified are dashed." /><CampusMap /></>);
}

interface PendingApproval { id: string; step_name: string; clearance_id: string; clearance_number: string; student_name: string; student_number: string; program_code: string; section: string; is_actionable: boolean; status: string }

/** Clearance signing for any approver (SSG Governor, SAS Head, Mayors, Program Heads). */
export function ApprovalsPage() {
  const q = usePaged<PendingApproval>('approvals', '/clearance/approvals/pending');
  return (
    <>
      <PageHeader title="Clearance signing" description="Students waiting for your signature. A step can be signed only after earlier steps are signed and its requirements are met." />
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No one is waiting for your signature" /> : null}>
        {(d) => (<>
          <DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Pending signatures" columns={[
            { header: 'Student', cell: (r) => <Link to={`/clearances/${r.clearance_id}`} className="font-semibold text-lagoon hover:underline">{r.student_name}</Link>, hideOnMobile: true },
            { header: 'Student no.', cell: (r) => r.student_number },
            { header: 'Program', cell: (r) => `${r.program_code} ${r.section}` },
            { header: 'Step', cell: (r) => r.step_name },
            { header: 'Ready', cell: (r) => r.is_actionable ? <Status value="active" label="Ready to sign" /> : <Status value="pending" label="Earlier steps first" /> },
            { header: '', cell: (r) => <Button variant="secondary" size="sm" asChild><Link to={`/clearances/${r.clearance_id}`}>Open</Link></Button> },
          ]} />
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
    </>
  );
}

interface Summary { [k: string]: Record<string, number> | number }

export function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  const summary = useQuery({ queryKey: ['report-summary', from, to], queryFn: () => api.get<Summary>('/reports/summary', { from: from || undefined, to: to || undefined }) });
  const receipts = useQuery({ queryKey: ['report-receipts', from, to], queryFn: () => api.get<{ organization: string; obligation: string; name: string; verified_count: number; verified_total: number; pending_count: number }[]>('/reports/receipts-by-obligation', { from: from || undefined, to: to || undefined }) });
  const steps = useQuery({ queryKey: ['report-steps', from, to], queryFn: () => api.get<{ step_name: string; pending: number; returned: number; approved: number }[]>('/reports/clearance-steps', { from: from || undefined, to: to || undefined }) });
  const download = async (name: string) => {
    try {
      const blob = await api.blob(`/reports/${name}`, { format: 'csv', from: from || undefined, to: to || undefined });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error('Download failed', e instanceof Error ? e.message : undefined); }
  };
  const total = (k: string) => { const v = summary.data?.[k]; return typeof v === 'object' ? Object.values(v).reduce((a, b) => a + b, 0) : 0; };
  return (
    <>
      <PageHeader title="Reports" description="Counts cover only the records you are allowed to see." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <QueryView query={summary}>
        {(s) => (
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Requests" value={total('requests')} hint={`${(s.requests as Record<string, number>)?.submitted ?? 0} waiting`} />
            <Stat label="Queue tickets" value={total('queueTickets')} hint={`${(s.queueTickets as Record<string, number>)?.completed ?? 0} served`} />
            <Stat label="Clearances" value={total('clearances')} hint={`${(s.clearances as Record<string, number>)?.completed ?? 0} completed`} />
            <Stat label="Verified collections" value={money(Number(s.verifiedCollections))} />
          </div>
        )}
      </QueryView>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Clearance steps" actions={<Button variant="secondary" size="sm" onClick={() => download('clearance-steps')}><Download className="h-4 w-4" aria-hidden />CSV</Button>}>
          <Panel>
            {steps.data && steps.data.length > 0 ? (
              <div className="h-64"><Bar options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } }}
                data={{ labels: steps.data.map((x) => x.step_name), datasets: [
                  { label: 'Signed', data: steps.data.map((x) => x.approved), backgroundColor: '#0E5E6F' },
                  { label: 'Waiting', data: steps.data.map((x) => x.pending), backgroundColor: '#F2A900' },
                  { label: 'Returned', data: steps.data.map((x) => x.returned), backgroundColor: '#B42318' }] }} /></div>
            ) : <p className="text-ink-soft">No clearances in this period.</p>}
          </Panel>
        </Section>
        <Section title="Receipts by fee" actions={<Button variant="secondary" size="sm" onClick={() => download('receipts-by-obligation')}><Download className="h-4 w-4" aria-hidden />CSV</Button>}>
          <QueryView query={receipts}>
            {(rows) => <DataTable rows={rows} rowKey={(r) => r.obligation} primary={(r) => r.name} caption="Receipts by fee" columns={[
              { header: 'Fee', cell: (r) => `${r.organization}: ${r.name}`, hideOnMobile: true },
              { header: 'Verified', cell: (r) => r.verified_count },
              { header: 'Total', cell: (r) => money(r.verified_total) },
              { header: 'Waiting', cell: (r) => r.pending_count },
            ]} />}
          </QueryView>
        </Section>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => download('queue-daily')}><Download className="h-4 w-4" aria-hidden />Queue by day (CSV)</Button>
        <Button variant="secondary" size="sm" onClick={() => download('violations-by-organization')}><Download className="h-4 w-4" aria-hidden />Violations (CSV)</Button>
      </div>
    </>
  );
}

