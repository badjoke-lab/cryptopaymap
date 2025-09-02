'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

import ClusterLayer from '@/components/ClusterLayer';
import FilterPanel from '@/components/FilterPanel';
import PlacePanel from '@/components/PlacePanel';
import { loadAllPlaces, type Place } from '@/utils/loadPlaces';

const MapContainer = dynamic(
  () => import('react-leaflet').then(m => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then(m => m.TileLayer),
  { ssr: false }
);

const tileURL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr = '&copy; OpenStreetMap contributors';

type UIFilters = {
  coins: Set<string>;
  categories: Set<string>;
  city: string | null;
};

// CityIndex は構造的型付けなので同じ形なら OK
type CityIndex = { city: string; country?: string };

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [iconReady, setIconReady] = useState(false);

  const [flt, setFlt] = useState<UIFilters>({
    coins: new Set(),
    categories: new Set(),
    city: null,
  });

  const [selected, setSelected] = useState<Place | null>(null);

  // データ読み込み
  useEffect(() => {
    loadAllPlaces().then((p) => {
      setPlaces(p);
      setLoading(false);
    });
  }, []);

  // Leaflet のデフォルトマーカー画像を public 配下の絶対パスに固定
  useEffect(() => {
    let mounted = true;
    (async () => {
      const L = (await import('leaflet')).default;
      L.Icon.Default.mergeOptions({
        iconUrl: '/leaflet/marker-icon.png',
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      });
      if (mounted) setIconReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // フィルタ用のマスター
  const allCoins = useMemo<string[]>(() => {
    const s = new Set<string>();
    for (const p of places) (p.coins || []).forEach((c) => s.add(c.toUpperCase()));
    return [...s].sort();
  }, [places]);

  const allCats = useMemo<string[]>(() => {
    const s = new Set<string>();
    for (const p of places) if (p.category) s.add(p.category);
    return [...s].sort();
  }, [places]);

  const cities = useMemo<CityIndex[]>(() => {
    const m = new Map<string, CityIndex>();
    for (const p of places) if (!m.has(p.city)) m.set(p.city, { city: p.city, country: p.country });
    return [...m.values()].sort((a, b) => a.city.localeCompare(b.city));
  }, [places]);

  // 絞り込み
  const filtered = useMemo(() => {
    if (!places.length) return [];
    return places.filter((p) => {
      const coinOK =
        flt.coins.size === 0 ||
        (p.coins || []).some((c) => flt.coins.has(c.toUpperCase()));
      const catOK =
        flt.categories.size === 0 ||
        (p.category ? flt.categories.has(p.category) : false);
      const cityOK = !flt.city || p.city === flt.city;
      return coinOK && catOK && cityOK;
    });
  }, [places, flt]);

  // 詳細の開閉
  const openById = (id: string) => {
    setSelected(places.find((x) => x.id === id) || null);
  };
  const closePlace = () => setSelected(null);

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%', position: 'relative' }}>
      {/* フィルタ（UI 側で開閉を持つ想定。必要なら onClose の実装に差し替え） */}
      <div className="absolute left-3 top-3 z-[1000]">
        <FilterPanel
          coins={allCoins}
          categories={allCats}
          cities={cities}
          value={flt}
          onChange={setFlt}
          onClose={() => {}}
        />
      </div>

      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && iconReady && (
          <ClusterLayer points={filtered} onSelect={openById} />
        )}
      </MapContainer>

      {/* 詳細モーダル（選択時のみ描画） */}
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
