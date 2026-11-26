import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Megaphone, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess, type Assignment } from '@/lib/access';
import { useAction, usePaged } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Stat, StudentPicker, type StudentOption } from '@/components/ui/extra';
import { Facts, Notice, PageHeader, Panel, Section } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { DataTable, Pagination } from '@/components/ui/table';
import { date, dateTime, humanize, money, time, today } from '@/lib/format';
import { RequestDocuments, RequestTimeline, type RequestDetail, type RequestRow } from '@/features/student/Requests';

function useScope(permission: string): [Assignment | undefined, Assignment[], (id: string) => void] {
  const access = useAccess();
  const scopes = access.scopesWith(permission, 'office');
  const [id, setId] = useState<string | undefined>(scopes[0]?.scope_id);
  return [scopes.find((s) => s.scope_id === id) ?? scopes[0], scopes, setId];
}

function ScopePicker({ scopes, value, onChange }: { scopes: Assignment[]; value?: string; onChange: (id: string) => void }) {
  if (scopes.length < 2) return null;
  return <Field label="Office" className="max-w-xs"><Select value={value} onChange={(e) => onChange(e.target.value)}>{scopes.map((s) => <option key={s.scope_id} value={s.scope_id}>{s.scope_name}</option>)}</Select></Field>;
}

export function OfficeHome() {
  const access = useAccess();
  const offices = access.assignments.filter((a) => a.scope_type === 'office');
  const requests = useQuery({ queryKey: ['requests', 'office', 'waiting'], queryFn: () => api.page('/requests', { scope: 'office', status: 'submitted', pageSize: 1 }), enabled: access.can('requests.manage') });
  const approvals = useQuery({ queryKey: ['approvals', 'count'], queryFn: () => api.page('/clearance/approvals/pending', { pageSize: 1 }), enabled: access.can('clearance.approve') });
  return (
    <>
      <PageHeader title="Office" description={offices.map((o) => `${o.position_name}, ${o.scope_name}`).join('; ')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {access.can('requests.manage') && <Link to="/office/requests"><Stat label="New requests" value={requests.data?.meta.total ?? '…'} tone={requests.data?.meta.total ? 'attention' : undefined} /></Link>}
        {access.can('clearance.approve') && <Link to="/approvals"><Stat label="Waiting for your signature" value={approvals.data?.meta.total ?? '…'} tone={approvals.data?.meta.total ? 'attention' : undefined} /></Link>}
      </div>
    </>
  );
}

interface BoardTicket { id: string; queue_number: number; status: string; student_name: string; student_number: string; service_name: string; slot_id: string; start_time: string; end_time: string }
const NEXT: Record<string, { status: string; label: string }[]> = {
  reserved: [{ status: 'checked_in', label: 'Check in' }, { status: 'no_show', label: 'No show' }],
  checked_in: [{ status: 'serving', label: 'Start serving' }, { status: 'no_show', label: 'No show' }],
  serving: [{ status: 'completed', label: 'Done' }],
};

export function QueueBoard() {
  const [scope, scopes, setScope] = useScope('queue.manage');
  const [day, setDay] = useState(today());
  const board = usePaged<BoardTicket>('board', `/queue/offices/${scope?.scope_id}/board`, { date: day }, 100);
  const update = useAction(({ id, status }: { id: string; status: string }) => api.post(`/queue/tickets/${id}/status`, { status }), { invalidate: ['board'], success: (r: unknown) => `Ticket ${String((r as { queue_number: number }).queue_number).padStart(3, '0')} updated` });
  const callNext = useAction((slotId: string) => api.post<{ queue_number: number }>(`/queue/slots/${slotId}/call-next`), { invalidate: ['board'], success: (t) => `Calling number ${String(t.queue_number).padStart(3, '0')}` });
  if (!scope) return <EmptyState title="You do not manage a queue" />;
  const rows = board.data?.data ?? [];
  const slots = [...new Map(rows.map((r) => [r.slot_id, r])).values()];
  const serving = rows.filter((r) => r.status === 'serving');
  return (
    <>
      <PageHeader title="Queue board" description={scope.scope_name} />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <ScopePicker scopes={scopes} value={scope.scope_id} onChange={setScope} />
        <Field label="Day"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      </div>
      {serving.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3" aria-live="polite">
          {serving.map((s) => <div key={s.id} className="rounded-xl bg-lagoon px-5 py-3 text-white"><p className="text-sm text-white/80">Now serving</p><p className="numeral text-4xl font-black text-mango">{String(s.queue_number).padStart(3, '0')}</p><p className="text-sm">{s.student_name}</p></div>)}
        </div>
      )}
      <QueryView query={board} empty={(d) => d.data.length === 0 ? <EmptyState title="No reservations for this day" /> : null}>
        {() => (
          <div className="space-y-8">
            {slots.map((slot) => (
              <Section key={slot.slot_id} title={`${time(slot.start_time)} to ${time(slot.end_time)}`} description={slot.service_name}
                actions={<Button size="sm" variant="attention" onClick={() => callNext.mutate(slot.slot_id)} loading={callNext.isPending && callNext.variables === slot.slot_id}><Megaphone className="h-4 w-4" aria-hidden />Call next</Button>}>
                <DataTable rows={rows.filter((r) => r.slot_id === slot.slot_id)} rowKey={(r) => r.id} primary={(r) => `${String(r.queue_number).padStart(3, '0')} ${r.student_name}`} caption="Tickets" columns={[
                  { header: 'No.', cell: (r) => <span className="numeral text-lg font-extrabold">{String(r.queue_number).padStart(3, '0')}</span>, hideOnMobile: true },
                  { header: 'Student', cell: (r) => <span>{r.student_name}<span className="block text-sm text-ink-faint">{r.student_number}</span></span>, hideOnMobile: true },
                  { header: 'Status', cell: (r) => <Status value={r.status} /> },
                  { header: 'Next', cell: (r) => <span className="flex flex-wrap gap-1">{(NEXT[r.status] ?? []).map((n) => <Button key={n.status} size="sm" variant={n.status === 'no_show' ? 'ghost' : 'secondary'} onClick={() => update.mutate({ id: r.id, status: n.status })}>{n.label}</Button>)}</span> },
                ]} />
              </Section>
            ))}
          </div>
        )}
      </QueryView>
    </>
  );
}

