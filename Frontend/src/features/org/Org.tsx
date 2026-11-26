import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
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
import { Tabs } from '@/components/ui/tabs';
import { date, dateTime, money } from '@/lib/format';
import type { ReceiptRow } from '@/features/student/Receipts';
import type { PenaltyRow } from '@/features/student/Penalties';

interface Obligation { id: string; code: string; name: string; amount: number; organization_id: string; organization_code: string; applicability: string; applicability_confirmed: boolean }
interface Policy { id: string; code: string; name: string; organization_id: string; organization_code: string; active_version: null | { calculation_type: string; quantity_unit: string | null; quantity_per_violation: number | null; penalty_confirmed: boolean; hours_per_violation: number | null; amount_per_violation: number | null } }
interface OrgEvent { id: string; name: string; event_date: string; organization_id: string }

/** Organizations where the caller holds a permission (a hint for the UI; the server checks again). */
function useOrgs(permission: string): Assignment[] {
  return useAccess().scopesWith(permission, 'organization');
}

function OrgFilter({ orgs, value, onChange }: { orgs: Assignment[]; value: string; onChange: (v: string) => void }) {
  if (orgs.length < 2) return null;
  return <Field label="Organization" className="max-w-xs"><Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">All my organizations</option>{orgs.map((o) => <option key={o.scope_id} value={o.scope_id}>{o.scope_name}</option>)}</Select></Field>;
}

export function OrgHome() {
  const access = useAccess();
  const orgs = access.assignments.filter((a) => a.scope_type === 'organization');
  const receipts = useQuery({ queryKey: ['receipts', 'pending-count'], queryFn: () => api.page('/receipts', { status: 'pending_verification', pageSize: 1 }), enabled: access.can('receipts.verify') });
  const violations = useQuery({ queryKey: ['violations', 'reported-count'], queryFn: () => api.page('/violations', { scope: 'all', status: 'reported', pageSize: 1 }), enabled: access.can('violations.review') });
  const payments = useQuery({ queryKey: ['payments', 'unverified-count'], queryFn: () => api.page('/payments', { scope: 'all', status: 'paid', verification: 'unverified', pageSize: 1 }), enabled: access.can('payments.verify') });
  const approvals = useQuery({ queryKey: ['approvals', 'count'], queryFn: () => api.page('/clearance/approvals/pending', { pageSize: 1 }), enabled: access.can('clearance.approve') });
  const tiles: [boolean, string, string, number | undefined][] = [
    [access.can('receipts.verify'), '/org/receipts', 'Receipts to verify', receipts.data?.meta.total],
    [access.can('violations.review'), '/org/violations', 'Violations to review', violations.data?.meta.total],
    [access.can('payments.verify'), '/org/payments', 'Payments to verify', payments.data?.meta.total],
    [access.can('clearance.approve'), '/approvals', 'Waiting for your signature', approvals.data?.meta.total],
  ];
  return (
    <>
      <PageHeader title="Organization" description={orgs.map((o) => `${o.position_name}, ${o.scope_name}${o.section ? ` (${o.section})` : ''}`).join('; ')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.filter((t) => t[0]).map(([, to, label, n]) => <Link key={to} to={to}><Stat label={label} value={n ?? '…'} tone={n ? 'attention' : undefined} /></Link>)}
      </div>
    </>
  );
}

