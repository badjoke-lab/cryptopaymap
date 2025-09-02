'use client';

import {useEffect, useMemo, useState} from 'react';
import dynamic from 'next/dynamic';

// --------- 重要：このページは完全クライアント & 事前レンダ無効 ----------
export const revalidate = 0 as const;
export const dynamic = 'force-dynamic';
// -------------------------------------------------------------------------

// react-leaflet を SSR させない
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;          // ← lon ではなく lng 固定で扱う
  city?: string;
  country?: string;
  coins?: string[];
  category?: string;
};

type CityIndex = { city: string; country: string; path: string };

const tileURL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr = '&copy; OpenStreetMap contributors';

/** /public/data/places/index.json と各都市 JSON から全部位をロード（クライアント fetch） */
async function loadAllPlaces(): Promise<Place[]> {
  const idx: { cities: CityIndex[] } = await fetch('/data/places/index.json', { cache: 'no-store' }).then(r => r.json());
  const files = await Promise.all(
    idx.cities.map(c => fetch(`/data/places/${c.path}/${c.city.toLowerCase().replaceAll(' ', '-')}.json`).then(r => r.json()).catch(()=>[]))
  );
  // 都市ファイルは配列を返す前提
  const raw: any[] = files.flat();
  // 正規化（lng がなければ lon→lng に読み替え）
  return raw.map((p:any): Place => ({
    id: String(p.id ?? `${p.city ?? ''}-${p.name ?? Math.random()}`),
    name: p.name ?? 'Unknown',
    lat: Number(p.lat),
    lng: Number(p.lng ?? p.lon),     // ★ ここで lon を吸収
    city: p.city ?? undefined,
    country: p.country ?? undefined,
    coins: Array.isArray(p.coins) ? p.coins : [],
    category: p.category ?? undefined,
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export default function MapPage() {
  const [places, setPlaces]     = useState<Place[]>([]);
  const [loading, setLoading]   = useState(true);

  // Leaflet のアイコン URL を Next の public に向けて上書き
  useEffect(() => {
    let mounted = true;
    (async () => {
      const L = await import('leaflet');
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl:       '/leaflet/marker-icon.png',
        shadowUrl:     '/leaflet/marker-shadow.png',
      });
      if (!mounted) return;
      // データ読込
      const all = await loadAllPlaces();
      setPlaces(all);
      setLoading(false);
      // 初回レンダ後にサイズ再計算（タイルがブロック状になるのを防止）
      // MapContainer の whenReady でも良いがここで二重保険
      requestAnimationFrame(async () => {
        const L2 = await import('leaflet');
        L2.map?.calls?.forEach?.((m:any)=>m.invalidateSize?.()); // ない場合もあるので無視
      });
    })();
    return () => { mounted = false; };
  }, []);

  const markers = useMemo(() => places, [places]);

  return (
    <div style={{height:'calc(100vh - 52px)', width:'100%'}}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{height:'100%', width:'100%'}}
        whenReady={(e) => setTimeout(() => e.target.invalidateSize(), 0)}
      >
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && markers.map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm">{[p.city, p.country].filter(Boolean).join(', ')}</div>
                {p.coins && p.coins.length > 0 && (
                  <div className="text-xs">Coins: {p.coins.join(', ')}</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