export function OfficeRequests() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('submitted');
  const q = usePaged<RequestRow>('requests', '/requests', { scope: 'office', status: status || undefined });
  return (
    <>
      <PageHeader title="Requests" description="Requests sent to your office." />
      <Field label="Show" className="mb-4 max-w-xs">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); q.setPage(1); }}>
          <option value="submitted">New</option><option value="in_review">In review</option><option value="ready_for_release">Ready for release</option>
          <option value="released">Released</option><option value="rejected">Rejected</option><option value="">All</option>
        </Select>
      </Field>
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No requests here" /> : null}>
        {(d) => (<>
          <DataTable rows={d.data} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/office/requests/${r.id}`)} primary={(r) => `${r.student_name}: ${r.service_name}`} caption="Requests" columns={[
            { header: 'Student', cell: (r) => <span className="font-semibold">{r.student_name}<span className="block text-sm font-normal text-ink-faint">{r.student_number}</span></span>, hideOnMobile: true },
            { header: 'Request', cell: (r) => r.service_name },
            { header: 'Number', cell: (r) => r.request_number, hideOnMobile: true },
            { header: 'Sent', cell: (r) => date(r.submitted_at) },
            { header: 'Status', cell: (r) => <Status value={r.status} /> },
          ]} />
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
    </>
  );
}

const TRANSITIONS: Record<string, { status: string; label: string; needsReason?: boolean }[]> = {
  submitted: [{ status: 'in_review', label: 'Start review' }, { status: 'rejected', label: 'Reject', needsReason: true }],
  in_review: [{ status: 'ready_for_release', label: 'Mark ready for release' }, { status: 'rejected', label: 'Reject', needsReason: true }],
  ready_for_release: [{ status: 'released', label: 'Mark released' }],
};

export function OfficeRequestDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['request', id], queryFn: () => api.get<RequestDetail>(`/requests/${id}`) });
  const [next, setNext] = useState<{ status: string; label: string; needsReason?: boolean } | null>(null);
  const [remarks, setRemarks] = useState('');
  const change = useAction(() => api.post(`/requests/${id}/status`, { status: next!.status, remarks: remarks || undefined }), { invalidate: ['request', 'requests'], success: () => `Request ${humanize(next?.status).toLowerCase()}`, onSuccess: () => { setNext(null); setRemarks(''); } });
  const suggest = useAction(() => api.post<{ suggestedCategory: string; confidence: number }>(`/ai/requests/${id}/suggest-category`), { invalidate: ['request'], success: (r) => `Suggested: ${humanize(r.suggestedCategory)} (${Math.round(r.confidence * 100)}%)` });
  return (
    <QueryView query={q}>
      {(r) => (<>
        <PageHeader title={`${r.student_name}: ${r.service_name}`} description={r.request_number}
          back={<Button variant="link" asChild className="mb-2"><Link to="/office/requests"><ArrowLeft className="h-4 w-4" aria-hidden />Requests</Link></Button>}
          actions={(TRANSITIONS[r.status] ?? []).map((t) => <Button key={t.status} variant={t.needsReason ? 'secondary' : 'primary'} onClick={() => setNext(t)}>{t.label}</Button>)} />
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-8">
            <Panel><Facts items={[['Status', <Status key="s" value={r.status} />], ['Student no.', r.student_number], ['Purpose', r.purpose], ['Details', r.details], ['Sent', dateTime(r.submitted_at)], ['Remarks', r.remarks]]} /></Panel>
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-semibold">Category suggestion</p>
                  <p className="text-sm text-ink-soft">{r.ai_suggested_category ? `${humanize(r.ai_suggested_category)}, ${Math.round(Number(r.ai_suggestion_confidence) * 100)}% match. A suggestion only; you decide.` : 'Ask the assistant which service this request most likely belongs to.'}</p></div>
                <Button variant="secondary" size="sm" onClick={() => suggest.mutate(undefined)} loading={suggest.isPending}><Sparkles className="h-4 w-4" aria-hidden />Suggest</Button>
              </div>
            </Panel>
            <RequestDocuments request={r} canUpload={!['released', 'rejected', 'cancelled'].includes(r.status)} />
          </div>
          <Section title="Progress"><RequestTimeline history={r.history} /></Section>
        </div>
        <ConfirmDialog open={Boolean(next)} onOpenChange={(o) => !o && setNext(null)} title={`${next?.label ?? ''}?`} confirmLabel={next?.label ?? 'Confirm'} danger={next?.status === 'rejected'} loading={change.isPending}
          onConfirm={() => (next?.needsReason && !remarks.trim() ? undefined : change.mutate(undefined))}>
          <Field label={next?.needsReason ? 'Reason (the student will see this)' : 'Remarks'} optional={!next?.needsReason}><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} /></Field>
        </ConfirmDialog>
      </>)}
    </QueryView>
  );
}

interface GuidanceRow { id: string; student_name: string; student_number: string; program_code: string; teacher_evaluations_status: string; slip_status: string; slip_number: string | null; updated_at: string }
interface LibraryRow { id: string; student_name: string; student_number: string; program_code: string; id_validation_status: string; receipt_status: string; slip_status: string; slip_number: string | null; updated_at: string }

export function GuidancePage() {
  const [scope] = useScope('guidance.manage');
  const [student, setStudent] = useState<StudentOption | null>(null);
  const list = usePaged<GuidanceRow>('guidance', '/guidance/records');
  const confirm = useAction(() => api.post('/guidance/confirm-evaluations', { studentId: student!.id, officeId: scope!.scope_id }), { invalidate: ['guidance'], success: 'Teacher evaluations confirmed' });
  const issue = useAction(() => api.post('/guidance/issue-slip', { studentId: student!.id, officeId: scope!.scope_id }), { invalidate: ['guidance'], success: 'Guidance slip issued' });
  if (!scope) return <EmptyState title="You do not work in Guidance" />;
  return (
    <>
      <PageHeader title="Guidance" description="Confirm teacher evaluations first; the guidance slip can be issued only after that." />
      <Panel className="mb-8 max-w-xl space-y-4">
        <StudentPicker value={student} onChange={setStudent} />
        {student && <div className="flex flex-wrap gap-2"><Button onClick={() => confirm.mutate(undefined)} loading={confirm.isPending}>Confirm teacher evaluations</Button><Button variant="secondary" onClick={() => issue.mutate(undefined)} loading={issue.isPending}>Issue guidance slip</Button></div>}
      </Panel>
      <Section title="This academic year">
        <QueryView query={list} empty={(d) => d.data.length === 0 ? <EmptyState title="No guidance records yet" /> : null}>
          {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Guidance records" columns={[
            { header: 'Student', cell: (r) => `${r.student_name} (${r.student_number})`, hideOnMobile: true },
            { header: 'Program', cell: (r) => r.program_code },
            { header: 'Teacher evaluations', cell: (r) => <Status value={r.teacher_evaluations_status === 'completed' ? 'verified' : 'pending'} label={humanize(r.teacher_evaluations_status)} /> },
            { header: 'Slip', cell: (r) => <Status value={r.slip_status} label={r.slip_number ?? undefined} /> },
          ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={list.setPage} /></>)}
        </QueryView>
      </Section>
    </>
  );
}

export function LibraryPage() {
  const [scope] = useScope('library.manage');
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [dialog, setDialog] = useState<'id' | 'receipt' | null>(null);
  const [form, setForm] = useState({ libraryId: '', receiptNumber: '', amount: '', remarks: '', decision: 'validated' });
  const list = usePaged<LibraryRow>('library', '/library/records');
  const done = () => { setDialog(null); setForm({ libraryId: '', receiptNumber: '', amount: '', remarks: '', decision: 'validated' }); };
  const validate = useAction(() => api.post('/library/validate-id', { studentId: student!.id, officeId: scope!.scope_id, libraryIdNumber: form.libraryId, decision: form.decision, remarks: form.remarks || undefined }), { invalidate: ['library'], success: 'Library ID decision saved', onSuccess: done });
  const receipt = useAction(() => api.post('/library/verify-receipt', { studentId: student!.id, officeId: scope!.scope_id, receiptNumber: form.receiptNumber, amount: Number(form.amount), decision: form.decision === 'validated' ? 'verified' : 'rejected', remarks: form.remarks || undefined }), { invalidate: ['library'], success: 'Library receipt decision saved', onSuccess: done });
  const issue = useAction(() => api.post('/library/issue-slip', { studentId: student!.id, officeId: scope!.scope_id }), { invalidate: ['library'], success: 'Library slip issued' });
  if (!scope) return <EmptyState title="You do not work in the Library" />;
  return (
    <>
      <PageHeader title="Library" description="Validate the student’s library ID for this academic year and check the library receipt before issuing the slip." />
      <Panel className="mb-8 max-w-xl space-y-4">
        <StudentPicker value={student} onChange={setStudent} />
        {student && <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDialog('id')}>Validate library ID</Button><Button variant="secondary" onClick={() => setDialog('receipt')}>Check library receipt</Button><Button onClick={() => issue.mutate(undefined)} loading={issue.isPending}>Issue library slip</Button></div>}
      </Panel>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} title={dialog === 'id' ? 'Validate library ID' : 'Check library receipt'}
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button loading={validate.isPending || receipt.isPending} onClick={() => (dialog === 'id' ? validate.mutate(undefined) : receipt.mutate(undefined))}>Save decision</Button></>}>
        <div className="space-y-4">
          {dialog === 'id' ? <Field label="Library ID number"><Input value={form.libraryId} onChange={(e) => setForm({ ...form, libraryId: e.target.value })} /></Field> : (
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Receipt number"><Input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} /></Field>
              <Field label="Amount (₱)"><Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field></div>)}
          <Field label="Decision"><Select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}><option value="validated">{dialog === 'id' ? 'Valid for this academic year' : 'Receipt is genuine'}</option><option value="rejected">Reject</option></Select></Field>
          <Field label="Remarks" optional><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
        </div>
      </Dialog>
      <Section title="This academic year">
        <QueryView query={list} empty={(d) => d.data.length === 0 ? <EmptyState title="No library records yet" /> : null}>
          {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Library records" columns={[
            { header: 'Student', cell: (r) => `${r.student_name} (${r.student_number})`, hideOnMobile: true },
            { header: 'ID', cell: (r) => <Status value={r.id_validation_status} /> },
            { header: 'Receipt', cell: (r) => <Status value={r.receipt_status} /> },
            { header: 'Slip', cell: (r) => <Status value={r.slip_status} label={r.slip_number ?? undefined} /> },
          ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={list.setPage} /></>)}
        </QueryView>
      </Section>
    </>
  );
}

interface ClearanceRow { id: string; clearance_number: string; status: string; student_name: string; student_number: string; program_code: string; section: string; approved_steps: number; total_steps: number; initiated_at: string }

export function OfficeClearances() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [open, setOpen] = useState(false);
  const [qText, setQText] = useState('');
  const list = usePaged<ClearanceRow>('clearances', '/clearances', { scope: 'all', q: qText || undefined });
  const start = useAction(() => api.post<{ id: string }>('/clearances', { studentId: student!.id }), { invalidate: ['clearances'], success: 'Clearance started', onSuccess: (c) => { setOpen(false); setStudent(null); navigate(`/clearances/${c.id}`); } });
  return (
    <>
      <PageHeader title="Clearances" description="Start a student’s clearance. Steps follow the active clearance template." actions={<Button onClick={() => setOpen(true)}>Start a clearance</Button>} />
      <Field label="Search" className="mb-4 max-w-sm"><Input value={qText} placeholder="Name or student number" onChange={(e) => { setQText(e.target.value); list.setPage(1); }} /></Field>
      <QueryView query={list} empty={(d) => d.data.length === 0 ? <EmptyState title="No clearances" /> : null}>
        {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/clearances/${r.id}`)} primary={(r) => r.student_name} caption="Clearances" columns={[
          { header: 'Student', cell: (r) => <span className="font-semibold">{r.student_name}</span>, hideOnMobile: true },
          { header: 'Program', cell: (r) => `${r.program_code} ${r.section}` },
          { header: 'Signatures', cell: (r) => `${r.approved_steps} of ${r.total_steps}` },
          { header: 'Status', cell: (r) => <Status value={r.status} /> },
          { header: 'Started', cell: (r) => date(r.initiated_at), hideOnMobile: true },
        ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={list.setPage} /></>)}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen} title="Start a clearance" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!student} loading={start.isPending} onClick={() => start.mutate(undefined)}>Start clearance</Button></>}>
        <StudentPicker value={student} onChange={setStudent} />
        <div className="mt-4"><Notice title="What happens next">The student is notified and can follow each signing station from their phone.</Notice></div>
      </Dialog>
    </>
  );
}

export { money };
