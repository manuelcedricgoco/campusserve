import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';
import { useAction, usePaged } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FileUpload, Stat } from '@/components/ui/extra';
import { Facts, Notice, PageHeader, Panel, Section } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { DataTable, Pagination } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { date, dateTime, humanize, money } from '@/lib/format';

const ROLES = ['student', 'office_staff', 'administrator', 'cashier', 'department_head'];

export function AdminHome() {
  const users = useQuery({ queryKey: ['admin-users', 'count'], queryFn: () => api.page('/admin/users', { pageSize: 1 }) });
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<{ key: string; is_confirmed: boolean }[]>('/admin/settings') });
  const unconfirmed = settings.data?.filter((s) => !s.is_confirmed) ?? [];
  return (
    <>
      <PageHeader title="Administration" description="Accounts, campus configuration and system health." />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to="/admin/users"><Stat label="Accounts" value={users.data?.meta.total ?? '…'} /></Link>
        <Link to="/admin/config"><Stat label="Settings to confirm" value={settings.data ? unconfirmed.length : '…'} tone={unconfirmed.length ? 'attention' : undefined} /></Link>
      </div>
      {unconfirmed.length > 0 && (
        <Notice tone="warning" title="Some rules are still unconfirmed">
          <p>These use placeholder defaults until the responsible office confirms them: {unconfirmed.map((s) => s.key).join(', ')}.</p>
        </Notice>
      )}
    </>
  );
}

interface UserRow { id: string; email: string; full_name: string | null; is_active: boolean; roles: string[]; student_number: string | null; program_code: string | null; section: string | null }
interface UserDetail { profile: UserRow; roles: { role: string }[]; assignments: { office: AssignmentRow[]; organization: AssignmentRow[]; academic: AssignmentRow[] } }
interface AssignmentRow { id: string; position_code: string; is_active: boolean; office_code?: string; organization_code?: string; section?: string | null; assigned_at: string }
interface Position { code: string; scope: string; name: string }
interface Org { id: string; code: string; name: string }

function UserDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const access = useAccess();
  const q = useQuery({ queryKey: ['admin-user', id], queryFn: () => api.get<UserDetail>(`/admin/users/${id}`) });
  const positions = useQuery({ queryKey: ['positions'], queryFn: () => api.get<Position[]>('/admin/positions') });
  const offices = useQuery({ queryKey: ['offices'], queryFn: () => api.get<Org[]>('/catalog/offices') });
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: () => api.get<Org[]>('/catalog/organizations') });
  const inv = { invalidate: ['admin-user', 'admin-users'] };
  const grant = useAction((role: string) => api.post(`/admin/users/${id}/roles`, { role }), { ...inv, success: 'Role granted' });
  const revoke = useAction((role: string) => api.del(`/admin/users/${id}/roles/${role}`), { ...inv, success: 'Role removed' });
  const active = useAction((isActive: boolean) => api.patch(`/admin/users/${id}`, { isActive }), { ...inv, success: (r: unknown) => ((r as { is_active: boolean }).is_active ? 'Account activated' : 'Account deactivated') });
  const [a, setA] = useState({ type: 'organization', scopeId: '', positionCode: '', section: '' });
  const assign = useAction(() => api.post('/admin/assignments', a.type === 'office' ? { type: 'office', userId: id, officeId: a.scopeId, positionCode: a.positionCode }
    : { type: 'organization', userId: id, organizationId: a.scopeId, positionCode: a.positionCode, section: a.section || undefined }), { ...inv, success: 'Position assigned', onSuccess: () => setA({ ...a, scopeId: '', positionCode: '' }) });
  const revokeAssignment = useAction(({ type, aid }: { type: string; aid: string }) => api.post(`/admin/assignments/${type}/${aid}/revoke`), { ...inv, success: 'Position revoked' });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={q.data?.profile.full_name ?? 'Account'} description={q.data?.profile.email} wide>
      <QueryView query={q}>
        {(u) => {
          const has = u.roles.map((r) => r.role);
          const self = u.profile.id === access.profile.id;
          const all = [...u.assignments.office.map((x) => ({ ...x, type: 'office', where: x.office_code })), ...u.assignments.organization.map((x) => ({ ...x, type: 'organization', where: `${x.organization_code}${x.section ? ` ${x.section}` : ''}` })), ...u.assignments.academic.map((x) => ({ ...x, type: 'academic', where: 'Academic' }))];
          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3"><Status value={u.profile.is_active ? 'active' : 'cancelled'} label={u.profile.is_active ? 'Active' : 'Deactivated'} />
                <Button variant="secondary" size="sm" disabled={self} onClick={() => active.mutate(!u.profile.is_active)} loading={active.isPending}>{u.profile.is_active ? 'Deactivate account' : 'Activate account'}</Button></div>
              <Section title="System roles">
                <div className="flex flex-wrap gap-2">{ROLES.map((r) => has.includes(r)
                  ? <Button key={r} size="sm" disabled={self && r === 'administrator'} onClick={() => revoke.mutate(r)}>{humanize(r)} ✓</Button>
                  : <Button key={r} size="sm" variant="secondary" onClick={() => grant.mutate(r)}>{humanize(r)}</Button>)}</div>
                <p className="mt-2 text-sm text-ink-faint">Selected roles are filled. Select one to add or remove it.</p>
              </Section>
              <Section title="Positions this academic year">
                {all.length === 0 ? <p className="text-ink-soft">No positions.</p> : (
                  <ul className="mb-4 divide-y divide-mist rounded-xl ring-1 ring-mist">{all.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 p-3"><span><span className="font-medium">{humanize(x.position_code)}</span>, {x.where}</span>
                      {x.is_active ? <Button size="sm" variant="ghost" onClick={() => revokeAssignment.mutate({ type: x.type, aid: x.id })}>Revoke</Button> : <Status value="retired" label="Revoked" />}</li>))}</ul>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Where"><Select value={a.type} onChange={(e) => setA({ ...a, type: e.target.value, scopeId: '', positionCode: '' })}><option value="organization">Organization</option><option value="office">Office</option></Select></Field>
                  <Field label={a.type === 'office' ? 'Office' : 'Organization'}><Select value={a.scopeId} onChange={(e) => setA({ ...a, scopeId: e.target.value })}><option value="">Choose</option>{(a.type === 'office' ? offices.data : orgs.data)?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                  <Field label="Position"><Select value={a.positionCode} onChange={(e) => setA({ ...a, positionCode: e.target.value })}><option value="">Choose</option>{positions.data?.filter((p) => p.scope === a.type).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
                  {a.type === 'organization' && <Field label="Section" optional hint="For class officers"><Input value={a.section} onChange={(e) => setA({ ...a, section: e.target.value })} /></Field>}
                </div>
                <Button className="mt-3" disabled={!a.scopeId || !a.positionCode} loading={assign.isPending} onClick={() => assign.mutate(undefined)}>Assign position</Button>
              </Section>
            </div>
          );
        }}
      </QueryView>
    </Dialog>
  );
}