export function OrgReceipts() {
  const access = useAccess();
  const recordOrgs = useOrgs('receipts.record');
  const viewOrgs = [...useOrgs('receipts.view'), ...useOrgs('receipts.verify')];
  const orgs = [...new Map([...recordOrgs, ...viewOrgs].map((o) => [o.scope_id, o])).values()];
  const [org, setOrg] = useState('');
  const [status, setStatus] = useState('pending_verification');
  const q = usePaged<ReceiptRow & { organization_id: string; recorded_by: string }>('receipts', '/receipts', { organizationId: org || undefined, status: status || undefined });
  const obligations = useQuery({ queryKey: ['obligations'], queryFn: () => api.get<Obligation[]>('/receipts/obligations') });
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [obligationId, setObligationId] = useState('');
  const [notes, setNotes] = useState('');
  const recordable = obligations.data?.filter((o) => recordOrgs.some((r) => r.scope_id === o.organization_id)) ?? [];
  const ob = recordable.find((o) => o.id === obligationId);
  const record = useAction(() => api.post('/receipts', { obligationId, studentId: student!.id, amount: ob!.amount, notes: notes || undefined }), {
    invalidate: ['receipts'], success: 'Receipt recorded. It counts once verified.', onSuccess: () => { setOpen(false); setStudent(null); setNotes(''); },
  });
  const [verify, setVerify] = useState<{ r: ReceiptRow; decision: 'verified' | 'rejected' | 'voided' } | null>(null);
  const decide = useAction(() => api.post(`/receipts/${verify!.r.id}/verify`, { decision: verify!.decision, notes: notes || undefined }), { invalidate: ['receipts'], success: 'Decision saved', onSuccess: () => { setVerify(null); setNotes(''); } });
  return (
    <>
      <PageHeader title="Receipts" description="Record fees paid to your organization. A receipt counts for clearance only after it is verified."
        actions={recordOrgs.length > 0 ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Record a receipt</Button> : undefined} />
      <div className="mb-4 flex flex-wrap gap-3">
        <OrgFilter orgs={orgs} value={org} onChange={setOrg} />
        <Field label="Status" className="max-w-xs"><Select value={status} onChange={(e) => { setStatus(e.target.value); q.setPage(1); }}>
          <option value="pending_verification">Waiting for verification</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="">All</option></Select></Field>
      </div>
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No receipts here" /> : null}>
        {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Receipts" columns={[
          { header: 'Student', cell: (r) => <span className="font-semibold">{r.student_name}<span className="block text-sm font-normal text-ink-faint">{r.student_number}</span></span>, hideOnMobile: true },
          { header: 'Fee', cell: (r) => `${r.organization_code}: ${r.obligation_name}` },
          { header: 'Amount', cell: (r) => money(r.amount) },
          { header: 'Source', cell: (r) => (r.source === 'batch' ? 'Class remittance' : 'Individual'), hideOnMobile: true },
          { header: 'Status', cell: (r) => <Status value={r.status} /> },
          { header: '', cell: (r) => access.canIn('receipts.verify', r.organization_id) && r.status === 'pending_verification' ? (
            <span className="flex gap-1"><Button size="sm" onClick={() => setVerify({ r, decision: 'verified' })}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setVerify({ r, decision: 'rejected' })}>Reject</Button></span>) : null },
        ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} /></>)}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen} title="Record a receipt"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!student || !ob} loading={record.isPending} onClick={() => record.mutate(undefined)}>Record receipt</Button></>}>
        <div className="space-y-4">
          <Field label="Fee"><Select value={obligationId} onChange={(e) => setObligationId(e.target.value)}><option value="">Choose</option>{recordable.map((o) => <option key={o.id} value={o.id}>{o.organization_code}: {o.name} ({money(o.amount)})</option>)}</Select></Field>
          {ob && !ob.applicability_confirmed && <Notice tone="warning" title="Who must pay this fee is not confirmed yet">Check with your adviser before recording.</Notice>}
          <StudentPicker value={student} onChange={setStudent} />
          <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(verify)} onOpenChange={(o) => !o && setVerify(null)} title={verify?.decision === 'verified' ? 'Verify this receipt?' : 'Reject this receipt?'}
        description={verify ? `${verify.r.student_name}, ${verify.r.obligation_name}, ${money(verify.r.amount)}` : undefined} confirmLabel={verify?.decision === 'verified' ? 'Verify' : 'Reject'}
        danger={verify?.decision !== 'verified'} loading={decide.isPending} onConfirm={() => decide.mutate(undefined)}>
        <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
      </ConfirmDialog>
    </>
  );
}

interface BatchRow { id: string; batch_number: string; obligation_name: string; obligation_amount: number; organization_code: string; organization_id: string; status: string; declared_total: number; items_total: number; received_total: number | null; item_count: number; class_officer_name: string; section: string | null; program_code: string | null; created_at: string; return_reason: string | null }
interface BatchDetail extends BatchRow { items: { id: string; student_id: string; student_name: string; student_number: string; amount: number; status: string; rejection_reason: string | null }[] }

