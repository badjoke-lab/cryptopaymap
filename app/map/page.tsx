'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic'; // ← 衝突回避のため名前を変える

// 事前レンダ無効（build 時の revalidate/suspense 警告を封じる）
export const revalidate = 0 as const;
export const dynamic = 'force-dynamic';

// react-leaflet はすべて動的 import（SSR 停止）
const MapContainer = dynamicImport(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamicImport(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);

import ClusterLayer from '@/components/ClusterLayer';
import { loadAllPlaces, type Place } from '@/utils/loadPlaces';

// タイル
const tileURL =
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type CityIndex = { city: string; country: string; path: string };

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [iconReady, setIconReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Leaflet のデフォルトアイコンを public/leaflet で上書き
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      });
      setIconReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await loadAllPlaces();
      setPlaces(all);
      setLoading(false);
    })();
  }, []);

  // 都市プルダウン用のインデックス（ここでは UI 未表示だが型を整える）
  const cities = useMemo<CityIndex[]>(() => {
    const m = new Map<string, CityIndex>();
    for (const p of places) {
      const city = p.city ?? 'Unknown';
      if (!m.has(city)) {
        m.set(city, {
          city,
          country: p.country ?? '',
          path: p.path ?? '',
        });
      }
    }
    return [...m.values()].sort((a, b) => a.city.localeCompare(b.city));
  }, [places]);

  // ここではフィルタ無しの全件
  const filtered = places;

  const openById = (id: string) => setSelectedId(id);
  const closePanel = () => setSelectedId(null);

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%', position: 'relative' }}>
      {/* フィルターは一旦トグルボタンだけ（見た目は CSS） */}
      <button className="filter-toggle">Filters</button>

      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && iconReady && (
          <ClusterLayer points={filtered} onSelect={openById} />
        )}
      </MapContainer>

      {/* 詳細モーダルは後続で（現状はクラスターのクリックで id を受け取るだけ） */}
      {/* selectedId: {selectedId ?? '-'} */}
    </div>
  );
}