export function AdminUsers() {
  const [qText, setQ] = useState('');
  const [role, setRole] = useState('');
  const q = usePaged<UserRow>('admin-users', '/admin/users', { q: qText || undefined, role: role || undefined });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Users and roles" description="Grant system roles and assign positions for this academic year. Every change is recorded in the audit log." />
      <Notice title="Creating accounts">New accounts are created in Supabase Authentication (dashboard or invitation). They appear here after the first sign-in or invitation.</Notice>
      <div className="my-4 flex flex-wrap gap-3">
        <Field label="Search" className="max-w-sm"><Input value={qText} placeholder="Name, email or student number" onChange={(e) => { setQ(e.target.value); q.setPage(1); }} /></Field>
        <Field label="Role" className="max-w-xs"><Select value={role} onChange={(e) => { setRole(e.target.value); q.setPage(1); }}><option value="">Any</option>{ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select></Field>
      </div>
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No accounts match" /> : null}>
        {(d) => (<><DataTable rows={d.data} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)} primary={(r) => r.full_name ?? r.email} caption="Accounts" columns={[
          { header: 'Name', cell: (r) => <span className="font-semibold">{r.full_name ?? '—'}<span className="block text-sm font-normal text-ink-faint">{r.email}</span></span>, hideOnMobile: true },
          { header: 'Student', cell: (r) => (r.student_number ? `${r.student_number}, ${r.program_code} ${r.section}` : '—') },
          { header: 'Roles', cell: (r) => r.roles.map(humanize).join(', ') || '—' },
          { header: 'Status', cell: (r) => <Status value={r.is_active ? 'active' : 'cancelled'} label={r.is_active ? 'Active' : 'Deactivated'} /> },
        ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} /></>)}
      </QueryView>
      {open && <UserDialog id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

interface Setting { key: string; value: unknown; description: string | null; is_confirmed: boolean; updated_at: string }
interface Service { id: string; code: string; name: string; office_id: string; office_name: string; service_kind: string; is_active: boolean; cancellation_cutoff_minutes: number; target_processing_days: number | null }
interface Schedule { id: string; service_name: string; day_of_week: number; start_time: string; end_time: string; slot_minutes: number; capacity_per_slot: number; effective_from: string; effective_until: string | null; is_active: boolean }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function SettingsTab() {
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<Setting[]>('/admin/settings') });
  const [edit, setEdit] = useState<Setting | null>(null);
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction((value: unknown) => api.put(`/admin/settings/${edit!.key}`, { value, isConfirmed: confirmed }), { invalidate: ['admin-settings'], success: 'Setting saved', onSuccess: () => setEdit(null) });
  return (
    <QueryView query={q}>
      {(rows) => (<>
        <DataTable rows={rows} rowKey={(r) => r.key} primary={(r) => r.key} caption="System settings" columns={[
          { header: 'Setting', cell: (r) => <span><span className="font-semibold">{r.key}</span><span className="block max-w-[50ch] text-sm text-ink-faint">{r.description}</span></span>, hideOnMobile: true },
          { header: 'Value', cell: (r) => <code className="text-sm">{JSON.stringify(r.value)}</code> },
          { header: 'Confirmed', cell: (r) => <Status value={r.is_confirmed ? 'verified' : 'pending'} label={r.is_confirmed ? 'Confirmed' : 'Not confirmed'} /> },
          { header: '', cell: (r) => <Button size="sm" variant="secondary" onClick={() => { setEdit(r); setText(JSON.stringify(r.value, null, 2)); setConfirmed(r.is_confirmed); setErr(null); }}>Edit</Button> },
        ]} />
        <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit?.key ?? ''} description={edit?.description}
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => { try { const v = JSON.parse(text); setErr(null); save.mutate(v); } catch { setErr('This is not valid JSON.'); } }}>Save setting</Button></>}>
          {edit?.key === 'payments.enabled_providers' && <div className="mb-4"><Notice tone="warning" title="Enable a provider only after real integration">Add "gcash", "maya" or "landbank" only after merchant onboarding, credentials, webhook validation and end-to-end tests are complete.</Notice></div>}
          <Field label="Value (JSON)" error={err ?? undefined}><Textarea rows={5} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmed by the responsible office</label>
        </Dialog>
      </>)}
    </QueryView>
  );
}

