// components/MapShell.tsx
"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import React, { useEffect, useMemo, useRef, useState } from "react";
import SideModal from "./SideModal";
import MapDetail, { type Place as DetailPlace } from "./MapDetail";
import L from "leaflet";
import "leaflet.markercluster";
import { VerificationBadge } from "./VerificationBadge";
import { createRoot, type Root } from "react-dom/client";

/* ========================= util ========================= */
const blueIcon = new L.Icon({
  iconUrl: "/leaflet/marker-blue.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "",
});

type Place = DetailPlace & { coins?: string[] };

async function fetchJSON<T = any>(url: string) {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; }
  catch { return null; }
}

type CityIndex = { cities: Array<{ country: string; city: string; path: string }> };

const SORT_ORDER: Record<string, number> = { owner:0, community:1, directory:2, unverified:3 };

function mediaUrl(img: any) {
  if (img?.hash) return `/api/media/${img.hash}${img?.ext ? `.${img.ext}` : ""}`;
  if (img?.url) return String(img.url);
  if (typeof img === "string") return img;
  return "";
}

function firstThumbUrl(p: any): string | null {
  const imgs: any[] =
    (p?.media?.images && Array.isArray(p.media.images) ? p.media.images :
     Array.isArray(p?.images) ? p.images : []) as any[];
  for (const it of imgs) {
    const u = mediaUrl(it);
    if (u) return u;
  }
  return null;
}

function popupAccepted(p: Place): { line?: string; moreLine?: string } {
  const acc = Array.isArray(p.payment?.accepts) ? p.payment.accepts : [];
  const tokens: string[] = [];
  const CHAIN_LABEL: Record<string, string> = {
    ethereum: "Ethereum", polygon: "Polygon", arbitrum: "Arbitrum", base: "Base",
    bsc: "BNB", solana: "Solana", tron: "Tron",
  };
  for (const a of acc) {
    const asset = String(a?.asset || "").toUpperCase();
    const chainRaw = String(a?.chain || "").toLowerCase();
    if (!asset) continue;
    const chain = CHAIN_LABEL[chainRaw] ?? "";
    const isBtc = asset === "BTC";
    const isEthMain = asset === "ETH" && (chain === "Ethereum" || chain === "");
    let token = asset;
    if (!isBtc && !isEthMain && chain) token += `(${chain})`;
    tokens.push(token);
  }
  if (!tokens.length && Array.isArray(p.coins)) tokens.push(...p.coins.map((s) => s.toUpperCase()));
  if (!tokens.length) return {};
  const head = tokens.slice(0, 3).join(" · ");
  const rest = tokens.length > 3 ? `+${tokens.length - 3} more` : "";
  return { line: `Accepted: ${head}`, moreLine: rest || undefined };
}

const normalizeStatus = (s: any): NonNullable<DetailPlace["verification"]>["status"] =>
  s === "owner" || s === "community" || s === "directory" || s === "unverified" ? s : "unverified";

