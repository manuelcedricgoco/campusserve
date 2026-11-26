import { CampusMap } from '@/features/shared/CampusMap';
import { Assistant } from '@/features/shared/Assistant';

export function PublicMap() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1>Campus map</h1>
      <p className="mb-6 mt-2 max-w-[60ch] text-ink-soft">Find offices and buildings. Only places the university has verified are shown.</p>
      <CampusMap publicView />
    </div>
  );
}

export function PublicAsk() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1>Ask a question</h1>
      <p className="mb-6 mt-2 text-ink-soft">For general campus information. Sign in to ask about your own requests, clearance or penalties. Do not share personal details here.</p>
      <Assistant publicMode />
    </div>
  );
}