function ServicesTab() {
  const services = useQuery({ queryKey: ['services', 'all'], queryFn: () => api.get<Service[]>('/catalog/services') });
  const offices = useQuery({ queryKey: ['offices'], queryFn: () => api.get<Org[]>('/catalog/offices') });
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => api.get<Schedule[]>('/queue/schedules') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ officeId: '', code: '', name: '', serviceKind: 'queue', description: '' });
  const create = useAction(() => api.post('/admin/services', { ...f, description: f.description || undefined }), { invalidate: ['services'], success: 'Service added', onSuccess: () => setOpen(false) });
  const toggle = useAction(({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/admin/services/${id}`, { isActive }), { invalidate: ['services'], success: 'Service updated' });
  const [gen, setGen] = useState<Schedule | null>(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const generate = useAction(() => api.post<{ created: number }>(`/queue/schedules/${gen!.id}/generate-slots`, range), { invalidate: ['schedules', 'slots'], success: (r) => `${r.created} slots opened`, onSuccess: () => setGen(null) });
  return (
    <div className="space-y-8">
      <Section title="Services" actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Add a service</Button>}>
        <QueryView query={services}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.id} primary={(r) => r.name} caption="Services" columns={[
          { header: 'Service', cell: (r) => <span className="font-semibold">{r.name}<span className="block text-sm font-normal text-ink-faint">{r.code}</span></span>, hideOnMobile: true },
          { header: 'Office', cell: (r) => r.office_name },
          { header: 'Kind', cell: (r) => humanize(r.service_kind) },
          { header: '', cell: (r) => <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, isActive: false })}>Turn off</Button> },
        ]} />}</QueryView>
      </Section>
      <Section title="Queue schedules" description="Slots are opened from schedules; students can only reserve opened slots.">
        <QueryView query={schedules} empty={(d) => d.length === 0 ? <EmptyState title="No schedules" /> : null}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.id} primary={(r) => r.service_name} caption="Schedules" columns={[
          { header: 'Service', cell: (r) => r.service_name, hideOnMobile: true },
          { header: 'When', cell: (r) => `${DAYS[r.day_of_week]}, ${r.start_time.slice(0, 5)} to ${r.end_time.slice(0, 5)}` },
          { header: 'Slots', cell: (r) => `${r.slot_minutes} min, ${r.capacity_per_slot} each` },
          { header: 'Status', cell: (r) => <Status value={r.is_active ? 'active' : 'retired'} /> },
          { header: '', cell: (r) => <Button size="sm" variant="secondary" onClick={() => setGen(r)}>Open slots</Button> },
        ]} />}</QueryView>
      </Section>
      <Dialog open={open} onOpenChange={setOpen} title="Add a service" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} disabled={!f.officeId || !f.code || !f.name} onClick={() => create.mutate(undefined)}>Add service</Button></>}>
        <div className="space-y-4">
          <Field label="Office"><Select value={f.officeId} onChange={(e) => setF({ ...f, officeId: e.target.value })}><option value="">Choose</option>{offices.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Code" hint="Capital letters, digits and _"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Kind"><Select value={f.serviceKind} onChange={(e) => setF({ ...f, serviceKind: e.target.value })}><option value="queue">Queue slot</option><option value="request">Online request</option><option value="both">Both</option></Select></Field></div>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description" optional><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
      </Dialog>
      <Dialog open={Boolean(gen)} onOpenChange={(o) => !o && setGen(null)} title="Open queue slots" description={gen ? `${gen.service_name}, every ${DAYS[gen.day_of_week]}` : undefined}
        footer={<><Button variant="secondary" onClick={() => setGen(null)}>Cancel</Button><Button disabled={!range.from || !range.to} loading={generate.isPending} onClick={() => generate.mutate(undefined)}>Open slots</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="From"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field><Field label="To"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field></div>
      </Dialog>
    </div>
  );
}

export function AdminConfig() {
  return (<><PageHeader title="Services and settings" /><Tabs tabs={[{ value: 'services', label: 'Services and queues', content: <ServicesTab /> }, { value: 'settings', label: 'System settings', content: <SettingsTab /> }]} /></>);
}

interface Policy { id: string; code: string; name: string; organization_code: string; active_version: null | { version_number: number; calculation_type: string; hours_per_violation: number | null; amount_per_violation: number | null; quantity_per_violation: number | null; penalty_confirmed: boolean } }
interface Version { id: string; version_number: number; status: string; calculation_type: string; hours_per_violation: number | null; amount_per_violation: number | null; quantity_per_violation: number | null; allowed_resolutions: string[]; penalty_confirmed: boolean; notes: string | null; activated_at: string | null }
interface Obligation { id: string; code: string; name: string; amount: number; organization_code: string; applicability: string; applicability_confirmed: boolean }

function PolicyVersions({ policy, onClose }: { policy: Policy; onClose: () => void }) {
  const q = useQuery({ queryKey: ['policy-versions', policy.id], queryFn: () => api.get<Version[]>(`/admin/violation-policies/${policy.id}/versions`) });
  const [f, setF] = useState({ calculationType: policy.active_version?.calculation_type ?? 'per_violation', hours: '', amount: '', perViolation: '', service: true, payment: true, confirmed: false, notes: '' });
  const draft = useAction(() => api.post(`/admin/violation-policies/${policy.id}/versions`, {
    calculationType: f.calculationType, hoursPerViolation: f.hours ? Number(f.hours) : undefined, amountPerViolation: f.amount ? Number(f.amount) : undefined,
    quantityPerViolation: f.perViolation ? Number(f.perViolation) : undefined, allowedResolutions: [...(f.service ? ['community_service'] : []), ...(f.payment ? ['payment'] : [])],
    penaltyConfirmed: f.confirmed, notes: f.notes || undefined }), { invalidate: ['policy-versions', 'policies'], success: 'Draft version saved' });
  const activate = useAction((id: string) => api.post(`/admin/policy-versions/${id}/activate`), { invalidate: ['policy-versions', 'policies'], success: 'Version activated; the previous one is retired' });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${policy.organization_code}: ${policy.name}`} description="Active versions never change. Make a new draft and activate it; existing penalties keep the version they were assessed with." wide>
      <QueryView query={q}>{(rows) => <ul className="mb-6 divide-y divide-mist rounded-xl ring-1 ring-mist">{rows.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><span><span className="font-semibold">Version {v.version_number}</span> <Status value={v.status} />
          <span className="block text-sm text-ink-soft">{v.calculation_type === 'quantity_threshold' ? `Every ${v.quantity_per_violation ?? '?'} items = 1 violation. ` : ''}{v.penalty_confirmed ? `${v.hours_per_violation ?? 0} h or ${money(v.amount_per_violation)} per violation` : 'Penalty not confirmed'}</span></span>
          {v.status === 'draft' && <Button size="sm" onClick={() => activate.mutate(v.id)} loading={activate.isPending}>Activate</Button>}</li>))}</ul>}</QueryView>
      <h3 className="mb-3">New draft version</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Counting"><Select value={f.calculationType} onChange={(e) => setF({ ...f, calculationType: e.target.value })}><option value="per_violation">Each report is one violation</option><option value="quantity_threshold">Quantity per event</option></Select></Field>
        {f.calculationType === 'quantity_threshold' && <Field label="Items per violation"><Input type="number" min="1" value={f.perViolation} onChange={(e) => setF({ ...f, perViolation: e.target.value })} /></Field>}
        <Field label="Hours per violation" optional><Input type="number" min="0" step="0.25" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        <Field label="Amount per violation (₱)" optional><Input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.service} onChange={(e) => setF({ ...f, service: e.target.checked })} />Community service allowed</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.payment} onChange={(e) => setF({ ...f, payment: e.target.checked })} />Payment allowed</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} />Penalty confirmed by the organization</label>
      </div>
      <Field label="Notes" optional className="mt-3"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Button className="mt-4" loading={draft.isPending} onClick={() => draft.mutate(undefined)}>Save draft</Button>
    </Dialog>
  );
}

