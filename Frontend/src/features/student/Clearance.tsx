import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '@/lib/api';
import { ClearanceLine, type LineStep } from '@/components/brand/brand';
import { PageHeader, Panel, Section, Notice } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { date, dateTime, humanize } from '@/lib/format';

export interface ClearanceDetail { id: string; clearance_number: string; status: string; academic_year: string; template_name: string; initiated_at: string; completed_at: string | null;
  due_date: string | null; student_name: string; student_number: string; program_code: string; approvals: LineStep[];
  history: { id: string; event_type: string; actor_name: string | null; created_at: string; details: Record<string, unknown> }[] }

export function ClearanceView({ c }: { c: ClearanceDetail }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <Panel>
        <div className="mb-5 flex flex-wrap items-center gap-3"><Status value={c.status} /><span className="text-sm text-ink-soft">{c.clearance_number}, AY {c.academic_year}</span>
          {c.due_date && <span className="text-sm text-ink-soft">Due {date(c.due_date)}</span>}</div>
        {c.status === 'completed' && <div className="mb-5"><Notice title="Clearance complete">All signatures were collected on {dateTime(c.completed_at)}.</Notice></div>}
        <ClearanceLine steps={c.approvals} />
      </Panel>
      <Section title="Activity">
        <ol className="space-y-3 text-sm">
          {c.history.slice().reverse().slice(0, 12).map((h) => (
            <li key={h.id}><span className="font-medium">{humanize(h.event_type)}</span><span className="block text-ink-faint">{h.actor_name ? `${h.actor_name}, ` : ''}{dateTime(h.created_at)}</span></li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

export function StudentClearance() {
  const list = useQuery({ queryKey: ['clearances', 'mine', 'all'], queryFn: () => api.page<{ id: string; status: string }>('/clearances', { pageSize: 10 }) });
  const currentId = list.data?.data[0]?.id;
  const detail = useQuery({ queryKey: ['clearance', currentId], queryFn: () => api.get<ClearanceDetail>(`/clearances/${currentId}`), enabled: Boolean(currentId) });
  return (
    <>
      <PageHeader title="Clearance" description="Signatures are collected in order. Each station lists what it still needs from you." />
      <QueryView query={list} empty={(d: Page<{ id: string }>) => d.data.length === 0 ? <EmptyState title="Your clearance has not started" body="SAS starts clearances when the clearance period opens. You will get a notification." /> : null}>
        {() => <QueryView query={detail}>{(c) => <ClearanceView c={c} />}</QueryView>}
      </QueryView>
    </>
  );
}