export function OrgRemittances() {
  const createOrgs = useOrgs('remittance.create');
  const obligations = useQuery({ queryKey: ['obligations'], queryFn: () => api.get<Obligation[]>('/receipts/obligations') });
  const q = usePaged<BatchRow>('remittances', '/remittances');
  const [open, setOpen] = useState(false);
  const [obligationId, setObligationId] = useState('');
  const [declared, setDeclared] = useState('');
  const creatable = obligations.data?.filter((o) => createOrgs.some((c) => c.scope_id === o.organization_id)) ?? [];
  const create = useAction(() => api.post<BatchRow>('/remittances', { obligationId, declaredTotal: Number(declared) }), { invalidate: ['remittances'], success: (b) => `Batch ${b.batch_number} created`, onSuccess: () => setOpen(false) });
  return (
    <>
      <PageHeader title="Remittances" description="Class officers hand over collected fees as a batch. The treasurer verifies each student; only verified students get a receipt."
        actions={createOrgs.length > 0 ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />New batch</Button> : undefined} />
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No remittance batches" /> : null}>
        {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => `${r.batch_number}: ${r.obligation_name}`} caption="Remittance batches" columns={[
          { header: 'Batch', cell: (r) => <Link className="font-semibold text-lagoon hover:underline" to={`/org/remittances/${r.id}`}>{r.batch_number}</Link>, hideOnMobile: true },
          { header: 'Fee', cell: (r) => `${r.organization_code}: ${r.obligation_name}` },
          { header: 'Class', cell: (r) => [r.program_code, r.section].filter(Boolean).join(' ') || '—' },
          { header: 'Students', cell: (r) => r.item_count },
          { header: 'Declared', cell: (r) => money(r.declared_total) },
          { header: 'Status', cell: (r) => <Status value={r.status} /> },
          { header: '', cell: (r) => <Button size="sm" variant="secondary" asChild><Link to={`/org/remittances/${r.id}`}>Open</Link></Button> },
        ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} /></>)}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen} title="New remittance batch" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!obligationId || declared === ''} loading={create.isPending} onClick={() => create.mutate(undefined)}>Create batch</Button></>}>
        <div className="space-y-4">
          <Field label="Fee"><Select value={obligationId} onChange={(e) => setObligationId(e.target.value)}><option value="">Choose</option>{creatable.map((o) => <option key={o.id} value={o.id}>{o.organization_code}: {o.name} ({money(o.amount)})</option>)}</Select></Field>
          <Field label="Total cash you are handing over (₱)" hint="This is checked against the money received. It never marks anyone as paid by itself."><Input type="number" min="0" step="0.01" value={declared} onChange={(e) => setDeclared(e.target.value)} /></Field>
        </div>
      </Dialog>
    </>
  );
}