export function AdminPolicies() {
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => api.get<Policy[]>('/violations/policies') });
  const obligations = useQuery({ queryKey: ['obligations'], queryFn: () => api.get<Obligation[]>('/receipts/obligations') });
  const [open, setOpen] = useState<Policy | null>(null);
  const confirmOb = useAction((id: string) => api.patch(`/admin/receipt-obligations/${id}`, { applicabilityConfirmed: true }), { invalidate: ['obligations'], success: 'Marked as confirmed' });
  return (
    <>
      <PageHeader title="Policies and fees" />
      <Tabs tabs={[
        { value: 'p', label: 'Violation policies', content: <QueryView query={policies}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={setOpen} primary={(r) => `${r.organization_code}: ${r.name}`} caption="Policies" columns={[
          { header: 'Policy', cell: (r) => `${r.organization_code}: ${r.name}`, hideOnMobile: true },
          { header: 'Active version', cell: (r) => (r.active_version ? `Version ${r.active_version.version_number}` : 'None') },
          { header: 'Penalty', cell: (r) => r.active_version?.penalty_confirmed ? `${r.active_version.hours_per_violation} h or ${money(r.active_version.amount_per_violation)}` : <Status value="pending" label="Not confirmed" /> },
        ]} />}</QueryView> },
        { value: 'f', label: 'Organization fees', content: <QueryView query={obligations}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.id} primary={(r) => r.name} caption="Fees" columns={[
          { header: 'Fee', cell: (r) => `${r.organization_code}: ${r.name}`, hideOnMobile: true },
          { header: 'Amount', cell: (r) => money(r.amount) },
          { header: 'Who pays', cell: (r) => humanize(r.applicability) },
          { header: 'Confirmed', cell: (r) => (r.applicability_confirmed ? <Status value="verified" label="Confirmed" /> : <Button size="sm" variant="secondary" onClick={() => confirmOb.mutate(r.id)}>Mark confirmed</Button>) },
        ]} />}</QueryView> },
      ]} />
      {open && <PolicyVersions policy={open} onClose={() => setOpen(null)} />}
    </>
  );
}

