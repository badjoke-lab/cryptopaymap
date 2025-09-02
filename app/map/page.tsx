'use client';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import ClusterLayer from '@/components/ClusterLayer';
import FilterPanel from '@/components/FilterPanel';
import PlacePanel from '@/components/PlacePanel';
import { loadAllPlaces, type Place } from '@/utils/loadPlaces'; // ← ここを修正

// react-leaflet は SSR させない
const MapContainer = dynamicImport(
  () => import('react-leaflet').then(m => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamicImport(
  () => import('react-leaflet').then(m => m.TileLayer),
  { ssr: false }
);

const tileURL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Filters = {
  coins: string[];
  cats: string[];
  city?: string;
};

export default function MapPage() {
  if (typeof window === 'undefined') return null;

  const router = useRouter();
  const sp = useSearchParams();

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Place | null>(null);

  const [flt, setFlt] = useState<Filters>(() => {
    const coins = (sp.get('coins') ?? '').split(',').filter(Boolean);
    const cats  = (sp.get('cats') ?? '').split(',').filter(Boolean);
    const city  = sp.get('city') ?? undefined;
    return { coins, cats, city };
  });

  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      const iconRetinaUrl = '/leaflet/marker-icon-2x.png';
      const iconUrl = '/leaflet/marker-icon.png';
      const shadowUrl = '/leaflet/marker-shadow.png';
      // @ts-ignore
      L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await loadAllPlaces(); // ← 関数名も修正
      setPlaces(all);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!places.length) return [];
    return places.filter(p => {
      const coinOK = !flt.coins.length || (p.coins ?? []).some(c => flt.coins.includes(c));
      const catOK  = !flt.cats.length  || (p.category ? flt.cats.includes(p.category) : false);
      const cityOK = !flt.city || (p.city && p.city.toLowerCase() === flt.city.toLowerCase());
      return coinOK && catOK && cityOK;
    });
  }, [places, flt]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (flt.coins.length) q.set('coins', flt.coins.join(','));
    if (flt.cats.length)  q.set('cats', flt.cats.join(','));
    if (flt.city)         q.set('city', flt.city);
    router.replace(`/map${q.toString() ? `?${q}` : ''}`);
  }, [flt, router]);

  const openPlace = (p: Place) => {
    setSelected(p);
    const id = `${(p.city || 'city').toLowerCase().replace(/\s+/g, '-')}:${p.id}`;
    const q = new URLSearchParams(window.location.search);
    q.set('select', id);
    router.replace(`/map?${q}`);
  };
  const closePlace = () => {
    setSelected(null);
    const q = new URLSearchParams(window.location.search);
    q.delete('select');
    router.replace(`/map${q.toString() ? `?${q}` : ''}`);
  };

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%', position: 'relative' }}>
      <div className="absolute left-3 top-3 z-[1000]">
        <FilterPanel value={flt} onChange={setFlt} />
      </div>

      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && <ClusterLayer points={filtered} onSelect={openPlace} />}
      </MapContainer>

      <PlacePanel open={!!selected} place={selected} onClose={closePlace} />
    </div>
  );
}
