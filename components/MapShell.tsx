// components/MapShell.tsx
"use client";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import SideModal from "./SideModal";
import MapDetail from "./MapDetail";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";

/** ---- モバイル専用: Filters FAB / Sheet ---- */
function MobileFilterFab({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lg:hidden fixed right-3"
      style={{
        top: "calc(var(--cpm-header-h) + 8px)",
        zIndex: 1040,
        height: 48,
        padding: "0 16px",
        borderRadius: 9999,
        boxShadow: "0 8px 24px rgba(0,0,0,.12)",
        background: "#fff",
        border: "1px solid #e5e7eb",
      }}
      aria-label="Open filters"
    >
      Filters{count ? ` (${count})` : ""}
    </button>
  );
}
function MobileFilterSheet(props: {
  open: boolean; onClose: () => void;
  coin: string; setCoin: (v: string) => void; coinOptions: string[];
  category: string; setCategory: (v: string) => void; categoryOptions: string[];
  city: string; setCity: (v: string) => void; cityOptions: string[];
  onApply: () => void; onReset: () => void;
}) {
  const {
    open, onClose,
    coin, setCoin, coinOptions,
    category, setCategory, categoryOptions,
    city, setCity, cityOptions,
    onApply, onReset,
  } = props;
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[1050]" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[1060] lg:hidden
                      rounded-t-2xl bg-white shadow-xl p-4 pb-[calc(env(safe-area-inset-bottom,0)+12px)]
                      max-h-[80svh] overflow-y-auto"
      >
        <div className="h-1.5 w-10 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-3">Filters</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Coin</label>
            <select value={coin} onChange={(e) => setCoin(e.target.value)} className="w-full rounded-lg border p-2 text-sm">
              {coinOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border p-2 text-sm">
              {categoryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg border p-2 text-sm">
              {cityOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5">
          <button className="text-sm underline" onClick={onReset}>Reset</button>
          <button
            className="px-4 h-10 rounded-lg bg-black text-white text-sm"
            onClick={() => { onApply(); onClose(); }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

/** ---- データ/地図ユーティリティ ---- */
const blueIcon = new L.Icon({
  iconUrl: "/leaflet/marker-blue.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "",
});
type Place = {
  id: string; name: string; city?: string; country?: string; category?: string; coins?: string[];
  last_verified?: string; lat: number; lng: number; address?: string; url?: string;
  // 追加キーも保持して MapDetail に渡す
  [key: string]: any;
};
type IndexCity = { path: string };

const runtimeBase = () => {
  if (typeof window === "undefined") return "";
  const ap = (window as any).__NEXT_DATA__?.assetPrefix || "";
  const bp = (window as any).NEXT_PUBLIC_BASE_PATH || "";
  return `${ap}${bp}`;
};
const withBase = (p: string) => `${runtimeBase()}${p.startsWith("/") ? p : `/${p}`}`;
const safeBtnId = (id: string) => `vd_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
async function fetchJSON<T = any>(url: string) {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : null; }
  catch { return null; }
}
const toNum = (v: any) =>
  typeof v === "number" && Number.isFinite(v) ? v :
  typeof v === "string" ? (() => { const n = parseFloat(v.trim()); return Number.isFinite(n) ? n : null; })() : null;

/** 元データを捨てず保持（...raw）＋ coins が文字列でも配列化 */
const normalize = (raw: any): Place | null => {
  if (!raw || typeof raw !== "object") return null;

  let lat = toNum(raw.lat) ?? toNum(raw.latitude) ?? toNum(raw?.geo?.lat) ?? toNum(raw?.location?.lat) ?? null;
  let lng = toNum(raw.lng) ?? toNum(raw.lon) ?? toNum(raw.long) ?? toNum(raw.longitude) ?? toNum(raw?.geo?.lng) ?? toNum(raw?.geo?.lon) ?? toNum(raw?.location?.lng) ?? toNum(raw?.location?.lon) ?? null;

  if (raw?.geometry?.type === "Point" && Array.isArray(raw?.geometry?.coordinates)) {
    const [lngG, latG] = raw.geometry.coordinates;
    if (lat === null) lat = toNum(latG);
    if (lng === null) lng = toNum(lngG);
  }
  if (lat === null || lng === null) return null;

  let coins: string[] | undefined;
  if (Array.isArray(raw.coins)) coins = raw.coins;
  else if (typeof raw.coins === "string") coins = [raw.coins];
  else if (typeof raw.coin === "string") coins = [raw.coin];

  return {
    ...raw,
    id: String(raw.id ?? raw._id ?? `${raw.name ?? "Unnamed"}:${lat},${lng}`),
    name: String(raw.name ?? "Unnamed"),
    city: raw.city ?? raw.town ?? raw.locality,
    country: raw.country ?? raw.nation,
    category: raw.category ?? raw.type,
    coins,
    last_verified: raw.last_verified ?? raw.verified ?? raw.updated,
    lat, lng,
    address: raw.address ?? raw.addr,
    url: raw.url ?? raw.website ?? raw.link,
  };
};

const extractPlaces = (js: any): Place[] => {
  if (!js) return [];
  if (Array.isArray(js)) return js.map(normalize).filter(Boolean) as Place[];
  const buckets = [
    js.places, js.data?.places, js.items, js.data?.items, js.results, js.data?.results, js.rows, js.data?.rows,
    js.markers, js.data?.markers,
    js.features?.map((f: any) => ({ ...f?.properties, geometry: f?.geometry })),
  ].filter(Boolean);
  for (const b of buckets) if (Array.isArray(b) && b.length) return b.map(normalize).filter(Boolean) as Place[];
  return [];
};

const setSelectParam = (id: string) => { const u = new URL(location.href); u.searchParams.set("select", id); history.replaceState(null, "", u); };
const clearSelectParam = () => { const u = new URL(location.href); u.searchParams.delete("select"); history.replaceState(null, "", u); };

/** ---- MapShell ---- */
export default function MapShell() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [coin, setCoin] = useState("All");
  const [category, setCategory] = useState("All");
  const [city, setCity] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => places.find((p) => p.id === selectedId) || null, [places, selectedId]);
  const [message, setMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);

  /* ヘッダー高を実測して CSS 変数に反映 */
  useEffect(() => {
    const read = () => {
      const h = (document.querySelector("header") as HTMLElement)?.offsetHeight ?? 56;
      document.documentElement.style.setProperty("--cpm-header-h", `${h}px`);
    };
    read();
    const ro = new ResizeObserver(read);
    const hd = document.querySelector("header") as HTMLElement | null;
    if (hd) ro.observe(hd);
    window.addEventListener("resize", read);
    return () => { window.removeEventListener("resize", read); ro.disconnect(); };
  }, []);

  /* データ読込（既存優先） */
  useEffect(() => {
    let alive = true;
    (async () => {
      setMessage(null);
      for (const u of [withBase("/places.json"), withBase("/data/places.json")]) {
        const js = await fetchJSON<any>(u);
        if (js) {
          const acc = extractPlaces(js);
          if (acc.length) { if (alive) setPlaces(acc); return; }
        }
      }
      const idx = await fetchJSON<{ cities?: IndexCity[] } | IndexCity[]>(withBase("/data/places/index.json"));
      const cities: Array<IndexCity> = Array.isArray(idx) ? (idx as IndexCity[]) : (Array.isArray((idx as any)?.cities) ? (idx as any).cities : []);
      if (cities.length) {
        const urls = cities.map((c) => withBase(`/data/places/${c.path}`));
        const jsons = await Promise.all(urls.map((u) => fetchJSON<any>(u)));
        const acc: Place[] = [];
        for (const j of jsons) acc.push(...extractPlaces(j));
        if (acc.length) { if (alive) setPlaces(acc); return; }
      }
      if (alive) setMessage("No dataset found under /public. Expected: /places.json or /data/places/index.json");
    })();
    return () => { alive = false; };
  }, []);

  /* 地図初期化 */
  useEffect(() => {
    if (mapRef.current) return;
    const el = containerRef.current; if (!el) return;

    // StrictMode対策
    if ((el as any)._leaflet_id) {
      try {
        (el as any)._leaflet_id = null;
        (el as any).innerHTML = "";
      } catch {}
    }

    const m = L.map(el, { center: [20, 0], zoom: 2, zoomControl: true }); mapRef.current = m;

    const setZoomPos = () => {
      const h = el.getBoundingClientRect().height;
      const pos = (h < 280 || window.innerWidth < 1024) ? "bottomright" : "topright";
      m.zoomControl.setPosition(pos as any);
    };
    setZoomPos();
    const onResize = () => setZoomPos();
    window.addEventListener("resize", onResize);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);

    const cluster = (L as any).markerClusterGroup?.({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 15,
      maxClusterRadius: 50,
    });
    groupRef.current = (cluster ?? new L.LayerGroup()) as L.LayerGroup;
    groupRef.current.addTo(m);

    setTimeout(() => m.invalidateSize(), 0);
    return () => { window.removeEventListener("resize", onResize); try { m.remove(); } finally { mapRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!places.length) return;
    const id = new URL(location.href).searchParams.get("select");
    if (id && places.some((p) => p.id === id)) setSelectedId(id);
  }, [places]);

  /* マーカー描画 */
  useEffect(() => {
    const m = mapRef.current, g = groupRef.current as any; if (!m || !g) return;
    g.clearLayers?.(); if (g instanceof L.LayerGroup) g.clearLayers();
    const b = L.latLngBounds([]);

    const filtered = places
      .filter((p) => coin === "All" || (Array.isArray(p.coins) ? p.coins : []).includes(coin))
      .filter((p) => category === "All" || p.category === category)
      .filter((p) => city === "All" || p.city === city);

    filtered.forEach((p) => {
      const mk = L.marker([p.lat, p.lng], { title: p.name, icon: blueIcon });
      const loc = [p.city, p.country].filter(Boolean).join(", ");
      const coinsRow = Array.isArray(p.coins) && p.coins.length ? `<div>Coins: ${p.coins.join(", ")}</div>` : "";
      const verified = p.last_verified ? `<div>Verified: ${p.last_verified}</div>` : "";
      const btnId = safeBtnId(p.id);
      const html = `
        <div style="min-width:220px">
          <div style="font-weight:600;margin-bottom:4px">${p.name ?? "Unnamed"}</div>
          ${loc ? `<div>${loc}</div>` : ""}
          ${p.category ? `<div>${p.category}</div>` : ""}
          ${coinsRow}
          ${verified}
          <div style="margin-top:8px">
            <button type="button" id="${btnId}" style="all:unset;cursor:pointer;color:#2563eb;font-weight:600">View details</button>
          </div>
        </div>`;

      mk.bindPopup(html, { autoPan: true, keepInView: true, autoClose: false });
      mk.on("click", () => mk.openPopup());

      const popup = mk.getPopup();
      mk.on("popupopen", () => {
        requestAnimationFrame(() => {
          const el = popup.getElement() as HTMLElement | null;
          if (!el) return;
          const btn = el.querySelector<HTMLButtonElement>(`#${btnId}`);
          if (!btn) return;
          const KEY = "__vd_handler__";
          const prev = (btn as any)[KEY] as ((e: Event) => void) | undefined;
          if (prev) btn.removeEventListener("click", prev);
          const handler = (ev: Event) => {
            ev.stopPropagation();
            setSelectedId(p.id);
            setSelectParam(p.id);
          };
          (btn as any)[KEY] = handler;
          btn.addEventListener("click", handler);
        });
      });
      mk.on("popupclose", () => {
        const el = popup.getElement() as HTMLElement | null;
        if (!el) return;
        const btn = el.querySelector<HTMLButtonElement>(`#${btnId}`);
        if (btn) {
          const KEY = "__vd_handler__";
          const prev = (btn as any)[KEY] as ((e: Event) => void) | undefined;
          if (prev) btn.removeEventListener("click", prev);
          (btn as any)[KEY] = undefined;
        }
      });

      g.addLayer?.(mk) ?? mk.addTo(g);
      b.extend([p.lat, p.lng]);
    });

    if (filtered.length) mapRef.current!.fitBounds(b.pad(0.2));
  }, [places, coin, category, city]);

  /* PC用セレクト */
  const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
    <label className="flex items-center gap-2 bg-white text-black rounded-2xl px-4 py-2 shadow border border-neutral-200">
      <span className="text-sm text-neutral-600">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="text-sm font-medium outline-none bg-transparent">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  const coinOptions = useMemo(() => ["All", ...Array.from(new Set(places.flatMap((p) => Array.isArray(p.coins) ? p.coins : []))).sort()], [places]);
  const categoryOptions = useMemo(() => ["All", ...Array.from(new Set(places.map((p) => p.category).filter(Boolean) as string[])).sort()], [places]);
  const cityOptions = useMemo(() => ["All", ...Array.from(new Set(places.map((p) => p.city).filter(Boolean) as string[])).sort()], [places]);

  const selectedCount = (coin !== "All" ? 1 : 0) + (category !== "All" ? 1 : 0) + (city !== "All" ? 1 : 0);
  const [openSheet, setOpenSheet] = useState(false);
  const handleApply = () => {};
  const handleReset = () => { setCoin("All"); setCategory("All"); setCity("All"); };

  return (
    <div className="relative w-full">
      {/* PC: ヘッダー下に固定（lg以上） */}
      <div
        className="hidden lg:flex fixed left-1/2 -translate-x-1/2 z-[1100] gap-2 flex-wrap bg-white/90 backdrop-blur rounded-2xl px-3 py-2 border border-neutral-200 shadow"
        style={{ top: "calc(var(--cpm-header-h) + 8px)" }}
      >
        <Select label="Coin" value={coin} onChange={setCoin} options={coinOptions} />
        <Select label="Category" value={category} onChange={setCategory} options={categoryOptions} />
        <Select label="City" value={city} onChange={setCity} options={cityOptions} />
      </div>

      {/* モバイル〜小タブ */}
      <MobileFilterFab count={selectedCount} onOpen={() => setOpenSheet(true)} />
      <MobileFilterSheet
        open={openSheet} onClose={() => setOpenSheet(false)}
        coin={coin} setCoin={setCoin} coinOptions={coinOptions}
        category={category} setCategory={setCategory} categoryOptions={categoryOptions}
        city={city} setCity={setCity} cityOptions={cityOptions}
        onApply={handleApply} onReset={handleReset}
      />

      {/* 地図 */}
      <div ref={containerRef} className="map-screen relative" />

      {message && (
        <div className="absolute left-4 bottom-4 z-[1200] bg-white/90 rounded px-3 py-2 text-xs border">
          {message}
        </div>
      )}

      <SideModal
        open={!!selected}
        title={selected?.name ?? ""}
        onClose={() => { setSelectedId(null); clearSelectParam(); }}
      >
        {selected && (
          <MapDetail
            place={selected as any}
            onClose={() => { setSelectedId(null); clearSelectParam(); }}
          />
        )}
      </SideModal>
    </div>
  );
}
