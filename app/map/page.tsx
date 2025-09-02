'use client';

import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';

// SSG/ISR 完全無効化（ビルド時エラー封じ）
export const revalidate = 0 as const;
export const dynamic = 'force-dynamic';

// react-leaflet を動的 import（SSR させない）
const MapContainer = dynamicImport(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamicImport(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);

// OSM タイル
const tileURL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function MapPage() {
  const [iconReady, setIconReady] = useState(false);

  // Leaflet のデフォルトアイコンを public/leaflet に固定
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

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%', position: 'relative' }}>
      <button className="filter-toggle">Filters</button>
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {/* ★ まずは素の地図だけ。ピン/クラスタは地図が正常化してから戻す */}
      </MapContainer>
    </div>
  );
}