interface Template { id: string; code: string; name: string; version: number; status: string; academic_year: string | null; steps: { id: string; step_key: string; name: string; sequence: number; approver_position_code: string; approver_scope: string; requirements: { id: string; name: string; requirement_type: string }[] }[] }

export function AdminClearance() {
  const q = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/clearance/templates') });
  const copy = useAction((id: string) => api.post(`/admin/clearance-templates/${id}/new-version`), { invalidate: ['templates'], success: 'Draft version created' });
  const activate = useAction((id: string) => api.post(`/admin/clearance-templates/${id}/activate`), { invalidate: ['templates'], success: 'Template activated' });
  const [step, setStep] = useState<Template['steps'][number] | null>(null);
  const [f, setF] = useState({ name: '', sequence: '' });
  const save = useAction(() => api.patch(`/admin/clearance-steps/${step!.id}`, { name: f.name, sequence: Number(f.sequence) }), { invalidate: ['templates'], success: 'Step saved', onSuccess: () => setStep(null) });
  return (
    <>
      <PageHeader title="Clearance templates" description="The signing order and requirements come from here. Active templates are locked; copy one to a draft to change it." />
      <QueryView query={q}>{(rows) => (
        <div className="space-y-6">{rows.map((t) => (
          <Panel key={t.id}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg">{t.name}, version {t.version}</h2><p className="text-sm text-ink-soft">{t.code}{t.academic_year ? `, AY ${t.academic_year}` : ''}</p></div>
              <div className="flex items-center gap-2"><Status value={t.status} />{t.status === 'active' && <Button size="sm" variant="secondary" onClick={() => copy.mutate(t.id)}>Copy to draft</Button>}{t.status === 'draft' && <Button size="sm" onClick={() => activate.mutate(t.id)}>Activate</Button>}</div></div>
            <ol className="space-y-3">{t.steps.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-mist pt-3"><span><span className="font-semibold">{s.sequence}. {s.name}</span><span className="block text-sm text-ink-soft">Signed by {humanize(s.approver_position_code)} ({humanize(s.approver_scope)})</span>
                {s.requirements.length > 0 && <span className="block text-sm">Requires: {s.requirements.map((r) => r.name).join(', ')}</span>}</span>
                {t.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => { setStep(s); setF({ name: s.name, sequence: String(s.sequence) }); }}>Edit</Button>}</li>))}</ol>
          </Panel>))}</div>)}</QueryView>
      <Dialog open={Boolean(step)} onOpenChange={(o) => !o && setStep(null)} title="Edit step" footer={<><Button variant="secondary" onClick={() => setStep(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Save step</Button></>}>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]"><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Order"><Input type="number" min="1" value={f.sequence} onChange={(e) => setF({ ...f, sequence: e.target.value })} /></Field></div>
      </Dialog>
    </>
  );
}

interface Source { id: string; name: string; source_type: string; visibility: string; required_permission: string | null; is_official: boolean; status: string; document_count: number }
interface Doc { id: string; title: string; version: number; origin: string; processing_status: string; processing_error: string | null; chunk_count: number; created_at: string }

function SourceDocs({ source, onClose }: { source: Source; onClose: () => void }) {
  const q = useQuery({ queryKey: ['ai-docs', source.id], queryFn: () => api.get<Doc[]>(`/ai/sources/${source.id}/documents`) });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const inv = { invalidate: ['ai-docs', 'ai-sources'] };
  const manual = useAction(() => api.post<{ status: string }>(`/ai/sources/${source.id}/documents/manual`, { title, content }), { ...inv, success: (r) => (r.status === 'ready' ? 'Document added and searchable' : 'Document saved, but processing failed'), onSuccess: () => { setTitle(''); setContent(''); } });
  const upload = useAction((f: File) => { const fd = new FormData(); fd.append('title', title || f.name); fd.append('file', f); return api.upload<{ status: string }>(`/ai/sources/${source.id}/documents`, fd); },
    { ...inv, success: (r) => (r.status === 'ready' ? 'File added and searchable' : 'File stored, but its text could not be extracted') });
  const official = useAction((isOfficial: boolean) => api.post(`/ai/sources/${source.id}/official`, { isOfficial }), { ...inv, success: 'Official status saved' });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={source.name} description={`${humanize(source.visibility)} source${source.required_permission ? `, needs ${source.required_permission}` : ''}`} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3"><Status value={source.is_official ? 'verified' : 'pending'} label={source.is_official ? 'Official' : 'Not official'} />
        <Button size="sm" variant="secondary" onClick={() => official.mutate(!source.is_official)}>{source.is_official ? 'Remove official status' : 'Mark as official'}</Button>
        <span className="text-sm text-ink-faint">Must be approved by someone other than the source’s creator.</span></div>
      <QueryView query={q} empty={(d) => d.length === 0 ? <p className="mb-4 text-ink-soft">No documents yet.</p> : null}>{(rows) => (
        <ul className="mb-6 divide-y divide-mist rounded-xl ring-1 ring-mist">{rows.map((d) => <li key={d.id} className="flex items-start justify-between gap-3 p-3"><span><span className="font-medium">{d.title}</span> <span className="text-sm text-ink-faint">v{d.version}, {d.chunk_count} passages</span>{d.processing_error && <span className="block text-sm text-danger">{d.processing_error}</span>}</span><Status value={d.processing_status} /></li>)}</ul>)}
      </QueryView>
      <h3 className="mb-3">Add a document</h3>
      <div className="space-y-4">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Text" hint="Paste the text, or upload a TXT, Markdown or HTML file. PDF text extraction is not available yet."><Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
        <div className="flex flex-wrap items-start gap-3"><Button disabled={!title || content.trim().length < 20} loading={manual.isPending} onClick={() => manual.mutate(undefined)}>Add text</Button>
          <FileUpload label="Upload a file" accept=".txt,.md,.html,text/plain,text/markdown,text/html,application/pdf" maxMb={20} onFile={(f) => upload.mutate(f)} busy={upload.isPending} /></div>
      </div>
    </Dialog>
  );
}

