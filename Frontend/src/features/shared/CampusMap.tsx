import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L, { type LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import { MapPinOff, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { Status } from '@/components/ui/status';

interface Feature { type: 'Feature'; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> & { name?: string; verification_status?: string; kind?: string } }
interface FC { type: 'FeatureCollection'; features: Feature[] }
interface Hit { location_id: string; name: string; match_type: string; verification_status: string; has_coordinates: boolean }

function FitBounds({ data }: { data: FC }) {
  const map = useMap();
  useMemo(() => {
    const layer = L.geoJSON(data as GeoJSON.FeatureCollection);
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b as LatLngBoundsExpression, { padding: [24, 24], maxZoom: 19 });
  }, [data, map]);
  return null;
}

/**
 * Campus map. Only administrator-entered or imported features are shown; nothing is placed by guesswork.
 * Unverified features (signed-in view) are drawn dashed and labelled.
 */
export function CampusMap({ publicView }: { publicView?: boolean }) {
  const base = publicView ? '/public/gis' : '/gis';
  const map = useQuery({ queryKey: ['gis-map', base], queryFn: () => api.get<FC>(`${base}/map`) });
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const hits = useQuery({ queryKey: ['gis-search', base, term], queryFn: () => api.get<Hit[]>(`${base}/search`, { q: term }), enabled: term.length >= 2 });
  const withGeometry = map.data?.features.filter((f) => f.geometry) ?? [];

  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }} role="search">
        <label htmlFor="map-search" className="sr-only">Search places</label>
        <Input id="map-search" placeholder="Search an office, room or building" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary"><Search className="h-4 w-4" aria-hidden />Search</Button>
      </form>
      {term && hits.data && (
        <ul className="rounded-xl bg-white ring-1 ring-mist" aria-label="Search results">
          {hits.data.length === 0 && <li className="p-4 text-sm text-ink-soft">No place matches “{term}”.</li>}
          {hits.data.map((h) => (
            <li key={h.location_id} className="flex items-center justify-between gap-3 border-b border-mist p-3 last:border-0">
              <span className="font-medium">{h.name}</span>
              <span className="flex items-center gap-2 text-sm">{!h.has_coordinates && <span className="text-ink-faint">Not on the map yet</span>}<Status value={h.verification_status} /></span>
            </li>
          ))}
        </ul>
      )}
      {map.isLoading && <LoadingBlock rows={1} />}
      {map.error ? <ErrorState error={map.error} onRetry={() => map.refetch()} /> : null}
      {map.data && withGeometry.length === 0 && (
        <EmptyState icon={<MapPinOff className="h-6 w-6" aria-hidden />} title="The campus map has not been surveyed yet"
          body="Buildings, offices and walkways appear here only after the university records and verifies their real locations. CampusServe does not guess where places are." />
      )}
      {map.data && withGeometry.length > 0 && (
        <div className="h-[60vh] min-h-[320px] overflow-hidden rounded-xl ring-1 ring-mist">
          <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom className="h-full w-full">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <GeoJSON data={{ type: 'FeatureCollection', features: withGeometry } as GeoJSON.FeatureCollection}
              style={(f) => ({ color: '#0E5E6F', weight: 3, dashArray: f?.properties?.verification_status === 'verified' ? undefined : '6 6' })}
              pointToLayer={(f, latlng) => L.circleMarker(latlng, { radius: 8, color: '#0E5E6F', fillColor: f.properties?.verification_status === 'verified' ? '#F2A900' : '#fff', fillOpacity: 1, weight: 3 })}
              onEachFeature={(f, layer) => {
                const p = f.properties ?? {};
                const el = document.createElement('div');
                const strong = document.createElement('strong');
                strong.textContent = String(p.name ?? 'Unnamed');
                el.appendChild(strong);
                if (p.verification_status !== 'verified') { const s = document.createElement('div'); s.textContent = 'Not yet verified'; el.appendChild(s); }
                layer.bindPopup(el);
              }} />
            <FitBounds data={{ type: 'FeatureCollection', features: withGeometry }} />
          </MapContainer>
        </div>
      )}
    </div>
  );
}
