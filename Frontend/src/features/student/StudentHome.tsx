import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAccess } from '@/lib/access';
import { QueueTicket, type TicketData } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Section, Panel } from '@/components/ui/page';
import { EmptyState, LoadingBlock } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { date, money } from '@/lib/format';

interface ClearanceRow { id: string; clearance_number: string; status: string; total_steps: number; approved_steps: number }
interface PenaltyRow { id: string; status: string; organization_code: string; policy_name: string; required_hours: number; required_amount: number }
interface RequestRow { id: string; request_number: string; service_name: string; status: string; submitted_at: string }

export function StudentHome() {
  const access = useAccess();
  const tickets = useQuery({ queryKey: ['tickets', 'mine'], queryFn: () => api.get<(TicketData & { id: string })[]>('/queue/tickets/mine') });
  const clearances = useQuery({ queryKey: ['clearances', 'mine'], queryFn: () => api.page<ClearanceRow>('/clearances', { pageSize: 1 }) });
  const penalties = useQuery({ queryKey: ['penalties', 'mine', 'open'], queryFn: () => api.page<PenaltyRow>('/penalties', { status: 'open', pageSize: 5 }) });
  const requests = useQuery({ queryKey: ['requests', 'mine', 'recent'], queryFn: () => api.page<RequestRow>('/requests', { pageSize: 3 }) });
  const first = access.profile.full_name?.split(' ')[0];
  const c = clearances.data?.data[0];

  return (
    <>
      <div className="mb-8">
        <h1>{first ? `Hello, ${first}` : 'Hello'}</h1>
        {access.student && <p className="mt-1 text-ink-soft">{access.student.program_code} {access.student.section}, student no. {access.student.student_number}</p>}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Section title="Your queue" actions={<Button variant="secondary" size="sm" asChild><Link to="/student/queue">Book a slot</Link></Button>}>
            {tickets.isLoading ? <LoadingBlock rows={1} /> : tickets.data && tickets.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">{tickets.data.slice(0, 2).map((t) => <Link key={t.id} to={`/student/queue/${t.id}`} className="block"><QueueTicket t={t} compact /></Link>)}</div>
            ) : <EmptyState title="No reservations" body="Reserve a time at an office so you do not have to wait in line." action={<Button asChild size="sm"><Link to="/student/queue">Reserve a slot</Link></Button>} />}
          </Section>

          <Section title="Recent requests" actions={<Button variant="link" asChild><Link to="/student/requests">All requests</Link></Button>}>
            {requests.data?.data.length ? (
              <ul className="divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
                {requests.data.data.map((r) => (
                  <li key={r.id}><Link to={`/student/requests/${r.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-lagoon-50/60">
                    <span><span className="font-semibold">{r.service_name}</span><span className="block text-sm text-ink-faint">{r.request_number}, {date(r.submitted_at)}</span></span>
                    <Status value={r.status} /></Link></li>
                ))}
              </ul>
            ) : requests.isLoading ? <LoadingBlock rows={2} /> : <p className="text-ink-soft">You have not sent any requests.</p>}
          </Section>
        </div>

        <div className="space-y-6">
          <Panel>
            <h2 className="text-lg">Clearance</h2>
            {clearances.isLoading ? <LoadingBlock rows={1} /> : c ? (
              <>
                <p className="mt-2 flex items-center gap-2"><Status value={c.status} /> <span className="text-sm text-ink-soft">{c.clearance_number}</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuemin={0} aria-valuemax={c.total_steps} aria-valuenow={c.approved_steps} aria-label="Signatures collected">
                  <div className="h-full bg-lagoon" style={{ width: `${c.total_steps ? (100 * c.approved_steps) / c.total_steps : 0}%` }} />
                </div>
                <p className="mt-2 text-sm text-ink-soft">{c.approved_steps} of {c.total_steps} signatures</p>
                <Button variant="link" asChild className="mt-2"><Link to="/student/clearance">See what is needed</Link></Button>
              </>
            ) : <p className="mt-2 text-ink-soft">Your clearance has not been started. SAS starts it when the clearance period opens.</p>}
          </Panel>
          <Panel className={penalties.data?.meta.total ? 'bg-mango-soft ring-mango/40' : undefined}>
            <h2 className="text-lg">Penalties</h2>
            {penalties.data?.meta.total ? (
              <>
                <ul className="mt-2 space-y-2">
                  {penalties.data.data.map((p) => (
                    <li key={p.id}><Link to={`/student/penalties/${p.id}`} className="block rounded-lg bg-white p-3 hover:ring-1 hover:ring-mango">
                      <span className="font-semibold">{p.organization_code}: {p.policy_name}</span>
                      <span className="block text-sm text-ink-soft">{p.required_hours} h of service or {money(p.required_amount)}</span></Link></li>
                  ))}
                </ul>
              </>
            ) : <p className="mt-2 text-ink-soft">{penalties.isLoading ? 'Checking…' : 'Nothing to settle.'}</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