export function AdminAi() {
  const sources = useQuery({ queryKey: ['ai-sources'], queryFn: () => api.get<Source[]>('/ai/sources') });
  const usage = useQuery({ queryKey: ['ai-usage'], queryFn: () => api.get<{ day: string; channel: string; feature: string; provider: string; status: string; requests: number; avg_latency_ms: number }[]>('/ai/usage', { days: 14 }) });
  const [open, setOpen] = useState<Source | null>(null);
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ name: '', sourceType: 'faq', visibility: 'authenticated', requiredPermission: '' });
  const add = useAction(() => api.post('/ai/sources', { ...f, requiredPermission: f.visibility === 'permission' ? f.requiredPermission : undefined }), { invalidate: ['ai-sources'], success: 'Source added', onSuccess: () => setCreate(false) });
  return (
    <>
      <PageHeader title="Assistant knowledge" description="The assistant only answers from these sources, and only shows each source to people allowed to see it." actions={<Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" aria-hidden />Add a source</Button>} />
      <Tabs tabs={[
        { value: 's', label: 'Sources', content: <QueryView query={sources} empty={(d) => d.length === 0 ? <EmptyState title="No knowledge sources yet" body="Add the student handbook, office guides or FAQs so the assistant can answer from them." /> : null}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={setOpen} primary={(r) => r.name} caption="Sources" columns={[
          { header: 'Source', cell: (r) => r.name, hideOnMobile: true },
          { header: 'Type', cell: (r) => humanize(r.source_type) },
          { header: 'Who can see it', cell: (r) => (r.visibility === 'permission' ? `Holders of ${r.required_permission}` : humanize(r.visibility)) },
          { header: 'Documents', cell: (r) => r.document_count },
          { header: 'Official', cell: (r) => (r.is_official ? 'Yes' : 'No') },
        ]} />}</QueryView> },
        { value: 'u', label: 'Usage', content: <QueryView query={usage} empty={(d) => d.length === 0 ? <EmptyState title="No assistant use in the last 14 days" /> : null}>{(rows) => <DataTable rows={rows} rowKey={(r) => `${r.day}${r.channel}${r.feature}${r.status}${r.provider}`} primary={(r) => date(r.day)} caption="Usage" columns={[
          { header: 'Day', cell: (r) => date(r.day), hideOnMobile: true }, { header: 'Channel', cell: (r) => humanize(r.channel) }, { header: 'Feature', cell: (r) => humanize(r.feature) },
          { header: 'Provider', cell: (r) => r.provider }, { header: 'Result', cell: (r) => <Status value={r.status} /> }, { header: 'Requests', cell: (r) => r.requests }, { header: 'Avg ms', cell: (r) => r.avg_latency_ms },
        ]} />}</QueryView> },
      ]} />
      {open && <SourceDocs source={open} onClose={() => setOpen(null)} />}
      <Dialog open={create} onOpenChange={setCreate} title="Add a knowledge source" footer={<><Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button><Button disabled={!f.name} loading={add.isPending} onClick={() => add.mutate(undefined)}>Add source</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Type"><Select value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value })}>{['official_policy', 'office_guide', 'faq', 'announcement', 'general'].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
          <Field label="Who can see it"><Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="public">Everyone, including visitors</option><option value="authenticated">Signed-in users</option><option value="permission">People with a permission</option></Select></Field>
          {f.visibility === 'permission' && <Field label="Permission" hint="For example requests.manage"><Input value={f.requiredPermission} onChange={(e) => setF({ ...f, requiredPermission: e.target.value })} /></Field>}
        </div>
      </Dialog>
    </>
  );
}

