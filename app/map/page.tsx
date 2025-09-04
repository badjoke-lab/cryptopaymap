// app/map/page.tsx
'use client';
import 'leaflet/dist/leaflet.css';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { loadAllPlaces, type Place, type CityIndex } from '@/utils/loadPlaces';

// ---- client-only dynamic imports ----
const MapContainer = dynamicImport(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamicImport(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const ClusterLayer = dynamicImport(() => import('@/components/ClusterLayer'), {
  ssr: false,
});
const FilterPanel = dynamicImport(() => import('@/components/FilterPanel'), {
  ssr: false,
  loading: () => null,
});
const PlacePanel = dynamicImport(() => import('@/components/PlacePanel'), {
  ssr: false,
  loading: () => null,
});

// ---- tiles ----
const tileURL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ---- types/helpers ----
type UIFilters = {
  coins: Set<string>;
  categories: Set<string>;
  city: string | null;
};
const citySlug = (v?: string | null) =>
  (v ?? 'city').toLowerCase().replace(/\s+/g, '-');
const placeKey = (p: Place) => `${citySlug(p.city)}:${p.id}`;

export default function MapPage() {
  const router = useRouter();

  // state
  const [places, setPlaces] = useState<Place[]>([]);
  const [cities, setCities] = useState<CityIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Place | null>(null);
  const [flt, setFlt] = useState<UIFilters>(() => ({
    coins: new Set<string>(),
    categories: new Set<string>(),
    city: null,
  }));

  // Leaflet default marker icons (from /public/leaflet/*)
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      });
    })();
  }, []);

  // Load places
  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await loadAllPlaces();
      setPlaces(all);
      setLoading(false);
    })();
  }, []);

  // Load city index for FilterPanel
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/data/places/index.json', { cache: 'no-store' });
        const json = await res.json();
        setCities(Array.isArray(json?.cities) ? json.cities : []);
      } catch {
        setCities([]);
      }
    })();
  }, []);

  // Initialize filters from URL (client only) — keep server markup stable
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const coins = new Set((sp.get('coins') ?? '').split(',').filter(Boolean));
    const cats = new Set((sp.get('cats') ?? '').split(',').filter(Boolean));
    const city = sp.get('city') ?? null;
    setFlt({ coins, categories: cats, city });
  }, []);

  // Apply filters to places
  const filtered = useMemo(() => {
    if (!places.length) return [];
    return places.filter((p) => {
      const coinOK =
        flt.coins.size === 0 || (p.coins ?? []).some((c) => flt.coins.has(c));
      const catOK =
        flt.categories.size === 0 ||
        (p.category ? flt.categories.has(p.category) : false);
      const cityOK =
        !flt.city || (p.city && p.city.toLowerCase() === flt.city.toLowerCase());
      return coinOK && catOK && cityOK;
    });
  }, [places, flt]);

  // id -> Place
  const idMap = useMemo(() => {
    const m = new Map<string, Place>();
    for (const p of filtered) m.set(placeKey(p), p);
    return m;
  }, [filtered]);

  // --- PATCH 1: Sync URL with current filters (150ms debounce) ---
  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      const q = new URLSearchParams();
      if (flt.coins.size) q.set('coins', Array.from(flt.coins).join(','));
      if (flt.categories.size) q.set('cats', Array.from(flt.categories).join(','));
      if (flt.city) q.set('city', flt.city);
      const qs = q.toString();
      router.replace(`/map${qs ? `?${qs}` : ''}`);
    }, 150);
    return () => {
      if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    };
  }, [flt, router]);

  // --- PATCH 2: Precompute heavy lists (memoized) ---
  const coinList = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) for (const c of p.coins ?? []) s.add(c);
    return Array.from(s).sort();
  }, [places]);

  const categoryList = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) if (p.category) s.add(p.category);
    return Array.from(s).sort();
  }, [places]);

  // open/close place panel (client)
  const openById = (id: string) => {
    const p = idMap.get(id);
    if (!p) return;
    setSelected(p);
    const q = new URLSearchParams(window.location.search);
    q.set('select', id);
    router.replace(`/map?${q}`);
  };
  const closePlace = () => {
    setSelected(null);
    const q = new URLSearchParams(window.location.search);
    q.delete('select');
    const qs = q.toString();
    router.replace(`/map${qs ? `?${qs}` : ''}`);
  };

  // ---- render: always return the same outer wrapper on server ----
  return (
    <div
      id="map-root"
      className="w-full"
      style={{ height: 'calc(100vh - 52px)', position: 'relative' }}
      aria-label="Map view"
    >
      {/* Filter */}
      <div className="absolute left-3 top-3 z-[1000]" aria-label="Filters">
        <FilterPanel
          coins={coinList}
          categories={categoryList}
          cities={cities}
          value={flt}
          onChange={setFlt}
          onClose={() => {}}
        />
      </div>

      {/* Map (client-only) */}
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && <ClusterLayer points={filtered} onSelect={openById} />}
      </MapContainer>

      {/* Detail panel (client-only) */}
      {selected && (
        <PlacePanel
          place={selected}
          all={places}
          mapCenter={[selected.lat, selected.lng] as [number, number]}
          onClose={closePlace}
          onSelect={openById}
        />
      )}
    </div>
  );
}
