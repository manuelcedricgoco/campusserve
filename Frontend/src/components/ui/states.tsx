import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from './button';
import { cn } from '@/lib/cn';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 text-ink-soft"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /><span>{label}…</span></div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-mist', className)} aria-hidden />;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-mist-strong bg-white/60 p-6">
      <div className="text-lagoon">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <div>
        <p className="font-semibold">{title}</p>
        {body && <p className="mt-1 max-w-prose text-sm text-ink-soft">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const forbidden = error instanceof ApiError && (error.status === 403 || error.status === 404);
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-danger-soft p-5 text-danger">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5" aria-hidden />
        {forbidden ? 'Not available to you' : 'This could not be loaded'}</div>
      <p className="text-sm text-ink">{errorMessage(error)}</p>
      {onRetry && !forbidden && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Renders loading / error / empty / content for a query. */
export function QueryView<T>({ query, empty, children, rows }: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  empty?: (data: T) => ReactNode | null; children: (data: T) => ReactNode; rows?: number;
}) {
  if (query.isLoading) return <LoadingBlock rows={rows} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  const e = empty?.(query.data);
  return <>{e ?? children(query.data)}</>;
}
