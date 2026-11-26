import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { QueryView, EmptyState } from '@/components/ui/states';

interface PublicService { id: string; code: string; name: string; description: string | null; service_kind: string; required_documents: string[];
  target_processing_days: number | null; office_id: string; office_code: string; office_name: string; office_location: string | null }

export function PublicServices() {
  const q = useQuery({ queryKey: ['public-services'], queryFn: () => api.get<PublicService[]>('/public/services') });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1>Campus services</h1>
      <p className="mt-2 max-w-[60ch] text-ink-soft">What each office offers, what to bring, and whether you can reserve a queue slot online.</p>
      <div className="mt-8">
        <QueryView query={q} empty={(d) => d.length === 0 ? <EmptyState title="No services are listed yet" /> : null}>
          {(services) => {
            const offices = [...new Map(services.map((s) => [s.office_id, s])).values()];
            return (
              <div className="space-y-10">
                {offices.map((o) => (
                  <section key={o.office_id}>
                    <h2>{o.office_name}</h2>
                    {o.office_location && <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin className="h-4 w-4" aria-hidden />{o.office_location}</p>}
                    <ul className="mt-3 divide-y divide-mist rounded-xl bg-white ring-1 ring-mist">
                      {services.filter((s) => s.office_id === o.office_id).map((s) => (
                        <li key={s.id} className="p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3>{s.name}</h3>
                            <span className="text-sm text-ink-soft">{s.service_kind === 'request' ? 'Online request' : s.service_kind === 'both' ? 'Queue or online request' : 'Queue slot'}
                              {s.target_processing_days ? `, about ${s.target_processing_days} working day${s.target_processing_days > 1 ? 's' : ''}` : ''}</span>
                          </div>
                          {s.description && <p className="mt-1 max-w-[68ch] text-ink-soft">{s.description}</p>}
                          {s.required_documents?.length > 0 && <p className="mt-2 text-sm"><span className="font-semibold">Bring:</span> {s.required_documents.join(', ')}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            );
          }}
        </QueryView>
      </div>
    </div>
  );
}
