import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1>{title}</h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, actions, children, className }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-8 min-w-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>{title && <h2>{title}</h2>}{description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}</div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl bg-white p-4 ring-1 ring-mist sm:p-5', className)}>{children}</div>;
}

/** Key-value facts. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}><dt className="text-sm text-ink-faint">{k}</dt><dd className="font-medium">{v ?? '—'}</dd></div>
      ))}
    </dl>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'sandbox'; title: string; children?: ReactNode }) {
  return (
    <div role="note" className={cn('rounded-xl p-4 text-sm',
      tone === 'info' && 'bg-lagoon-50 text-lagoon-800',
      tone === 'warning' && 'bg-mango-soft text-mango-ink',
      tone === 'sandbox' && 'border-2 border-dashed border-mango bg-mango-soft text-mango-ink')}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
