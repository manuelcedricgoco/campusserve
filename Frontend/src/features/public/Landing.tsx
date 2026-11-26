import { Link } from 'react-router';
import { CalendarClock, ClipboardCheck, FileText, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClearanceLine, QueueTicket } from '@/components/brand/brand';

const SAMPLE_STEPS = [
  { id: '1', sequence: 1, step_name: 'SSG Governor', status: 'approved', approver_position_name: 'Checks receipts and office slips', acted_by_name: 'SSG Governor', acted_at: '2026-11-20T09:30:00+08:00' },
  { id: '2', sequence: 2, step_name: 'SAS Head', status: 'pending', approver_position_name: 'Student Affairs and Services' },
  { id: '3', sequence: 3, step_name: 'Department Mayor', status: 'pending', approver_position_name: 'Your department organization' },
  { id: '4', sequence: 4, step_name: 'Program Head', status: 'pending', approver_position_name: 'Your program' },
];

const THINGS = [
  { icon: CalendarClock, title: 'Get a queue number before you leave home', body: 'Pick a time at the Registrar, Guidance, Library, SAS or Cashier. Your number shows on your phone and you are told when it is your turn.' },
  { icon: FileText, title: 'Request documents online', body: 'Send the request, attach what the office needs, and watch it move from review to ready for release.' },
  { icon: ClipboardCheck, title: 'See exactly what blocks your clearance', body: 'Each signing station shows what is missing: a receipt that is not yet verified, a Guidance or Library slip, or an unresolved penalty.' },
  { icon: Wallet, title: 'Settle penalties your way', body: 'For SSG penalties, choose one hour of community service or ₱60 for each verified violation. Your organization confirms it before it counts.' },
];

export function Landing() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-16">
        <div>
          <p className="font-semibold text-lagoon">Occidental Mindoro State University, Mamburao Campus</p>
          <h1 className="mt-3 text-[2.4rem] font-black leading-[1.04] sm:text-[3.4rem]">Skip the hallway wait.</h1>
          <p className="mt-4 max-w-[52ch] text-lg text-ink-soft">
            Reserve a queue slot, request documents, follow your clearance from the SSG to your Program Head, and settle receipts and penalties from your phone.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" asChild><Link to="/sign-in">Sign in</Link></Button>
            <Button size="lg" variant="secondary" asChild><Link to="/services">See campus services</Link></Button>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md" aria-label="Example of a queue ticket and a clearance in progress">
          <div className="rotate-[-2deg]">
            <QueueTicket t={{ queue_number: 14, status: 'reserved', service_name: 'Document request', office_name: 'Registrar', slot_date: '2026-11-27', start_time: '09:00', end_time: '09:30' }} />
          </div>
          <div className="-mt-4 ml-6 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-mist sm:ml-10">
            <p className="mb-4 text-sm font-semibold text-ink-soft">Example clearance</p>
            <ClearanceLine steps={SAMPLE_STEPS} />
          </div>
        </div>
      </section>

      <section className="border-t border-mist bg-white">
        <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-8 px-4 py-14 sm:px-6 md:grid-cols-2">
          {THINGS.map((t) => (
            <div key={t.title} className="flex gap-4">
              <t.icon className="mt-1 h-6 w-6 shrink-0 text-lagoon" aria-hidden />
              <div><h2 className="text-lg">{t.title}</h2><p className="mt-1.5 max-w-[56ch] text-ink-soft">{t.body}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-[68ch]">
          <h2>About online payment</h2>
          <p className="mt-2 text-ink-soft">
            Paying through GCash, Maya or LANDBANK will open once the university finishes merchant setup with each provider. Until then, pay at the
            Cashier or to your organization treasurer, who records and verifies your receipt in CampusServe. A screenshot is never accepted as proof of payment.
          </p>
        </div>
      </section>
    </>
  );
}
