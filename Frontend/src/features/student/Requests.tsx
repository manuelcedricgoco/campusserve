import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Download, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, usePaged } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select, Textarea } from '@/components/ui/input';
import { FileUpload } from '@/components/ui/extra';
import { Facts, PageHeader, Panel, Section } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { DataTable, Pagination } from '@/components/ui/table';
import { date, dateTime, humanize } from '@/lib/format';
import { useToast } from '@/components/ui/toast';

export interface RequestRow { id: string; request_number: string; service_name: string; office_name: string; status: string; purpose: string; submitted_at: string;
  student_name?: string; student_number?: string; ai_suggested_category?: string | null; ai_suggestion_confidence?: number | null; office_id: string }
export interface RequestDetail extends RequestRow { details: string | null; remarks: string | null; required_documents: string[];
  history: { id: string; from_status: string | null; to_status: string; remarks: string | null; changed_at: string }[];
  documents: { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string }[] }

const schema = z.object({ serviceId: z.string().min(1, 'Choose what you are requesting.'), purpose: z.string().trim().min(5, 'Say briefly what this is for.').max(300), details: z.string().max(2000).optional() });

function NewRequest({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const services = useQuery({ queryKey: ['services', 'request'], queryFn: () => api.get<{ id: string; name: string; office_name: string; required_documents: string[] }[]>('/catalog/services', { kind: 'request' }), enabled: open });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { serviceId: '', purpose: '', details: '' } });
  const svc = services.data?.find((s) => s.id === form.watch('serviceId'));
  const create = useAction((v: z.infer<typeof schema>) => api.post<RequestRow>('/requests', { serviceId: v.serviceId, purpose: v.purpose, details: v.details || undefined }), {
    invalidate: ['requests'], success: (r) => `Request ${r.request_number} sent`, onSuccess: (r) => { onOpenChange(false); form.reset(); navigate(`/student/requests/${r.id}`); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New request" description="You can attach documents after sending."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button form="new-request" type="submit" loading={create.isPending}>Send request</Button></>}>
      <form id="new-request" className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
        <Field label="What do you need?" error={form.formState.errors.serviceId?.message}>
          <Select {...form.register('serviceId')}><option value="">Choose</option>{services.data?.map((s) => <option key={s.id} value={s.id}>{s.office_name}: {s.name}</option>)}</Select>
        </Field>
        {svc && svc.required_documents.length > 0 && <p className="text-sm"><span className="font-semibold">You will need:</span> {svc.required_documents.join(', ')}</p>}
        <Field label="Purpose" hint="For example: scholarship application" error={form.formState.errors.purpose?.message}><Textarea rows={2} {...form.register('purpose')} /></Field>
        <Field label="Details" optional error={form.formState.errors.details?.message}><Textarea rows={3} {...form.register('details')} /></Field>
      </form>
    </Dialog>
  );
}

export function StudentRequests() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const q = usePaged<RequestRow>('requests', '/requests', { scope: 'mine' });
  return (
    <>
      <PageHeader title="Requests" description="Documents and services you asked an office for." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />New request</Button>} />
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No requests yet" body="Request a certificate, a copy of grades or another document." action={<Button size="sm" onClick={() => setOpen(true)}>New request</Button>} /> : null}>
        {(d) => (<>
          <DataTable rows={d.data} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/student/requests/${r.id}`)} primary={(r) => r.service_name} caption="Your requests"
            columns={[
              { header: 'Request', cell: (r) => <span className="font-semibold">{r.service_name}</span>, hideOnMobile: true },
              { header: 'Number', cell: (r) => r.request_number },
              { header: 'Office', cell: (r) => r.office_name, hideOnMobile: true },
              { header: 'Sent', cell: (r) => date(r.submitted_at) },
              { header: 'Status', cell: (r) => <Status value={r.status} /> },
            ]} />
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
      <NewRequest open={open} onOpenChange={setOpen} />
    </>
  );
}

export function RequestDocuments({ request, canUpload }: { request: RequestDetail; canUpload: boolean }) {
  const toast = useToast();
  const upload = useAction((f: File) => { const fd = new FormData(); fd.append('file', f); return api.upload(`/requests/${request.id}/documents`, fd); },
    { invalidate: ['request'], success: 'Document attached' });
  const open = async (docId: string) => {
    try { const r = await api.get<{ url: string }>(`/requests/${request.id}/documents/${docId}/url`); window.open(r.url, '_blank', 'noopener'); }
    catch (e) { toast.error('Could not open the file', e instanceof Error ? e.message : undefined); }
  };
  return (
    <Section title="Documents">
      {request.documents.length === 0 ? <p className="mb-3 text-ink-soft">No documents attached.</p> : (
        <ul className="mb-4 divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
          {request.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0"><span className="block truncate font-medium">{d.file_name}</span><span className="text-sm text-ink-faint">{Math.ceil(d.size_bytes / 1024)} KB, {dateTime(d.created_at)}</span></span>
              <Button variant="secondary" size="sm" onClick={() => open(d.id)}><Download className="h-4 w-4" aria-hidden />Open</Button>
            </li>
          ))}
        </ul>
      )}
      {canUpload && <FileUpload onFile={(f) => upload.mutate(f)} busy={upload.isPending} />}
    </Section>
  );
}

export function RequestTimeline({ history }: { history: RequestDetail['history'] }) {
  return (
    <ol className="space-y-3">
      {history.map((h) => (
        <li key={h.id} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-lagoon" aria-hidden />
          <span><span className="font-medium">{humanize(h.to_status)}</span><span className="block text-sm text-ink-faint">{dateTime(h.changed_at)}</span>
            {h.remarks && <span className="mt-0.5 block text-sm">{h.remarks}</span>}</span></li>
      ))}
    </ol>
  );
}

export function StudentRequestDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['request', id], queryFn: () => api.get<RequestDetail>(`/requests/${id}`) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancel = useAction(() => api.post(`/requests/${id}/status`, { status: 'cancelled' }), { invalidate: ['request', 'requests'], success: 'Request cancelled', onSuccess: () => setCancelOpen(false) });
  return (
    <>
      <QueryView query={q}>
        {(r) => (<>
          <PageHeader title={r.service_name} description={`${r.request_number}, ${r.office_name}`}
            back={<Button variant="link" asChild className="mb-2"><Link to="/student/requests"><ArrowLeft className="h-4 w-4" aria-hidden />Requests</Link></Button>}
            actions={r.status === 'submitted' ? <Button variant="ghost" className="text-danger" onClick={() => setCancelOpen(true)}>Cancel request</Button> : undefined} />
          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0">
              <Panel className="mb-8"><Facts items={[['Status', <Status key="s" value={r.status} />], ['Sent', dateTime(r.submitted_at)], ['Purpose', r.purpose], ['Details', r.details], ...(r.remarks ? [['Office remarks', r.remarks] as [string, string]] : [])]} /></Panel>
              <RequestDocuments request={r} canUpload={['submitted', 'in_review'].includes(r.status)} />
            </div>
            <Section title="Progress"><RequestTimeline history={r.history} /></Section>
          </div>
          <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this request?" description="The office will not process it." confirmLabel="Cancel request" danger loading={cancel.isPending} onConfirm={() => cancel.mutate(undefined)} />
        </>)}
      </QueryView>
    </>
  );
}
