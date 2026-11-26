import * as T from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export function Tabs({ tabs, value, onValueChange }: { tabs: { value: string; label: string; content: ReactNode }[]; value?: string; onValueChange?: (v: string) => void }) {
  return (
    <T.Root defaultValue={tabs[0]?.value} value={value} onValueChange={onValueChange}>
      <T.List className="mb-4 flex gap-1 overflow-x-auto border-b border-mist" aria-label="Sections">
        {tabs.map((t) => (
          <T.Trigger key={t.value} value={t.value}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-[0.95rem] font-semibold text-ink-soft data-[state=active]:border-lagoon data-[state=active]:text-lagoon hover:text-ink">
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {tabs.map((t) => <T.Content key={t.value} value={t.value} className="focus-visible:outline-none">{t.content}</T.Content>)}
    </T.Root>
  );
}