export function RemittanceDetail() {
  const { id } = useParams();
  const access = useAccess();
  const q = useQuery({ queryKey: ['remittance', id], queryFn: () => api.get<BatchDetail>(`/remittances/${id}`) });
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [received, setReceived] = useState('');
  const [reason, setReason] = useState('');
  const [finish, setFinish] = useState<'completed' | 'returned' | null>(null);
  const inv = { invalidate: ['remittance', 'remittances', 'receipts', 'students'] };
  const add = useAction(() => api.put(`/remittances/${id}/items`, { studentId: student!.id, amount: q.data!.obligation_amount }), { ...inv, success: 'Student added', onSuccess: () => setStudent(null) });
  const remove = useAction((itemId: string) => api.del(`/remittances/items/${itemId}`), { ...inv, success: 'Student removed' });
  const submit = useAction(() => api.post(`/remittances/${id}/submit`), { ...inv, success: 'Batch submitted to the treasurer' });
  const begin = useAction(() => api.post(`/remittances/${id}/begin-review`, { receivedTotal: Number(received) }), { ...inv, success: 'Review started' });
  const verifyItem = useAction(({ itemId, decision }: { itemId: string; decision: string }) => api.post(`/remittances/items/${itemId}/verify`, { decision, reason: decision === 'rejected' ? 'Not confirmed by treasurer' : undefined }), { ...inv, success: 'Saved' });
  const done = useAction(() => api.post(`/remittances/${id}/finish-review`, { outcome: finish, reason: reason || undefined }), { ...inv, success: 'Review finished', onSuccess: () => setFinish(null) });
  return (
    <QueryView query={q}>
      {(b) => {
        const isOfficer = access.canIn('remittance.create', b.organization_id);
        const isTreasurer = access.canIn('remittance.review', b.organization_id);
        const verifiedTotal = b.items.filter((i) => i.status === 'verified').reduce((a, i) => a + Number(i.amount), 0);
        return (<>
          <PageHeader title={`Batch ${b.batch_number}`} description={`${b.organization_code}: ${b.obligation_name}${b.section || b.program_code ? `, class ${[b.program_code, b.section].filter(Boolean).join(' ')}` : ''}`} back={<Button variant="link" asChild className="mb-2"><Link to="/org/remittances"><ArrowLeft className="h-4 w-4" aria-hidden />Remittances</Link></Button>} />
          <Panel className="mb-6"><Facts items={[['Status', <Status key="s" value={b.status} />], ['Declared by class officer', money(b.declared_total)], ['Listed students', `${b.items.length} (${money(b.items_total)})`], ['Received by treasurer', b.received_total === null ? 'Not yet' : money(b.received_total)], ['Verified so far', money(verifiedTotal)], ['Returned because', b.return_reason]]} /></Panel>
          {b.declared_total !== b.items_total && <div className="mb-6"><Notice tone="warning" title="The listed students do not add up to the declared total">Declared {money(b.declared_total)}, listed {money(b.items_total)}.</Notice></div>}
          {isOfficer && ['draft', 'returned'].includes(b.status) && (
            <Panel className="mb-6 space-y-3"><StudentPicker value={student} onChange={setStudent} label="Add a student who paid" candidatesPath={`/remittances/${b.id}/candidates`} />
              <div className="flex flex-wrap gap-2"><Button disabled={!student} loading={add.isPending} onClick={() => add.mutate(undefined)}>Add for {money(b.obligation_amount)}</Button><Button variant="secondary" disabled={!b.items.length} loading={submit.isPending} onClick={() => submit.mutate(undefined)}>Submit to treasurer</Button></div>
            </Panel>
          )}
          {isTreasurer && b.status === 'submitted' && (
            <Panel className="mb-6 flex flex-wrap items-end gap-3"><Field label="Cash actually received (₱)"><Input type="number" min="0" step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
              <Button disabled={received === ''} loading={begin.isPending} onClick={() => begin.mutate(undefined)}>Start review</Button></Panel>
          )}
          {isTreasurer && b.status === 'under_review' && (
            <div className="mb-6 flex flex-wrap gap-2"><Button onClick={() => setFinish('completed')}>Finish review</Button><Button variant="secondary" onClick={() => setFinish('returned')}>Return to class officer</Button></div>
          )}
          <Section title="Students in this batch">
            {b.items.length === 0 ? <EmptyState title="No students added yet" /> : (
              <DataTable rows={b.items} rowKey={(i) => i.id} primary={(i) => i.student_name} caption="Batch items" columns={[
                { header: 'Student', cell: (i) => `${i.student_name} (${i.student_number})`, hideOnMobile: true },
                { header: 'Amount', cell: (i) => money(i.amount) },
                { header: 'Status', cell: (i) => <Status value={i.status} /> },
                { header: '', cell: (i) => isTreasurer && b.status === 'under_review' && i.status === 'pending' ? (
                  <span className="flex gap-1"><Button size="sm" onClick={() => verifyItem.mutate({ itemId: i.id, decision: 'verified' })}>Verify</Button><Button size="sm" variant="ghost" onClick={() => verifyItem.mutate({ itemId: i.id, decision: 'rejected' })}>Reject</Button></span>)
                  : isOfficer && ['draft', 'returned'].includes(b.status) ? <Button size="icon" variant="ghost" aria-label={`Remove ${i.student_name}`} onClick={() => remove.mutate(i.id)}><Trash2 className="h-4 w-4" /></Button> : null },
              ]} />
            )}
          </Section>
          <ConfirmDialog open={finish !== null} onOpenChange={(o) => !o && setFinish(null)} title={finish === 'completed' ? 'Finish this review?' : 'Return this batch?'}
            description={finish === 'completed' ? 'Verified students get a receipt. Students still pending stay unpaid.' : 'The class officer can correct the list and submit again.'}
            confirmLabel={finish === 'completed' ? 'Finish review' : 'Return batch'} loading={done.isPending} onConfirm={() => done.mutate(undefined)}>
            <Field label="Reason" optional={finish === 'completed'}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </ConfirmDialog>
        </>);
      }}
    </QueryView>
  );
}

interface ViolationRow { id: string; organization_id: string; organization_code: string; policy_name: string; description: string; status: string; student_name: string; student_number: string; quantity: number | null; violation_count: number | null; event_name: string | null; created_at: string }