interface Rule { id: string; code: string; name: string; trigger_code: string; is_enabled: boolean; version: number; actions: { action_type: string }[] }
interface Job { code: string; name: string; cron_expression: string; is_enabled: boolean; last_run_at: string | null; last_status: string | null; last_error: string | null }
interface Execution { id: string; rule_name: string | null; status: string; attempts: number; last_error: string | null; created_at: string }

export function AdminAutomation() {
  const access = useAccess();
  const rules = useQuery({ queryKey: ['rules'], queryFn: () => api.get<Rule[]>('/automation/rules') });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api.get<Job[]>('/automation/scheduled-jobs') });
  const executions = usePaged<Execution>('executions', '/automation/executions');
  const triggers = useQuery({ queryKey: ['triggers'], queryFn: () => api.get<{ code: string; description: string }[]>('/automation/triggers') });
  const manage = access.can('automation.manage');
  const toggle = useAction(({ id, enabled }: { id: string; enabled: boolean }) => api.post(`/automation/rules/${id}/enabled`, { enabled }), { invalidate: ['rules'], success: 'Rule updated' });
  const toggleJob = useAction(({ code, enabled }: { code: string; enabled: boolean }) => api.put(`/automation/scheduled-jobs/${code}`, { enabled }), { invalidate: ['jobs'], success: 'Job updated' });
  const run = useAction((code: string) => api.post(`/automation/scheduled-jobs/${code}/run`), { invalidate: ['jobs', 'executions'], success: 'Job ran' });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', triggerCode: '', action: 'send_notification', template: '' });
  const save = useAction(() => api.post('/automation/rules', { code: f.code, name: f.name, triggerCode: f.triggerCode, actions: [{ action_type: f.action, parameters: f.template ? { template_code: f.template } : {} }] }),
    { invalidate: ['rules'], success: 'Rule saved (turned off until you enable it)', onSuccess: () => setOpen(false) });
  return (
    <>
      <PageHeader title="Automation" description="Reminders and notifications that run on their own. Automation can never approve, verify, assess or take payments." actions={manage ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />New rule</Button> : undefined} />
      <Tabs tabs={[
        { value: 'r', label: 'Rules', content: <QueryView query={rules} empty={(d) => d.length === 0 ? <EmptyState title="No rules yet" /> : null}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.id} primary={(r) => r.name} caption="Rules" columns={[
          { header: 'Rule', cell: (r) => r.name, hideOnMobile: true }, { header: 'When', cell: (r) => r.trigger_code }, { header: 'Does', cell: (r) => r.actions.map((a) => humanize(a.action_type)).join(', ') },
          { header: 'Status', cell: (r) => <Status value={r.is_enabled ? 'active' : 'draft'} label={r.is_enabled ? 'On' : 'Off'} /> },
          { header: '', cell: (r) => manage ? <Button size="sm" variant="secondary" onClick={() => toggle.mutate({ id: r.id, enabled: !r.is_enabled })}>{r.is_enabled ? 'Turn off' : 'Turn on'}</Button> : null },
        ]} />}</QueryView> },
        { value: 'j', label: 'Scheduled jobs', content: <QueryView query={jobs}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.code} primary={(r) => r.name} caption="Scheduled jobs" columns={[
          { header: 'Job', cell: (r) => r.name, hideOnMobile: true }, { header: 'Schedule', cell: (r) => <code className="text-sm">{r.cron_expression}</code> },
          { header: 'Last run', cell: (r) => (r.last_run_at ? <span>{dateTime(r.last_run_at)} <Status value={r.last_status} /></span> : 'Never') },
          { header: 'Status', cell: (r) => <Status value={r.is_enabled ? 'active' : 'draft'} label={r.is_enabled ? 'On' : 'Off'} /> },
          { header: '', cell: (r) => manage ? <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => toggleJob.mutate({ code: r.code, enabled: !r.is_enabled })}>{r.is_enabled ? 'Turn off' : 'Turn on'}</Button><Button size="sm" variant="ghost" aria-label={`Run ${r.name} now`} onClick={() => run.mutate(r.code)}><Play className="h-4 w-4" /></Button></span> : null },
        ]} />}</QueryView> },
        { value: 'x', label: 'Run history', content: <QueryView query={executions} empty={(d) => d.data.length === 0 ? <EmptyState title="Nothing has run yet" /> : null}>{(d) => (<><DataTable rows={d.data} rowKey={(r) => String(r.id)} primary={(r) => r.rule_name ?? 'Run'} caption="Runs" columns={[
          { header: 'Rule', cell: (r) => r.rule_name ?? '—', hideOnMobile: true }, { header: 'When', cell: (r) => dateTime(r.created_at) }, { header: 'Status', cell: (r) => <Status value={r.status} /> },
          { header: 'Attempts', cell: (r) => r.attempts }, { header: 'Error', cell: (r) => r.last_error ?? '—' },
        ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={executions.setPage} /></>)}</QueryView> },
      ]} />
      <Dialog open={open} onOpenChange={setOpen} title="New automation rule" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!f.code || !f.name || !f.triggerCode} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save rule</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Code" hint="lowercase_with_underscores"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} /></Field><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
          <Field label="When this happens"><Select value={f.triggerCode} onChange={(e) => setF({ ...f, triggerCode: e.target.value })}><option value="">Choose</option>{triggers.data?.map((t) => <option key={t.code} value={t.code}>{t.description}</option>)}</Select></Field>
          <Field label="Do this"><Select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>{['send_notification', 'send_reminder', 'escalate_to_position', 'reevaluate_clearance', 'record_note', 'generate_report'].map((a) => <option key={a} value={a}>{humanize(a)}</option>)}</Select></Field>
          <Field label="Message template code" optional><Input value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} /></Field>
          <p className="text-sm text-ink-faint">Email sending is not connected yet, so email actions are not offered.</p>
        </div>
      </Dialog>
    </>
  );
}

