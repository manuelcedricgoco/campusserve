import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, children, className, optional }: {
  label: string; hint?: ReactNode; error?: string; children: ReactElement; className?: string; optional?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id, 'aria-invalid': error ? true : undefined, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}{optional && <span className="ml-1 font-normal text-ink-faint">(optional)</span>}
      </label>
      {control}
      {hint && !error && <p id={hintId} className="text-sm text-ink-faint">{hint}</p>}
      {error && <p id={errId} className="text-sm font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}
