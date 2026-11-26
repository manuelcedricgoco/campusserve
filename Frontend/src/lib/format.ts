const TZ = 'Asia/Manila';
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : peso.format(Number(n)));
export const date = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: TZ }).format(new Date(v.length === 10 ? `${v}T00:00:00+08:00` : v)) : '—';
export const dateTime = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(v)) : '—';
export const time = (hhmm: string | null | undefined) => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(d);
};
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const humanize = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
