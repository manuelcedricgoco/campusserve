import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/cn';

export interface Column<T> { header: string; cell: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean }

/**
 * A table on wide screens and stacked rows on phones. `primary` renders the mobile row title.
 */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, primary, caption }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; primary?: (r: T) => ReactNode; caption?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-mist">
      <table className="hidden w-full text-left text-[0.93rem] md:table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-mist text-sm text-ink-faint">
          <tr>{columns.map((c) => <th key={c.header} scope="col" className={cn('px-4 py-3 font-semibold', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('border-b border-mist/70 last:border-0', onRowClick && 'cursor-pointer hover:bg-lagoon-50/60')}>
              {columns.map((c) => <td key={c.header} className={cn('px-4 py-3 align-middle', c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-mist md:hidden">
        {rows.map((r) => {
          const body = (
            <>
              {primary && <div className="font-semibold">{primary(r)}</div>}
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {columns.filter((c) => !c.hideOnMobile).map((c) => (
                  <div key={c.header} className="min-w-0"><dt className="text-ink-faint">{c.header}</dt><dd className="truncate">{c.cell(r)}</dd></div>
                ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(r)}>
              {onRowClick ? <button type="button" onClick={() => onRowClick(r)} className="block w-full p-4 text-left hover:bg-lagoon-50/60">{body}</button>
                : <div className="p-4">{body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <p className="mt-3 text-sm text-ink-faint">{total} {total === 1 ? 'item' : 'items'}</p>;
  return (
    <nav className="mt-3 flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <span className="text-ink-faint">Page {page} of {totalPages} ({total} items)</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
        <Button variant="secondary" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
      </div>
    </nav>
  );
}
