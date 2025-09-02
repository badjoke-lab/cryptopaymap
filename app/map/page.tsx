'use client';

import React, { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import FilterPanel from '@/components/FilterPanel';
import PlacePanel from '@/components/PlacePanel';
import { loadAllPlaces, type Place, type CityIndex } from '@/utils/loadPlaces';

// react-leaflet は SSR 無効で動的 import
const MapContainer = dynamicImport(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamicImport(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const ClusterLayer = dynamicImport(
  () => import('@/components/ClusterLayer'),
  { ssr: false }
);

// OSM タイル
const tileURL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttr =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// フィルタUIの型
type UIFilters = {
  coins: Set<string>;
  categories: Set<string>;
  city: string | null;
};

// 外側は Suspense だけ（必須）
export default function MapPage() {
  return (
    <Suspense fallback={<div style={{height:'calc(100vh - 52px)'}}>Loading map…</div>}>
      <MapPageInner />
    </Suspense>
  );
}

// 実処理は内側へ（useSearchParams はここで使う）
function MapPageInner() {
  // ---- データ読み込み ----
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await loadAllPlaces(); // クライアントのみ
      if (!cancelled) {
        setPlaces(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Marker アイコン（クライアントのみ）----
  useEffect(() => {
    (async () => {
      const L = await import('leaflet');
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: `${base}/leaflet/marker-icon-2x.png`,
        iconUrl:       `${base}/leaflet/marker-icon.png`,
        shadowUrl:     `${base}/leaflet/marker-shadow.png`,
      });
    })();
  }, []);

  // ---- フィルタ候補 ----
  const coinsList = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) for (const c of (p.coins ?? [])) s.add(String(c).toUpperCase());
    return [...s].sort();
  }, [places]);

  const categoriesList = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) {
      if (p.category) s.add(p.category);
      for (const cc of (p as any).categories ?? []) s.add(String(cc));
    }
    return [...s].sort();
  }, [places]);

  const cities: CityIndex[] = useMemo(() => {
    const m = new Map<string, CityIndex>();
    for (const p of places) {
      const city = p.city ?? 'Unknown';
      if (!m.has(city)) {
        const path = (p as any).path ?? (p as any).cityPath ?? '';
        m.set(city, { city, country: p.country ?? '', path });
      }
    }
    return [...m.values()].sort((a, b) => a.city.localeCompare(b.city));
  }, [places]);

  // ---- URLクエリ <-> UI 状態 ----
  const sp = useSearchParams();
  const [flt, setFlt] = useState<UIFilters>({
    coins: new Set(),
    categories: new Set(),
    city: null,
  });
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    const cityQ  = sp.get('city');
    const coinsQ = sp.get('coins');
    const catsQ  = sp.get('categories');

    setFlt((prev) => ({
      coins: coinsQ
        ? new Set(coinsQ.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))
        : prev.coins,
      categories: catsQ
        ? new Set(catsQ.split(',').map(s => s.trim()).filter(Boolean))
        : prev.categories,
      city: cityQ ?? prev.city,
    }));
  }, [sp]);

  // ---- 絞り込み ----
  const filtered = useMemo(() => {
    if (!places.length) return [];

    const coinOK = (p: Place) => {
      if (!flt.coins.size) return true;
      const pc = (p.coins ?? []).map(c => String(c).toUpperCase());
      for (const c of flt.coins) if (pc.includes(c)) return true;
      return false;
    };

    const catOK = (p: Place) => {
      if (!flt.categories.size) return true;
      const list = new Set<string>([
        ...(p.category ? [p.category] : []),
        ...(((p as any).categories as string[]) ?? []),
      ]);
      for (const c of flt.categories) if (list.has(c)) return true;
      return false;
    };

    const cityOK = (p: Place) => !flt.city || (p.city ?? 'Unknown') === flt.city;

    return places.filter(p => coinOK(p) && catOK(p) && cityOK(p));
  }, [places, flt]);

  // ---- 選択中スポット ----
  const [selected, setSelected] = useState<Place | null>(null);

  const openById = useCallback((id: string) => {
    const p = places.find(x => x.id === id) ?? null;
    setSelected(p);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      if (p) u.searchParams.set('select', p.id);
      else u.searchParams.delete('select');
      window.history.replaceState(null, '', u.toString());
    }
  }, [places]);

  const closePlace = useCallback(() => {
    setSelected(null);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      u.searchParams.delete('select');
      window.history.replaceState(null, '', u.toString());
    }
  }, []);

  useEffect(() => {
    const sel = sp.get('select');
    if (sel) openById(sel);
    else setSelected(null);
  }, [sp, openById]);

  // 地図の初期センター
  const mapCenter: [number, number] = selected ? [selected.lat, selected.lng] : [20, 0];
  const mapZoom = selected ? 10 : 2;

  return (
    <div style={{ height: 'calc(100vh - 52px)', width: '100%', position: 'relative' }}>
      {/* フィルタトグル */}
      {!showFilter && (
        <button className="filter-toggle" onClick={() => setShowFilter(true)}>
          Filters
        </button>
      )}
      {showFilter && (
        <div className="filter-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Filters</h4>
            <button className="chip" onClick={() => setShowFilter(false)}>Close</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <FilterPanel
              coins={coinsList}
              categories={categoriesList}
              cities={cities}
              value={flt}
              onChange={setFlt as any}
              onClose={() => setShowFilter(false)}
            />
          </div>
        </div>
      )}

      {/* 地図 */}
      <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tileURL} attribution={tileAttr} />
        {!loading && <ClusterLayer points={filtered} onSelect={openById} />}
      </MapContainer>

      {/* 詳細モーダル */}
      {selected && (
        <PlacePanel
          place={selected}
          all={places}
          mapCenter={[selected.lat, selected.lng]}
          onClose={closePlace}
          onSelect={openById}
        />
      )}
    </div>
  );
}
