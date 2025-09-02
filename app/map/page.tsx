'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

// 事前レンダ/ISR を完全無効化（build 時の revalidate エラー封じ）
export const revalidate = 0 as const;
export const dynamic = 'force-dynamic';

// react-leaflet はすべてクライアント専用で動的 import
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;      // lon を吸収して統一
  city?: string;
  country?: string;
  coins?: string[];
  category?: string;
};

type CityIndex = { city: string; country: string; path: string };

const tileURL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr = '&copy; OpenStreetMap contributors';

/** index.json から各都市 JSON を正しく辿って全件ロード */
async function loadAllPlaces(): Promise<Place[]> {
  const idx: { cities: CityIndex[] } = await fetch('/data/places/index.json', { cache: 'no-store' }).then(r => r.json());

  const lists = await Promise.all(
    idx.cities.map(async (c) => {
      // c.path の最後のセグメント（フォルダ名）がファイル名（例: us/los-angeles -> los-angeles.json）
      const slug = c.path.split('/').pop()!;
      const url  = `/data/places/${c.path}/${slug}.json`;
      try {
        const arr: any[] = await fetch(url).then(r => r.json());
        return arr;
      } catch {
        return [];
      }
    })
  );

  const raw = lists.flat();

  return raw
    .map((p: any): Place => ({
      id: String(p.id ?? `${p.city ?? 'x'}-${p.name ?? Math.random()}`),
      name: p.name ?? 'Unknown',
      lat: Number(p.lat),
      lng: Number(p.lng ?? p.lon),   // ← lon を吸収
      city: p.city ?? undefined,
      country: p.country ?? undefined,
      coins: Array.isArray(p.coins) ? p.coins : [],
      category: p.category ?? undefined,
    }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export default function MapPage() {
  const [places, setPlaces]   = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  // Leaflet のデフォルトアイコンを Next の public に固定
  useEffect(() => {
    let mounted = true;
    (async () => {
      const L = await import('leaflet');
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl:       '/leaflet/marker-icon.png',
        shadowUrl:     '/leaflet/marker-shadow.png',
      });

      const all = await loadAllPlaces();
      if (!mounted) return;
      setPlaces(all);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // まずは全件をそのまま描画（フィルタは後で戻す）
  const markers = useMemo(() => places, [places]);

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%' }}>
      {/* フィルタの仮ボタン（UIは一旦封印） */}
      <div className="absolute left-3 top-3 z-[1000]">
        <button className="rounded-full border px-3 py-1 bg-white shadow">Filters</button>
      </div>

      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        whenReady={e => setTimeout(() => e.target.invalidateSize(), 0)}  // タイルのブロック化防止
      >
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && markers.map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm">{[p.city, p.country].filter(Boolean).join(', ')}</div>
                {p.coins?.length ? <div className="text-xs">Coins: {p.coins.join(', ')}</div> : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
