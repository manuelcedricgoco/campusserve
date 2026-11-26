import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';

type Tone = 'neutral' | 'waiting' | 'good' | 'bad' | 'active';
const TONES: Record<Tone, string> = {
  neutral: 'bg-mist text-ink-soft',
  waiting: 'bg-mango-soft text-mango-ink',
  good: 'bg-leaf-soft text-leaf',
  bad: 'bg-danger-soft text-danger',
  active: 'bg-lagoon-50 text-lagoon-700',
};
const MAP: Record<string, Tone> = {
  verified: 'good', approved: 'good', completed: 'good', released: 'good', paid: 'good', resolved: 'good', issued: 'good', validated: 'good',
  satisfied: 'good', succeeded: 'good', ready: 'good', upheld: 'good', active: 'active',
  pending: 'waiting', pending_verification: 'waiting', submitted: 'waiting', reserved: 'waiting', reported: 'waiting', in_review: 'active',
  under_review: 'active', in_progress: 'active', checked_in: 'active', serving: 'active', ready_for_release: 'active', open: 'waiting',
  selected: 'waiting', unverified: 'waiting', draft: 'neutral', queued: 'waiting', running: 'active', created: 'neutral', not_issued: 'neutral',
  rejected: 'bad', returned: 'bad', failed: 'bad', cancelled: 'neutral', expired: 'neutral', no_show: 'bad', disputed: 'waiting',
  voided: 'neutral', void: 'neutral', not_satisfied: 'bad', denied: 'bad', dead: 'bad', retired: 'neutral', superseded: 'neutral', refunded: 'neutral',
};

/** A status chip. Colour is backed by text so meaning never relies on colour alone. */
export function Status({ value, label, className }: { value: string | null | undefined; label?: string; className?: string }) {
  const tone = MAP[value ?? ''] ?? 'neutral';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-semibold', TONES[tone], className)}>
      {label ?? humanize(value)}
    </span>
  );
}