interface Audit { id: number; occurred_at: string; actor_name: string | null; action: string; entity_type: string; entity_id: string }

export function AdminAudit() {
  const [entity, setEntity] = useState('');
  const q = usePaged<Audit>('audit', '/admin/audit-logs', { entityType: entity || undefined }, 50);
  return (
    <>
      <PageHeader title="Audit log" description="Every change to roles, receipts, clearances, violations, penalties and payments, with who made it. Entries cannot be edited." />
      <Field label="Record type" className="mb-4 max-w-xs"><Input value={entity} placeholder="e.g. receipt_records" onChange={(e) => { setEntity(e.target.value.trim()); q.setPage(1); }} /></Field>
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No entries" /> : null}>
        {(d) => (<><DataTable rows={d.data} rowKey={(r) => String(r.id)} primary={(r) => `${humanize(r.action)} ${r.entity_type}`} caption="Audit entries" columns={[
          { header: 'When', cell: (r) => dateTime(r.occurred_at) }, { header: 'Who', cell: (r) => r.actor_name ?? 'System' },
          { header: 'Action', cell: (r) => humanize(r.action), hideOnMobile: true }, { header: 'Record', cell: (r) => <span>{r.entity_type}<span className="block truncate text-xs text-ink-faint">{r.entity_id}</span></span> },
        ]} /><Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} /></>)}
      </QueryView>
    </>
  );
}

export function AdminGis() {
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get<{ id: string; name: string; verification_status: string; reference_point: unknown; boundary: unknown }[]>('/gis/campuses') });
  const campus = campuses.data?.[0];
  const [geo, setGeo] = useState('');
  const [target, setTarget] = useState('locations');
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const imp = useAction((dryRun: boolean) => api.post('/gis/import', { campusId: campus!.id, target, featureCollection: JSON.parse(geo), dryRun }), { invalidate: ['gis-map'], success: 'Import checked', onSuccess: (r) => setResult(r) });
  const [loc, setLoc] = useState({ name: '', lat: '', lng: '', category: 'office' });
  const save = useAction(() => api.post('/gis/locations', { campusId: campus!.id, name: loc.name, categoryCode: loc.category, layerCode: 'locations', point: loc.lat && loc.lng ? { type: 'Point', coordinates: [Number(loc.lng), Number(loc.lat)] } : undefined }),
    { invalidate: ['gis-map'], success: 'Location saved as unverified', onSuccess: () => setLoc({ name: '', lat: '', lng: '', category: 'office' }) });
  return (
    <>
      <PageHeader title="Campus map data" description="Enter only surveyed or official coordinates. New entries stay unverified until a second administrator verifies them." />
      <Notice tone="warning" title="No campus coordinates have been recorded yet">The map stays empty until real survey data is entered or imported. Never type approximate or guessed positions.</Notice>
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <Section title="Add a location">
          <Panel className="space-y-4">
            <Field label="Name"><Input value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Latitude" optional><Input inputMode="decimal" value={loc.lat} onChange={(e) => setLoc({ ...loc, lat: e.target.value })} /></Field><Field label="Longitude" optional><Input inputMode="decimal" value={loc.lng} onChange={(e) => setLoc({ ...loc, lng: e.target.value })} /></Field></div>
            <p className="text-sm text-ink-faint">Leave the coordinates empty to list a place without putting it on the map.</p>
            <Button disabled={!campus || !loc.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save location</Button>
          </Panel>
        </Section>
        <Section title="Import GeoJSON">
          <Panel className="space-y-4">
            <Field label="Import into"><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="locations">Locations (points)</option><option value="paths">Walkways (lines)</option></Select></Field>
            <Field label="FeatureCollection" error={err ?? undefined}><Textarea rows={6} className="font-mono text-sm" value={geo} onChange={(e) => setGeo(e.target.value)} /></Field>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!campus || !geo} loading={imp.isPending && imp.variables === true} onClick={() => { try { JSON.parse(geo); setErr(null); imp.mutate(true); } catch { setErr('This is not valid JSON.'); } }}>Check only</Button>
              <Button disabled={!campus || !geo} loading={imp.isPending && imp.variables === false} onClick={() => { try { JSON.parse(geo); setErr(null); imp.mutate(false); } catch { setErr('This is not valid JSON.'); } }}>Import</Button>
            </div>
            {result !== null && <pre className="max-h-48 overflow-auto rounded-lg bg-paper p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>}
          </Panel>
        </Section>
      </div>
      {campus && <div className="mt-6"><Facts items={[['Campus', campus.name], ['Boundary', campus.boundary ? 'Recorded' : 'Not recorded'], ['Status', <Status key="s" value={campus.verification_status} />]]} /></div>}
    </>
  );
}
