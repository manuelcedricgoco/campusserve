import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink/40 data-[state=open]:animate-[fade_150ms_ease-out]" />
        <D.Content className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lift sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-lg font-bold" style={{ fontVariationSettings: "'wdth' 125" }}>{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-soft">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-5 w-5" /></Button></D.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, loading, danger, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; confirmLabel: string;
  onConfirm: () => void; loading?: boolean; danger?: boolean; children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}>
      {children}
    </Dialog>
  );
}
