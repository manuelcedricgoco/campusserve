import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { date, dateTime, humanize, time } from '@/lib/format';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0E5E6F" />
      <path d="M8 11h16v3a2 2 0 0 0 0 4v3H8v-3a2 2 0 0 0 0-4z" fill="#F2A900" />
      <path d="M13 16h6" stroke="#0E5E6F" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, light, compact }: { className?: string; light?: boolean; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('display text-lg font-extrabold', light ? 'text-white' : 'text-ink', compact && 'hidden min-[380px]:inline')}>CampusServe</span>
    </span>
  );
}

const SPLASH_KEY = 'campusserve.splashShown';

/** Shown once per browser session: the ticket mark tears in, then the app appears. */
export function Splash() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem(SPLASH_KEY); } catch { return false; }
  });
  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch { /* ignore */ }
    const t = setTimeout(() => setShow(false), reduce ? 250 : 1100);
    return () => clearTimeout(t);
  }, [show, reduce]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-lagoon" exit={{ opacity: 0 }} transition={{ duration: 0.3 }} aria-hidden>
          <div className="flex flex-col items-center gap-4">
            <motion.div initial={reduce ? false : { y: 16, rotate: -8, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
              <svg viewBox="0 0 64 40" className="h-16 w-24"><path d="M0 0h64v14a6 6 0 0 0 0 12v14H0V26a6 6 0 0 0 0-12z" fill="#F2A900" /><path d="M22 20h20" stroke="#0E5E6F" strokeWidth="4" strokeLinecap="round" /></svg>
            </motion.div>
            <motion.p className="display text-2xl font-extrabold text-white" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>CampusServe</motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface TicketData {
  queue_number: number; status: string; service_name: string; office_name: string; slot_date: string; start_time: string; end_time: string;
}

/** The queue ticket: the one bold object in the product. */
export function QueueTicket({ t, compact }: { t: TicketData; compact?: boolean }) {
  const live = ['reserved', 'checked_in', 'serving'].includes(t.status);
  return (
    <div className={cn('ticket relative overflow-hidden rounded-ticket text-white', live ? 'bg-lagoon' : 'bg-ink-soft')}>
      <div className={cn('flex items-start justify-between gap-4', compact ? 'p-4' : 'p-5 sm:p-6')}>
        <div className="min-w-0">
          <p className="text-sm text-white/75">{t.office_name}</p>
          <p className="truncate font-semibold">{t.service_name}</p>
        </div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[0.8rem] font-bold', t.status === 'serving' ? 'bg-mango text-ink' : 'bg-white/15')}>
          {t.status === 'serving' ? 'Your turn' : humanize(t.status)}
        </span>
      </div>
      <div className={cn('border-t-2 border-dashed border-white/25', compact ? 'mx-4' : 'mx-5 sm:mx-6')} />
      <div className={cn('flex items-end justify-between gap-4', compact ? 'p-4' : 'p-5 sm:p-6')}>
        <div>
          <p className="text-sm text-white/75">Queue number</p>
          <p className={cn('numeral font-black leading-none text-mango', compact ? 'text-5xl' : 'text-7xl sm:text-8xl')} aria-label={`Queue number ${t.queue_number}`}>
            {String(t.queue_number).padStart(3, '0')}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{date(t.slot_date)}</p>
          <p className="text-white/80">{time(t.start_time)} to {time(t.end_time)}</p>
        </div>
      </div>
    </div>
  );
}

export interface LineStep {
  id: string; step_name: string; status: string; sequence: number; acted_by_name?: string | null; acted_at?: string | null; remarks?: string | null;
  organization_code?: string | null; office_name?: string | null; approver_position_name?: string;
  requirements?: { requirement_key: string; name?: string; status: string; details?: { missing_receipts?: unknown[]; unresolved_violations?: unknown[] } | null }[];
}

function requirementNote(r: NonNullable<LineStep['requirements']>[number]) {
  if (r.status === 'satisfied') return 'done';
  const missing = r.details?.missing_receipts?.length ?? 0;
  const unresolved = r.details?.unresolved_violations?.length ?? 0;
  if (missing) return `${missing} receipt${missing > 1 ? 's' : ''} not yet verified`;
  if (unresolved) return `${unresolved} unresolved penalt${unresolved > 1 ? 'ies' : 'y'}`;
  return r.status === 'pending' ? 'not checked yet' : 'not done yet';
}

/** Clearance as a line of signing stations, in the order the template defines. */
export function ClearanceLine({ steps }: { steps: LineStep[] }) {
  const firstOpen = steps.findIndex((s) => s.status !== 'approved');
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const done = s.status === 'approved';
        const current = i === firstOpen;
        const returned = s.status === 'returned';
        return (
          <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && <span className={cn('absolute left-[15px] top-8 h-[calc(100%-2rem)] w-[3px] rounded', done ? 'bg-lagoon' : 'bg-mist-strong')} aria-hidden />}
            <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[3px] text-sm font-bold',
              done && 'border-lagoon bg-lagoon text-white',
              current && !returned && 'border-mango bg-mango-soft text-ink',
              returned && 'border-danger bg-danger-soft text-danger',
              !done && !current && !returned && 'border-mist-strong bg-white text-ink-faint')} aria-hidden>
              {done ? <Check className="h-4 w-4" /> : returned ? <CornerDownLeft className="h-4 w-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="font-bold">{s.step_name}
                <span className="sr-only">: {done ? 'signed' : returned ? 'returned' : current ? 'waiting for signature' : 'not yet'}</span></p>
              <p className="text-sm text-ink-soft">
                {[s.approver_position_name, s.organization_code ?? s.office_name].filter(Boolean).join(', ')}
              </p>
              {done && <p className="mt-1 text-sm text-leaf">Signed by {s.acted_by_name ?? 'approver'} on {dateTime(s.acted_at)}</p>}
              {returned && <p className="mt-1 text-sm text-danger">Returned: {s.remarks}</p>}
              {current && !returned && <p className="mt-1 text-sm font-semibold text-mango-ink">Waiting here</p>}
              {s.requirements && s.requirements.length > 0 && !done && (
                <ul className="mt-2 space-y-1">
                  {s.requirements.map((r) => (
                    <li key={r.requirement_key} className="flex items-start gap-2 text-sm">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', r.status === 'satisfied' ? 'bg-leaf' : r.status === 'pending' ? 'bg-mist-strong' : 'bg-danger')} aria-hidden />
                      <span><span className="font-medium">{r.name ?? humanize(r.requirement_key)}</span>
                        <span className="text-ink-soft"> {requirementNote(r)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
