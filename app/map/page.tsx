// app/map/page.tsx
'use client';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import ClusterLayer from '@/components/ClusterLayer';
import FilterPanel from '@/components/FilterPanel';
import PlacePanel from '@/components/PlacePanel';
import { loadAllPlaces, type Place, type CityIndex } from '@/utils/loadPlaces';

// react-leaflet は SSR させない
const MapContainer = dynamicImport(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamicImport(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);

const tileURL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// FilterPanel が期待する UI フィルタ型（Set で保持）
type UIFilters = {
  coins: Set<string>;
  categories: Set<string>;
  city: string | null;
};

// Place を URL 用の一意キーに
const citySlug = (v?: string | null) =>
  (v ?? 'city').toLowerCase().replace(/\s+/g, '-');
const placeKey = (p: Place) => `${citySlug(p.city)}:${p.id}`;

export default function MapPage() {
  // SSR/SSG で Leaflet を触らない
  if (typeof window === 'undefined') return null;

  const router = useRouter();
  const sp = useSearchParams();

  const [places, setPlaces] = useState<Place[]>([]);
  const [cities, setCities] = useState<CityIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Place | null>(null);

  // URL → フィルタ初期値
  const [flt, setFlt] = useState<UIFilters>(() => {
    const coins = new Set((sp.get('coins') ?? '').split(',').filter(Boolean));
    const cats = new Set((sp.get('cats') ?? '').split(',').filter(Boolean));
    const city = sp.get('city') ?? null;
    return { coins, categories: cats, city };
  });

  // Leaflet デフォルトアイコン
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

  // データ読み込み（places）
  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await loadAllPlaces();
      setPlaces(all);
      setLoading(false);
    })();
  }, []);

  // 都市インデックス（FilterPanel 用）
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

  // フィルタ適用後の点群
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

  // onSelect 用：id → Place の逆引き
  const idMap = useMemo(() => {
    const m = new Map<string, Place>();
    for (const p of filtered) m.set(placeKey(p), p);
    return m;
  }, [filtered]);

  // URL 同期（シェア用）
  useEffect(() => {
    const q = new URLSearchParams();
    if (flt.coins.size) q.set('coins', Array.from(flt.coins).join(','));
    if (flt.categories.size) q.set('cats', Array.from(flt.categories).join(','));
    if (flt.city) q.set('city', flt.city);
    router.replace(`/map${q.toString() ? `?${q}` : ''}`);
  }, [flt, router]);

  // FilterPanel に渡す候補
  const coinOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) for (const c of p.coins ?? []) s.add(c);
    return Array.from(s).sort();
  }, [places]);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) if (p.category) s.add(p.category);
    return Array.from(s).sort();
  }, [places]);

  // モーダル開閉（id で受ける：ClusterLayer の型に合わせる）
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
    router.replace(`/map${q.toString() ? `?${q}` : ''}`);
  };

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%', position: 'relative' }}>
      {/* フィルタ（必須プロップを全部渡す） */}
      <div className="absolute left-3 top-3 z-[1000]">
        <FilterPanel
          coins={coinOptions}
          categories={categoryOptions}
          cities={cities}
          value={flt}
          onChange={setFlt}
          onClose={() => {}}
        />
      </div>

      {/* 地図 */}
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && <ClusterLayer points={filtered} onSelect={openById} />}
      </MapContainer>

      {/* 詳細モーダル（PlacePanel の props 仕様に合わせる） */}
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
