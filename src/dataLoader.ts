// src/dataLoader.ts
export type Place = {
  id: string; name: string; category: string;
  lat: number; lng: number;
  country: string; city: string;
  website?: string; hours?: string; phone?: string;
  instagram?: string; twitter?: string;
  payment?: { lightning?: boolean; onchain?: boolean; credit_cards?: boolean; cash?: boolean };
};

type ManifestFile = { path: string; sha256: string };
type Manifest = { version: string; files: ManifestFile[] };

let manifestCache: Manifest | null = null;
const shardCache = new Map<string, Place[]>(); // key = file path

const MANIFEST_URL = "/public/data/manifest.json";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-cache" }); // version付きURLにしているので no-cache でOK
  if (!res.ok) throw new Error(`fetch failed: ${url} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  manifestCache = await fetchJSON<Manifest>(MANIFEST_URL);
  return manifestCache!;
}

function bySuffix(files: ManifestFile[], suffix: string) {
  return files.find(f => f.path.endsWith(suffix));
}
function shardByCountry(files: ManifestFile[], cc: string) {
  return files.find(f => f.path.endsWith(`/shards/${cc.toUpperCase()}.json`));
}

export async function loadAll(): Promise<Place[]> {
  const m = await loadManifest();
  const f = bySuffix(m.files, "places.all.json");
  if (!f) throw new Error("places.all.json not found in manifest");
  if (shardCache.has(f.path)) return shardCache.get(f.path)!;
  const data = await fetchJSON<Place[]>(`/${f.path}?v=${m.version}`);
  shardCache.set(f.path, data);
  return data;
}

export async function loadCountry(cc: string): Promise<Place[]> {
  const m = await loadManifest();
  const f = shardByCountry(m.files, cc);
  // shard が無ければ all にフォールバック
  if (!f) return loadAll();
  if (shardCache.has(f.path)) return shardCache.get(f.path)!;
  const data = await fetchJSON<Place[]>(`/${f.path}?v=${m.version}`);
  shardCache.set(f.path, data);
  return data;
}

// ビューポート内抽出用のユーティリティ（任意）
export function filterByBounds(data: Place[], bbox: {minLat:number,maxLat:number,minLng:number,maxLng:number}) {
  const {minLat,maxLat,minLng,maxLng} = bbox;
  return data.filter(p => p.lat>=minLat && p.lat<=maxLat && p.lng>=minLng && p.lng<=maxLng);
}
