'use client';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import ClusterLayer from '@/components/ClusterLayer';
import FilterPanel from '@/components/FilterPanel';
import PlacePanel from '@/components/PlacePanel';
import { loadPlaces, type Place } from '@/utils/loadPlaces';

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
  coins: string[]; // ['BTC','ETH',...]
  cats: string[];  // ['cafe', 'shop', ...]
  city?: string;
};

export default function MapPage() {
  // SSR では何も描画しない（window/leaflet に触れない）
  if (typeof window === 'undefined') return null;

  const router = useRouter();
  const sp = useSearchParams();

  // ---- 状態 ----
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Place | null>(null);

  const [flt, setFlt] = useState<Filters>(() => {
    const coins = (sp.get('coins') ?? '').split(',').filter(Boolean);
    const cats  = (sp.get('cats')  ?? '').split(',').filter(Boolean);
    const city  = sp.get('city') ?? undefined;
    return { coins, cats, city };
  });

  // ---- Leaflet のデフォルトアイコン設定（クライアントのみ）----
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

  // ---- データのロード ----
  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await loadPlaces(); // public/data/places/** を読み込むユーティリティ
      setPlaces(all);
      setLoading(false);
    })();
  }, []);

  // ---- フィルタ適用 ----
  const filtered = useMemo(() => {
    if (!places.length) return [];
    return places.filter(p => {
      const coinOK = !flt.coins.length || (p.coins ?? []).some(c => flt.coins.includes(c));
      const catOK  = !flt.cats.length  || (p.category ? flt.cats.includes(p.category) : false);
      const cityOK = !flt.city || (p.city && p.city.toLowerCase() === flt.city.toLowerCase());
      return coinOK && catOK && cityOK;
    });
  }, [places, flt]);

  // ---- URL へ反映（シェア可能に）----
  useEffect(() => {
    const q = new URLSearchParams();
    if (flt.coins.length) q.set('coins', flt.coins.join(','));
    if (flt.cats.length)  q.set('cats',  flt.cats.join(','));
    if (flt.city)         q.set('city',  flt.city);
    router.replace(`/map${q.toString() ? `?${q}` : ''}`);
  }, [flt, router]);

  // ---- モーダル開閉 ----
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
      {/* フィルタ */}
      <div className="absolute left-3 top-3 z-[1000]">
        <FilterPanel value={flt} onChange={setFlt} />
      </div>

      {/* 地図 */}
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && <ClusterLayer points={filtered} onSelect={openPlace} />}
      </MapContainer>

      {/* 右側のモーダル（詳細） */}
      <PlacePanel open={!!selected} place={selected} onClose={closePlace} />
    </div>
  );
}
