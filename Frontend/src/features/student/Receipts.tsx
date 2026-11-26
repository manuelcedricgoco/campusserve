import { usePaged } from '@/lib/query';
import { PageHeader } from '@/components/ui/page';
import { EmptyState, QueryView } from '@/components/ui/states';
import { Status } from '@/components/ui/status';
import { DataTable, Pagination } from '@/components/ui/table';
import { useAccess } from '@/lib/access';
import { date, money } from '@/lib/format';

export interface ReceiptRow { id: string; receipt_number: string; obligation_name: string; organization_code: string; amount: number; source: string; status: string; recorded_at: string;
  student_name: string; student_number: string; verified_at: string | null }

export function StudentReceipts() {
  const access = useAccess();
  const q = usePaged<ReceiptRow>('receipts', '/receipts', { studentId: access.profile.id });
  return (
    <>
      <PageHeader title="Receipts" description="Fees recorded by your organizations. A receipt counts for clearance once the organization verifies it." />
      <QueryView query={q} empty={(d) => d.data.length === 0 ? <EmptyState title="No receipts recorded yet" body="When you pay an organization fee, the treasurer records it here." /> : null}>
        {(d) => (<>
          <DataTable rows={d.data} rowKey={(r) => r.id} primary={(r) => r.obligation_name} caption="Your receipts" columns={[
            { header: 'Fee', cell: (r) => <span className="font-semibold">{r.obligation_name}</span>, hideOnMobile: true },
            { header: 'Organization', cell: (r) => r.organization_code },
            { header: 'Amount', cell: (r) => money(r.amount) },
            { header: 'Receipt no.', cell: (r) => r.receipt_number, hideOnMobile: true },
            { header: 'Recorded', cell: (r) => date(r.recorded_at) },
            { header: 'Status', cell: (r) => <Status value={r.status} /> },
          ]} />
          <Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={q.setPage} />
        </>)}
      </QueryView>
    </>
  );
}