export function OrgViolations() {
  const access = useAccess();
  const reportOrgs = useOrgs('violations.report');
  const [status, setStatus] = useState('reported');
  const q = usePaged<ViolationRow>('violations', '/violations', { scope: 'all', status: status || undefined });
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => api.get<Policy[]>('/violations/policies') });
  const events = useQuery({ queryKey: ['events'], queryFn: () => api.get<OrgEvent[]>('/catalog/events') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ policyId: '', description: '', eventId: '', quantity: '', occurredOn: '' });
  const [student, setStudent] = useState<StudentOption | null>(null);
  const reportable = policies.data?.filter((p) => reportOrgs.some((o) => o.scope_id === p.organization_id)) ?? [];
  const policy = reportable.find((p) => p.id === f.policyId);
  const isQuantity = policy?.active_version?.calculation_type === 'quantity_threshold';
  const report = useAction(() => api.post('/violations', { policyId: f.policyId, studentId: student!.id, description: f.description, eventId: f.eventId || undefined,
    quantity: f.quantity ? Number(f.quantity) : undefined, occurredOn: f.occurredOn || undefined }), { invalidate: ['violations'], success: 'Violation reported. It counts only after review.', onSuccess: () => { setOpen(false); setStudent(null); setF({ policyId: '', description: '', eventId: '', quantity: '', occurredOn: '' }); } });
  const [review, setReview] = useState<{ v: ViolationRow; decision: 'verified' | 'rejected' } | null>(null);
  const [notes, setNotes] = useState('');
  const decide = useAction(() => api.post(`/violations/${review!.v.id}/review`, { decision: review!.decision, notes: notes || undefined }), { invalidate: ['violations'], success: 'Review saved', onSuccess: () => { setReview(null); setNotes(''); } });
  return (
    <>
      <PageHeader title="Violations" description="Report violations, then review them. Only verified violations count toward penalties."
        actions={reportOrgs.length > 0 ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Report a violation</Button> : undefined} />
      <Tabs tabs={[
        { value: 'list', label: 'Violations', content: (<>
          <Field label="Status" className="mb-4 max-w-xs"><Select value={status} onChange={(e) => { setStatus(e.target.value); q.setPage(1); }}>
            <option value="reported">Waiting for review</option><option value="verified">Verified</option><option value="disputed">Disputed</option><option value="rejected">Rejected</option><option value="">All</option></Select></Field>
          <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="Nothing here" /> : null}>
            {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Violations" columns={[
              { header: 'Student', cell: (r) => `${r.student_name} (${r.student_number})`, hideOnMobile: true },
              { header: 'Policy', cell: (r) => `${r.organization_code}: ${r.policy_name}` },
              { header: 'Details', cell: (r) => <span>{r.description}{r.quantity !== null && <span className="block text-sm text-ink-faint">Quantity {r.quantity}{r.event_name ? `, ${r.event_name}` : ''}</span>}</span> },
              { header: 'Status', cell: (r) => <Status value={r.status} /> },
              { header: '', cell: (r) => access.canIn('violations.review', r.organization_id) && r.status === 'reported' ? (
                <span className="flex gap-1"><Button size="sm" onClick={() => setReview({ v: r, decision: 'verified' })}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setReview({ v: r, decision: 'rejected' })}>Reject</Button></span>) : null },
            ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} /></>)}
          </QueryView></>) },
        { value: 'disputes', label: 'Disputes', content: <Disputes /> },
      ]} />
      <Dialog open={open} onOpenChange={setOpen} title="Report a violation" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!student || !f.policyId || f.description.trim().length === 0} loading={report.isPending} onClick={() => report.mutate(undefined)}>Report violation</Button></>}>
        <div className="space-y-4">
          <Field label="Policy"><Select value={f.policyId} onChange={(e) => setF({ ...f, policyId: e.target.value })}><option value="">Choose</option>{reportable.map((p) => <option key={p.id} value={p.id}>{p.organization_code}: {p.name}</option>)}</Select></Field>
          {policy?.active_version && !policy.active_version.penalty_confirmed && <Notice tone="warning" title="The penalty for this policy is not confirmed yet">Violations can be recorded, but no penalty can be assessed until the organization confirms it.</Notice>}
          <StudentPicker value={student} onChange={setStudent} />
          {isQuantity && (<div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event"><Select value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}><option value="">Choose</option>{events.data?.filter((ev) => ev.organization_id === policy?.organization_id).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}, {date(ev.event_date)}</option>)}</Select></Field>
            <Field label={`Quantity${policy?.active_version?.quantity_unit ? ` (${policy.active_version.quantity_unit})` : ''}`} hint={policy?.active_version?.quantity_per_violation ? `Every ${policy.active_version.quantity_per_violation} counts as one violation, per event.` : undefined}>
              <Input type="number" min="1" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field></div>)}
          <Field label="What happened"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
          <Field label="Date" optional><Input type="date" value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} /></Field>
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(review)} onOpenChange={(o) => !o && setReview(null)} title={review?.decision === 'verified' ? 'Verify this violation?' : 'Reject this violation?'}
        description={review ? `${review.v.student_name}: ${review.v.description}` : undefined} confirmLabel={review?.decision === 'verified' ? 'Verify' : 'Reject'} danger={review?.decision === 'rejected'} loading={decide.isPending}
        onConfirm={() => (review?.decision === 'rejected' && !notes.trim() ? undefined : decide.mutate(undefined))}>
        <Field label="Notes" optional={review?.decision === 'verified'}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

