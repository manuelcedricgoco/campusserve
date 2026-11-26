import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';
import { useAction } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { PageHeader, Panel } from '@/components/ui/page';
import { QueryView } from '@/components/ui/states';
import { ClearanceView, type ClearanceDetail } from '@/features/student/Clearance';

interface Pending { id: string; clearance_id: string; step_name: string; is_actionable: boolean }

export function ClearanceDetailPage() {
  const { id } = useParams();
  const access = useAccess();
  const q = useQuery({ queryKey: ['clearance', id], queryFn: () => api.get<ClearanceDetail>(`/clearances/${id}`) });
  const pending = useQuery({ queryKey: ['approvals', 'for', id], queryFn: () => api.page<Pending>('/clearance/approvals/pending', { pageSize: 100 }), enabled: access.can('clearance.approve') });
  const mine = pending.data?.data.filter((p) => p.clearance_id === id) ?? [];
  const [act, setAct] = useState<{ approval: Pending; kind: 'approve' | 'return' } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const evaluate = useAction(() => api.post(`/clearances/${id}/evaluate`), { invalidate: ['clearance'], success: 'Requirements re-checked' });
  const decide = useAction(() => api.post(`/clearance/approvals/${act!.approval.id}/${act!.kind}`, { remarks: remarks || undefined }), {
    invalidate: ['clearance', 'approvals'], success: () => (act?.kind === 'approve' ? 'Signed' : 'Returned to the student'), onSuccess: () => { setAct(null); setRemarks(''); },
  });
  const cancel = useAction(() => api.post(`/clearances/${id}/cancel`, { reason: remarks }), { invalidate: ['clearance', 'clearances'], success: 'Clearance cancelled', onSuccess: () => { setCancelOpen(false); setRemarks(''); } });

  return (
    <QueryView query={q}>
      {(c) => (<>
        <PageHeader title={c.student_name} description={`${c.student_number}, ${c.program_code}. ${c.template_name}.`}
          actions={<>
            <Button variant="secondary" onClick={() => evaluate.mutate(undefined)} loading={evaluate.isPending}><RefreshCw className="h-4 w-4" aria-hidden />Re-check requirements</Button>
            {access.can('clearance.initiate') && c.status === 'in_progress' && <Button variant="ghost" className="text-danger" onClick={() => setCancelOpen(true)}>Cancel clearance</Button>}
          </>} />
        {mine.length > 0 && c.status === 'in_progress' && (
          <Panel className="mb-6 bg-mango-soft ring-mango/40">
            {mine.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3">
                <p><span className="font-bold">{m.step_name}</span> <span className="text-ink-soft">{m.is_actionable ? 'is waiting for your signature.' : 'is waiting for earlier steps.'}</span></p>
                <div className="flex gap-2">
                  <Button disabled={!m.is_actionable} onClick={() => setAct({ approval: m, kind: 'approve' })}>Sign</Button>
                  <Button variant="secondary" onClick={() => setAct({ approval: m, kind: 'return' })}>Return to student</Button>
                </div>
              </div>
            ))}
          </Panel>
        )}
        <ClearanceView c={c} />
        <ConfirmDialog open={Boolean(act)} onOpenChange={(o) => !o && setAct(null)} title={act?.kind === 'approve' ? `Sign ${act.approval.step_name}?` : 'Return this step?'}
          description={act?.kind === 'approve' ? 'CampusServe checks the requirements again before saving your signature.' : 'Tell the student what to fix. They will be notified.'}
          confirmLabel={act?.kind === 'approve' ? 'Sign' : 'Return to student'} loading={decide.isPending}
          onConfirm={() => (act?.kind === 'return' && remarks.trim().length === 0 ? undefined : decide.mutate(undefined))}>
          <Field label="Remarks" optional={act?.kind === 'approve'}><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} /></Field>
        </ConfirmDialog>
        <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this clearance?" confirmLabel="Cancel clearance" danger loading={cancel.isPending}
          onConfirm={() => remarks.trim() && cancel.mutate(undefined)}>
          <Field label="Reason"><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} /></Field>
        </ConfirmDialog>
      </>)}
    </QueryView>
  );
}
