import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Input } from './input';

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'attention' }) {
  return (
    <div className={cn('rounded-xl bg-white p-4 ring-1 ring-mist', tone === 'attention' && 'bg-mango-soft ring-mango/40')}>
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="numeral mt-1 text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}

const ACCEPT = 'application/pdf,image/jpeg,image/png';

/** File picker that validates size and type before upload; the server re-checks the real file type. */
export function FileUpload({ onFile, accept = ACCEPT, maxMb = 10, label = 'Attach a file', busy }: {
  onFile: (f: File) => void; accept?: string; maxMb?: number; label?: string; busy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > maxMb * 1024 * 1024) { setError(`Files must be at most ${maxMb} MB.`); return; }
        setError(null);
        onFile(f);
      }} />
      <Button type="button" variant="secondary" onClick={() => ref.current?.click()} loading={busy}><Paperclip className="h-4 w-4" aria-hidden />{label}</Button>
      <p className="mt-1 text-sm text-ink-faint">PDF, JPG or PNG, up to {maxMb} MB.</p>
      {error && <p role="alert" className="mt-1 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export interface StudentOption { id: string; full_name: string; student_number: string; program_code: string; section: string }

/** Search students the caller is allowed to see (server-side RLS). */
export function StudentPicker({ value, onChange, label = 'Student', candidatesPath }: {
  value: StudentOption | null; onChange: (s: StudentOption | null) => void; label?: string;
  /** Optional endpoint returning only eligible students (e.g. a remittance batch's class). */
  candidatesPath?: string;
}) {
  const [q, setQ] = useState('');
  const results = useQuery({
    queryKey: ['students', candidatesPath ?? 'all', q],
    queryFn: async () => (candidatesPath
      ? { data: await api.get<StudentOption[]>(candidatesPath, { q }) }
      : api.page<StudentOption>('/students', { q, pageSize: 8 })),
    enabled: q.trim().length >= 2,
  });
  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-lagoon-50 px-3 py-2">
        <div><p className="font-semibold">{value.full_name}</p><p className="text-sm text-ink-soft">{value.student_number}, {value.program_code} {value.section}</p></div>
        <Button variant="ghost" size="icon" type="button" aria-label="Change student" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
      </div>
    );
  }
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" htmlFor="student-search">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input id="student-search" className="pl-9" placeholder="Name or student number" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      {q.trim().length >= 2 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg ring-1 ring-mist" aria-label="Matching students">
          {results.isLoading && <li className="p-3 text-sm text-ink-faint">Searching…</li>}
          {results.data?.data.length === 0 && <li className="p-3 text-sm text-ink-faint">No students you can see match “{q}”.</li>}
          {results.data?.data.map((s) => (
            <li key={s.id}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-lagoon-50" onClick={() => onChange(s)}>
                <span className="font-medium">{s.full_name}</span> <span className="text-sm text-ink-soft">{s.student_number}, {s.program_code} {s.section}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Creates a fresh idempotency key for one user action (kept for retries of the same action). */
export const newIdempotencyKey = () => `cs-${crypto.randomUUID()}`;