function Disputes() {
  const access = useAccess();
  const q = usePaged<ViolationRow>('violations', '/violations', { scope: 'all', status: 'disputed' });
  const [target, setTarget] = useState<{ v: ViolationRow; decision: 'upheld' | 'denied' } | null>(null);
  const [notes, setNotes] = useState('');
  const detail = useQuery({ queryKey: ['violation', target?.v.id], queryFn: () => api.get<{ disputes: { id: string; status: string; reason: string }[] }>(`/violations/${target!.v.id}`), enabled: Boolean(target) });
  const open = detail.data?.disputes.find((d) => d.status === 'open');
  const decide = useAction(() => api.post(`/disputes/${open!.id}/decide`, { decision: target!.decision, notes: notes || undefined }), { invalidate: ['violations'], success: 'Dispute decided', onSuccess: () => { setTarget(null); setNotes(''); } });
  return (
    <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No open disputes" /> : null}>
      {(d) => (<>
        <DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Disputes" columns={[
          { header: 'Student', cell: (r) => r.student_name, hideOnMobile: true },
          { header: 'Violation', cell: (r) => r.description },
          { header: '', cell: (r) => access.canIn('disputes.decide', r.organization_id) ? <span className="flex gap-1"><Button size="sm" onClick={() => setTarget({ v: r, decision: 'upheld' })}>Accept dispute</Button><Button size="sm" variant="ghost" onClick={() => setTarget({ v: r, decision: 'denied' })}>Deny</Button></span> : null },
        ]} />
        <ConfirmDialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)} title={target?.decision === 'upheld' ? 'Accept the dispute?' : 'Deny the dispute?'}
          description={target?.decision === 'upheld' ? 'The violation will be voided.' : 'The violation stays as it was.'} confirmLabel={target?.decision === 'upheld' ? 'Accept dispute' : 'Deny dispute'} loading={decide.isPending} onConfirm={() => open && decide.mutate(undefined)}>
          {open && <p className="mb-3 rounded-lg bg-paper p-3 text-sm"><span className="font-semibold">Student’s reason:</span> {open.reason}</p>}
          <Field label="Notes" optional><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </ConfirmDialog>
      </>)}
    </QueryView>
  );
}

interface ServiceRow { id: string; student_name: string; student_number: string; organization_code: string; organization_id: string; service_date: string; hours_rendered: number; description: string; supervisor_name: string | null; status: string }