/* ========================= MapShell ========================= */
export default function MapShell() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [vf, setVf] = useState("all");
  const [coin, setCoin] = useState("All");
  const [category, setCategory] = useState("All");
  const [city, setCity] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => places.find((p) => p.id === selectedId) || null, [places, selectedId]);
  const [message, setMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);

  // Popup 内にマウントした React ルートの管理（リーク防止）
  const popupRootsRef = useRef<Record<string, Root | undefined>>({});

  // Drawer（右ドック）制御：超狭幅や手動切替に対応
  const [forceDrawer, setForceDrawer] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("cpm:filterMode");
    if (saved === "drawer") return true;
    if (saved === "inline") return false;
    return window.innerWidth < 360; // 初期自動判定
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* --- データ読込 --- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const idx = await fetchJSON<CityIndex>("/data/places/index.json");
      if (!alive) return;

      if (!idx || !Array.isArray(idx.cities) || idx.cities.length === 0) {
        setMessage("No dataset found under /data/places.");
        return;
      }
      const cityPaths = idx.cities.map((c) => `/data/places/${c.path}`);
      const chunks = await Promise.all(cityPaths.map((u) => fetchJSON<any[]>(u)));
      if (!alive) return;

      const flat: Place[] = [];
      for (const arr of chunks) {
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) continue;
          flat.push({
            ...p,
            coins: Array.isArray(p?.coins) ? p.coins.map((s: any) => String(s).toUpperCase()) : undefined,
            verification: { ...(p?.verification || {}), status: normalizeStatus(p?.verification?.status) },
          });
        }
      }
      if (flat.length === 0) setMessage("No dataset found under /data/places.");
      else { setMessage(null); setPlaces(flat); }
    })();
    return () => { alive = false; };
  }, []);

  /* 地図初期化 */
  useEffect(() => {
    if (mapRef.current) return;
    const el = canvasRef.current; if (!el) return;

    const m = L.map(el, { center: [20, 0], zoom: 2, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 19,
    }).addTo(m);

    const cluster = (L as any).markerClusterGroup?.({
      spiderfyOnMaxZoom: true, showCoverageOnHover: false, disableClusteringAtZoom: 15, maxClusterRadius: 50,
    });
    groupRef.current = cluster ?? new L.LayerGroup();
    groupRef.current.addTo(m);
    mapRef.current = m;
  }, []);

  /* 選択肢 */
  const categoryOptions = useMemo(() => {
    const s = new Set<string>(); places.forEach((p) => p?.category && s.add(p.category));
    return ["All", ...Array.from(s).sort()];
  }, [places]);
  const coinOptions = useMemo(() => {
    const s = new Set<string>(); places.forEach((p) => (p.coins ?? []).forEach((c) => s.add(c)));
    return ["All", ...Array.from(s).sort()];
  }, [places]);
  const cityOptions = useMemo(() => {
    const s = new Set<string>(); places.forEach((p) => p?.city && s.add(p.city));
    return ["All", ...Array.from(s).sort()];
  }, [places]);
  const vfOptions = useMemo(() => {
    const s = new Set<string>(); places.forEach((p) => { const v = p?.verification?.status; if (v) s.add(v); });
    const order = ["owner", "community", "directory", "unverified"];
    const list = Array.from(s).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return ["all", ...list];
  }, [places]);

  /* フィルタ＆固定ソート（verified→name） */
  const filteredSorted = useMemo(() => {
    let acc = places.filter((p) => coin === "All" || (p.coins ?? []).includes(coin));
    acc = acc.filter((p) => category === "All" || p.category === category);
    acc = acc.filter((p) => city === "All" || p.city === city);
    acc = acc.filter((p) => (vf === "all" ? true : p?.verification?.status === vf));
    acc = acc.slice().sort((a, b) => {
      const ra = SORT_ORDER[a?.verification?.status ?? "zzz"] ?? 9;
      const rb = SORT_ORDER[b?.verification?.status ?? "zzz"] ?? 9;
      if (ra !== rb) return ra - rb;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return acc;
  }, [places, coin, category, city, vf]);

  /* マーカー描画 */
  useEffect(() => {
    const m = mapRef.current; const g = groupRef.current;
    if (!m || !g) return;
    g.clearLayers?.();

    const b = L.latLngBounds([]);
    filteredSorted.forEach((p) => {
      const mk = L.marker([p.lat, p.lng], { title: p.name, icon: blueIcon });

      const thumb = firstThumbUrl(p);
      const { line, moreLine } = popupAccepted(p);
      const thumbHtml = thumb ? `<img src="${thumb}" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:6px"/>` : "";

      const html = `
        <div style="min-width:260px" class="cp-popup">
          ${thumbHtml}
          <div id="badge_${p.id}" style="margin:0 0 4px 0"></div>
          <div style="font-weight:700;font-size:16px;line-height:1.3">${p.name ?? ""}</div>
          <div>${p.city ?? ""}${p.city && p.country ? ", " : ""}${p.country ?? ""}</div>
          ${line ? `<div>${line}</div>` : ""}
          ${moreLine ? `<div>${moreLine}</div>` : ""}
          <div style="margin-top:8px">
            <button id="btn_${p.id}" style="all:unset;color:#2563eb;cursor:pointer;font-weight:600">View details</button>
          </div>
        </div>`;

      mk.bindPopup(html);

      mk.on("popupopen", () => {
        // View details
        requestAnimationFrame(() => {
          const el = document.getElementById(`btn_${p.id}`);
          if (el) el.addEventListener("click", (ev) => { ev.stopPropagation(); setSelectedId(p.id); });
        });
        // VerificationBadge をマウント
        const host = document.getElementById(`badge_${p.id}`);
        if (host) {
          const root = createRoot(host);
          root.render(<VerificationBadge status={p?.verification?.status} />);
          popupRootsRef.current[p.id] = root;
        }
      });

      mk.on("popupclose", () => {
        const root = popupRootsRef.current[p.id];
        if (root) { root.unmount(); delete popupRootsRef.current[p.id]; }
      });

      mk.addTo(g);
      b.extend([p.lat, p.lng]);
    });
    if (filteredSorted.length) m.fitBounds(b.pad(0.2));
  }, [filteredSorted]);

  /* Drawer/Inline 手動切替（任意） */
  function setMode(mode: "drawer" | "inline") {
    setForceDrawer(mode === "drawer");
    if (typeof window !== "undefined") window.localStorage.setItem("cpm:filterMode", mode);
  }

  /* 件数バッジ：All 以外の選択数 */
  const activeCount =
    (vf !== "all" ? 1 : 0) +
    (coin !== "All" ? 1 : 0) +
    (category !== "All" ? 1 : 0) +
    (city !== "All" ? 1 : 0);

  return (
    <div className="relative w-full">
      <div className="map-screen">
        <div ref={canvasRef} className="map-canvas" />

        {/* インラインツールバー（通常/タブレット/スマホ横スクロール） */}
        {!forceDrawer && (
          <div className="map-toolbar">
            <label className="text-xs opacity-70">Verify</label>
            <select value={vf} onChange={(e) => setVf(e.target.value)} className="rounded border px-2 py-1 text-xs" aria-label="Verify">
              {vfOptions.map((v) => {
                const label = v==="all" ? "All" :
                  v==="owner" ? "Owner" : v==="community" ? "Community" :
                  v==="directory" ? "Directory" :
                  v==="unverified" ? "Unverified" : v;
                return <option key={v} value={v}>{label}</option>;
              })}
            </select>

            <label className="text-xs opacity-70 ml-2">Coin</label>
            <select value={coin} onChange={(e) => setCoin(e.target.value)} className="rounded border px-2 py-1 text-xs" aria-label="Coin">
              {coinOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>

            <label className="text-xs opacity-70 ml-2">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border px-2 py-1 text-xs" aria-label="Category">
              {categoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>

            <label className="text-xs opacity-70 ml-2">City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded border px-2 py-1 text-xs" aria-label="City">
              {cityOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
        )}

        {/* 右ドック用 FAB（auto: <360px で表示） */}
        {forceDrawer && (
          <button className="map-filter-fab" onClick={() => setDrawerOpen(true)} aria-label="Open filters">
            {activeCount > 0 ? activeCount : "≡"}
          </button>
        )}
      </div>

      {/* 右ドック（Drawer モード） */}
      {forceDrawer && drawerOpen && (
        <>
          <div className="map-filter-drawer">
            <div className="map-filter-drawer__header">
              <div>Filters</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => { setVf("all"); setCoin("All"); setCategory("All"); setCity("All"); }}>
                  Reset
                </button>
                <button className="rounded px-2 py-1 text-xl leading-none" aria-label="Close" onClick={() => setDrawerOpen(false)}>×</button>
              </div>
            </div>
            <div className="map-filter-drawer__body">
              <div>
                <label className="block mb-1">Verify</label>
                <select value={vf} onChange={(e) => setVf(e.target.value)} aria-label="Verify">
                  {vfOptions.map((v) => {
                    const label = v==="all" ? "All" :
                      v==="owner" ? "Owner" : v==="community" ? "Community" :
                      v==="directory" ? "Directory" :
                      v==="unverified" ? "Unverified" : v;
                    return <option key={v} value={v}>{label}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block mb-1">Coin</label>
                <select value={coin} onChange={(e) => setCoin(e.target.value)} aria-label="Coin">
                  {coinOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <label className="block mb-1">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                  {categoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <label className="block mb-1">City</label>
                <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
                  {cityOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>

              {/* 任意：モード切替（保存） */}
              <div className="pt-2 text-xs text-neutral-500">
                <button className="underline mr-2" onClick={() => setMode("inline")}>Switch to Inline</button>
                <button className="underline" onClick={() => setMode("drawer")}>Keep Drawer</button>
              </div>
            </div>
          </div>
          <div className="map-filter-backdrop" onClick={() => setDrawerOpen(false)} />
        </>
      )}

      {message && (
        <div className="absolute left-4 bottom-4 z-[1200] bg-white/90 rounded px-3 py-2 text-xs border">
          {message}
        </div>
      )}
      <SideModal open={!!selected} title={selected?.name ?? ""} onClose={() => setSelectedId(null)}>
        {selected && <MapDetail place={selected} />}
      </SideModal>
    </div>
  );
}