export function OrgPenalties() {
  const access = useAccess();
  const assessOrgs = useOrgs('penalties.assess');
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => api.get<Policy[]>('/violations/policies') });
  const penalties = usePaged<PenaltyRow & { organization_id: string }>('penalties', '/penalties', { scope: 'all' });
  const service = usePaged<ServiceRow>('community-service', '/community-service', { status: 'submitted' });
  const [open, setOpen] = useState(false);
  const [policyId, setPolicyId] = useState('');
  const [student, setStudent] = useState<StudentOption | null>(null);
  const assessable = policies.data?.filter((p) => assessOrgs.some((o) => o.scope_id === p.organization_id)) ?? [];
  const assess = useAction(() => api.post<PenaltyRow>('/penalties/assess', { policyId, studentId: student!.id }), { invalidate: ['penalties'], success: (p) => `Assessed: ${p.required_hours} h or ${money(p.required_amount)}`, onSuccess: () => { setOpen(false); setStudent(null); } });
  const [verify, setVerify] = useState<{ r: ServiceRow; decision: 'verified' | 'rejected' } | null>(null);
  const [notes, setNotes] = useState('');
  const decide = useAction(() => api.post(`/community-service/${verify!.r.id}/verify`, { decision: verify!.decision, notes: notes || undefined }), { invalidate: ['community-service', 'penalties'], success: 'Saved', onSuccess: () => { setVerify(null); setNotes(''); } });
  const pol = assessable.find((p) => p.id === policyId);
  return (
    <>
      <PageHeader title="Penalties" description="Assess penalties from verified violations and verify community service." actions={assessOrgs.length > 0 ? <Button onClick={() => setOpen(true)}>Assess a penalty</Button> : undefined} />
      <Tabs tabs={[
        { value: 'service', label: 'Community service to verify', content: (
          <QueryView query={service} empty={(d) => d.data.length === 0 ? <EmptyState title="No hours waiting for verification" /> : null}>
            {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Community service" columns={[
              { header: 'Student', cell: (r) => r.student_name, hideOnMobile: true },
              { header: 'Hours', cell: (r) => `${r.hours_rendered} h, ${date(r.service_date)}` },
              { header: 'What they did', cell: (r) => <span>{r.description}{r.supervisor_name && <span className="block text-sm text-ink-faint">Supervisor: {r.supervisor_name}</span>}</span> },
              { header: '', cell: (r) => access.canIn('penalties.verify_service', r.organization_id) ? <span className="flex gap-1"><Button size="sm" onClick={() => setVerify({ r, decision: 'verified' })}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setVerify({ r, decision: 'rejected' })}>Reject</Button></span> : null },
            ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={service.setPage} /></>)}
          </QueryView>) },
        { value: 'all', label: 'All penalties', content: (
          <QueryView query={penalties} empty={(d) => d.data.length === 0 ? <EmptyState title="No penalties" /> : null}>
            {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.student_name} caption="Penalties" columns={[
              { header: 'Student', cell: (r) => `${r.student_name} (${r.student_number})`, hideOnMobile: true },
              { header: 'Policy', cell: (r) => `${r.organization_code}: ${r.policy_name}` },
              { header: 'Required', cell: (r) => `${r.required_hours} h or ${money(r.required_amount)}` },
              { header: 'Chosen', cell: (r) => r.resolution ? (r.resolution.resolution_type === 'payment' ? 'Payment' : 'Community service') : 'Not yet' },
              { header: 'Status', cell: (r) => <Status value={r.status} /> },
            ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={penalties.setPage} /></>)}
          </QueryView>) },
      ]} />
      <Dialog open={open} onOpenChange={setOpen} title="Assess a penalty" description="Counts the student’s verified violations under the active policy version."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!student || !policyId} loading={assess.isPending} onClick={() => assess.mutate(undefined)}>Assess</Button></>}>
        <div className="space-y-4">
          <Field label="Policy"><Select value={policyId} onChange={(e) => setPolicyId(e.target.value)}><option value="">Choose</option>{assessable.map((p) => <option key={p.id} value={p.id}>{p.organization_code}: {p.name}</option>)}</Select></Field>
          {pol?.active_version && (pol.active_version.penalty_confirmed
            ? <p className="text-sm text-ink-soft">Each verified violation: {pol.active_version.hours_per_violation} h or {money(pol.active_version.amount_per_violation)}.</p>
            : <Notice tone="warning" title="Penalty not confirmed">This policy has no confirmed penalty yet, so it cannot be assessed.</Notice>)}
          <StudentPicker value={student} onChange={setStudent} />
        </div>
      </Dialog>
      <ConfirmDialog open={Boolean(verify)} onOpenChange={(o) => !o && setVerify(null)} title={verify?.decision === 'verified' ? 'Verify these hours?' : 'Reject these hours?'} confirmLabel={verify?.decision === 'verified' ? 'Verify' : 'Reject'}
        danger={verify?.decision === 'rejected'} loading={decide.isPending} onConfirm={() => (verify?.decision === 'rejected' && !notes.trim() ? undefined : decide.mutate(undefined))}>
        <Field label="Notes" optional={verify?.decision === 'verified'}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}

interface PaymentRow { id: string; reference: string; amount: number; provider: string; status: string; verification_status: string; organization_id: string; organization_code: string; student_name: string; student_number: string; provider_transaction_id: string | null; paid_at: string | null; created_at: string }

/** Payment verification and reconciliation, shared by organization treasurers, the cashier and administrators. */
export function PaymentsReview({ title = 'Payments' }: { title?: string }) {
  const access = useAccess();
  const [verification, setVerification] = useState('unverified');
  const [status, setStatus] = useState('paid');
  const q = usePaged<PaymentRow>('payments', '/payments', { scope: 'all', status: status || undefined, verification: verification || undefined });
  const [target, setTarget] = useState<{ p: PaymentRow; kind: 'verified' | 'rejected' | 'reconcile' } | null>(null);
  const [notes, setNotes] = useState('');
  const [rec, setRec] = useState({ source: 'settlement_report', providerReference: '', providerAmount: '', providerStatus: '' });
  const decide = useAction(() => api.post(`/payments/${target!.p.id}/verify`, { decision: target!.kind, notes: notes || undefined }), { invalidate: ['payments'], success: 'Decision saved', onSuccess: () => { setTarget(null); setNotes(''); } });
  const reconcile = useAction(() => api.post(`/payments/${target!.p.id}/reconcile`, { source: rec.source, providerReference: rec.providerReference || undefined, providerAmount: rec.providerAmount ? Number(rec.providerAmount) : undefined, providerStatus: rec.providerStatus || undefined, notes: notes || undefined }),
    { invalidate: ['payments'], success: 'Reconciliation recorded', onSuccess: () => { setTarget(null); setNotes(''); } });
  const sum = useMemo(() => q.data?.data.reduce((a, p) => a + Number(p.amount), 0) ?? 0, [q.data]);
  return (
    <>
      <PageHeader title={title} description="A payment counts only after the provider confirms it and the organization verifies it. Screenshots are never accepted as proof." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Payment status" className="max-w-[12rem]"><Select value={status} onChange={(e) => { setStatus(e.target.value); q.setPage(1); }}><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="">All</option></Select></Field>
        <Field label="Verification" className="max-w-[12rem]"><Select value={verification} onChange={(e) => { setVerification(e.target.value); q.setPage(1); }}><option value="unverified">Not verified</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="">All</option></Select></Field>
      </div>
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No payments match" /> : null}>
        {(d) => (<>
          <p className="mb-2 text-sm text-ink-soft">This page: {money(sum)}</p>
          <DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => `${r.student_name}, ${money(r.amount)}`} caption="Payments" columns={[
            { header: 'Student', cell: (r) => `${r.student_name} (${r.student_number})`, hideOnMobile: true },
            { header: 'Amount', cell: (r) => `${money(r.amount)} to ${r.organization_code}` },
            { header: 'Provider', cell: (r) => <span>{r.provider.toUpperCase()}<span className="block text-sm text-ink-faint">{r.provider_transaction_id ?? r.reference}</span></span> },
            { header: 'Paid', cell: (r) => (r.paid_at ? dateTime(r.paid_at) : <Status value={r.status} />) },
            { header: 'Verification', cell: (r) => <Status value={r.verification_status} /> },
            { header: '', cell: (r) => (<span className="flex flex-wrap gap-1">
              {access.canIn('payments.verify', r.organization_id) && r.status === 'paid' && r.verification_status === 'unverified' && <><Button size="sm" onClick={() => setTarget({ p: r, kind: 'verified' })}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setTarget({ p: r, kind: 'rejected' })}>Reject</Button></>}
              {access.canIn('payments.reconcile', r.organization_id) && <Button size="sm" variant="secondary" onClick={() => setTarget({ p: r, kind: 'reconcile' })}>Reconcile</Button>}
            </span>) },
          ]} />
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
      <ConfirmDialog open={Boolean(target && target.kind !== 'reconcile')} onOpenChange={(o) => !o && setTarget(null)} title={target?.kind === 'verified' ? 'Verify this payment?' : 'Reject this payment?'}
        description={target ? `${target.p.student_name}, ${money(target.p.amount)}, ${target.p.provider.toUpperCase()} ${target.p.provider_transaction_id ?? ''}. Check it against the provider’s merchant record first.` : undefined}
        confirmLabel={target?.kind === 'verified' ? 'Verify payment' : 'Reject payment'} danger={target?.kind === 'rejected'} loading={decide.isPending}
        onConfirm={() => (target?.kind === 'rejected' && !notes.trim() ? undefined : decide.mutate(undefined))}>
        <Field label="Notes" optional={target?.kind === 'verified'}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </ConfirmDialog>
      <Dialog open={target?.kind === 'reconcile'} onOpenChange={(o) => !o && setTarget(null)} title="Record a reconciliation" description="Compare this payment with the provider’s settlement report or merchant dashboard."
        footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button loading={reconcile.isPending} onClick={() => reconcile.mutate(undefined)}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Checked against"><Select value={rec.source} onChange={(e) => setRec({ ...rec, source: e.target.value })}><option value="settlement_report">Settlement report</option><option value="provider_api">Provider dashboard or API</option><option value="manual_review">Manual review</option></Select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Provider reference" optional><Input value={rec.providerReference} onChange={(e) => setRec({ ...rec, providerReference: e.target.value })} /></Field>
            <Field label="Amount there (₱)" optional><Input type="number" step="0.01" value={rec.providerAmount} onChange={(e) => setRec({ ...rec, providerAmount: e.target.value })} /></Field></div>
          <Field label="Status there" optional><Input value={rec.providerStatus} onChange={(e) => setRec({ ...rec, providerStatus: e.target.value })} /></Field>
          <Field label="Notes" optional><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Dialog>
    </>
  );
}

export function DepartmentHome() {
  const access = useAccess();
  const approvals = useQuery({ queryKey: ['approvals', 'count'], queryFn: () => api.page('/clearance/approvals/pending', { pageSize: 1 }), enabled: access.can('clearance.approve') });
  const scopes = access.assignments.filter((a) => a.scope_type === 'program' || a.scope_type === 'department');
  return (
    <>
      <PageHeader title="Department" description={scopes.map((s) => `${s.position_name}, ${s.scope_name}`).join('; ')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {access.can('clearance.approve') && <Link to="/approvals"><Stat label="Waiting for your signature" value={approvals.data?.meta.total ?? '…'} tone={approvals.data?.meta.total ? 'attention' : undefined} /></Link>}
      </div>
    </>
  );
}
