/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import crypto from "crypto";

/** ===== パス設定（必要なら調整） ===== */
const DATA_ROOT = path.resolve("public", "data");
const SUBMISSIONS_DIR = path.join(DATA_ROOT, "submissions"); // owner|community|report の中間JSON
const PLACES_DIR = path.join(DATA_ROOT, "places");           // 国/都市ごとの最終JSON（配列）
const INDEX_PATH = path.join(DATA_ROOT, "index.json");       // 都市一覧（{country, city, path}[]）
const LOG_DIR = path.join(DATA_ROOT, "logs", "imports");

/** ===== 基本ユーティリティ ===== */
const ensureDir = (p: string) => fs.mkdirSync(p, { recursive: true });
const readJson = <T=any>(p: string, fallback: T): T => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
};
const writeJson = (p: string, v: any) => {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", "utf8");
};
const nowISO = () => new Date().toISOString();
const slugify = (s?: string | null) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** country を ISO2 に寄せる軽量変換（キーは小文字で統一） */
function countryCodeLite(country?: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toLowerCase();

  const map: Record<string, string> = {
    "usa": "US",
    "united states": "US",
    "united states of america": "US",
    "us": "US",

    "japan": "JP",
    "jp": "JP",
    "jpn": "JP",

    "united kingdom": "GB",
    "uk": "GB",
    "gb": "GB",
    "gbr": "GB",

    "france": "FR",
    "fr": "FR",
    "fra": "FR",
  };

  if (map[c]) return map[c];
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return c.slice(0, 2).toUpperCase();
}

const haversineMeters = (a: {lat:number;lng:number}, b:{lat:number;lng:number}) => {
  const R = 6371000;
  const toRad = (d:number) => (d*Math.PI/180);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** ===== 型（最低限） ===== */
type SubmissionKind = "owner" | "community" | "report";

type MidImage = { url: string | null; fileId: string | null };
type MidSocial = { platform: string; handle: string | null; url: string | null };

type MidJSON = {
  meta: { source: string; kind: SubmissionKind; timestamp?: string; slug?: string; };
  place?: {
    name?: string | null; address?: string | null;
    city?: string | null; country?: string | null;
    lat?: number | null; lng?: number | null;
    category?: string | null; website?: string | null; phone?: string | null; hours?: string | null;
    socials?: MidSocial[];
  };
  submission?: {
    already_listed?: boolean;
    listed_ref?: string | null;       // URLやPlaceID文字列
    coins_raw?: string[];             // 後段で正規化
    images?: MidImage[];
  };
  verification?: { status?: "owner" | "community" } & Record<string, any>;
  links?: Record<string, string[]>;
  profile?: { summary?: string | null };
  consent?: string | null;

  // report のとき
  place_ref?: string | null;
  report?: {
    reason?: string | null;
    evidence_urls?: string[];
    notes?: string | null;
    proposed?: {
      phone?: string | null; hours?: string | null; website?: string | null;
      category?: string | null; coins?: string[]; other?: string | null;
    };
    images?: MidImage[];
    consent?: string | null;
  };
};

type MediaImage = { hash: string; ext: string; caption?: string };

/** place.schema.json に準拠した accepts 要素 */
type AcceptItem = {
  asset: string; // "BTC" | "ETH" | "USDT" | ...
  chain: "bitcoin" | "lightning" | "evm-mainnet" | "polygon" | "arbitrum" | "base" | "bsc" | "solana" | "tron" | "ton" | "avalanche";
  method?: "onchain" | "lightning" | "lnurl" | "bolt12" | "other";
  processor?: "btcpay" | "opennode" | "strike" | "coinbase-commerce" | "nowpayments" | "bitpay" | "self-hosted" | "other";
  note?: string;
};

type PlaceRecord = {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  category?: string;
  website?: string;
  phone?: string;
  hours?: string;
  socials?: MidSocial[];
  payment?: { accepts: AcceptItem[]; preferred?: string[]; pending_assets?: string[]; notes?: string };
  profile?: { summary?: string };
  media?: { images?: MediaImage[] };
  verification?: {
    status?: "owner" | "community" | "directory" | "unverified";
    last_verified?: string;
    sources?: { type?: "official_site" | "provider_directory" | "text" | "widget" | "receipt" | "screenshot" | "other"; name?: string; url?: string; when?: string }[];
  };
  /** スキーマ上は top-level にある */
  status_override?: "disputed" | "hidden" | "none";
  review?: { notes?: string[]; category_suggestions?: string[]; };
  // 任意の互換
  [k: string]: any;
};

/** ===== 支払いの正規化（スキーマ適合版） =====
 * 入力例: ["BTC (Lightning)", "ETH on mainnet", "USDT (TRC-20)"]
 * 出力: AcceptItem[]
 */
function normalizePayments(raw: string[] | undefined | null): AcceptItem[] {
  if (!raw || !raw.length) return [];
  const out: AcceptItem[] = [];

  const push = (a: Partial<AcceptItem>) => {
    const asset = String(a.asset || "").toUpperCase();
    const chain = a.chain as AcceptItem["chain"] | undefined;
    if (!asset || !chain) return;
    // method 既定
    const method: AcceptItem["method"] = chain === "lightning" ? "lightning" : "onchain";
    out.push({ asset, chain, method });
  };

  for (const r0 of raw) {
    const r = (r0 ?? "").toLowerCase().trim();

    // BTC
    if (r.includes("btc") || r.includes("bitcoin")) {
      if (r.includes("lightning")) push({ asset: "BTC", chain: "lightning" });
      else push({ asset: "BTC", chain: "bitcoin" });
      continue;
    }

    // ETH / EVM
    if (/\beth\b|ethereum|evm/.test(r)) { push({ asset: "ETH", chain: "evm-mainnet" }); continue; }
    if (/polygon|matic/.test(r)) { push({ asset: r.includes("usdt") ? "USDT" : r.includes("usdc") ? "USDC" : "MATIC", chain: "polygon" }); continue; }
    if (/bsc|bnb/.test(r)) { push({ asset: r.includes("usdt") ? "USDT" : r.includes("usdc") ? "USDC" : "BNB", chain: "bsc" }); continue; }
    if (/arbitrum/.test(r)) { push({ asset: "ETH", chain: "arbitrum" }); continue; }
    if (/base/.test(r)) { push({ asset: "ETH", chain: "base" }); continue; }

    // SOL
    if (/sol(ana)?/.test(r)) { push({ asset: "SOL", chain: "solana" }); continue; }

    // TRON
    if (/tron|trc-?20/.test(r)) { push({ asset: r.includes("usdc") ? "USDC" : "USDT", chain: "tron" }); continue; }

    // 代表的トークン（チェーン不明は一旦スキップ：後段の pending_assets で拾える運用を想定）
    if (/usdt|tether/.test(r)) { /* skip: チェーン不明 */ continue; }
    if (/usdc/.test(r)) { /* skip: チェーン不明 */ continue; }
  }

  // 重複除去（asset+chain）
  const seen = new Set<string>();
  const dedup = out.filter(a => {
    const k = `${a.asset}:${a.chain}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return dedup;
}

/** ===== 既存レコード突合 ===== */
function pickExistingIndex(cityList: PlaceRecord[], mid: MidJSON): number {
  // 1) listed_ref に placeId が混じっていればID直ヒット
  const ref = mid.submission?.listed_ref ?? mid.place_ref ?? null;
  if (ref) {
    // URLにIDが含まれている想定: 末尾の英数ハイフン列を拾う（弱いが実用）
    const m = String(ref).match(/[a-z0-9-]{6,}$/i);
    const idGuess = m?.[0];
    if (idGuess) {
      const i = cityList.findIndex(p => p.id === idGuess);
      if (i >= 0) return i;
    }
  }

  // 2) name + (±50mの近接)
  const name = mid.place?.name?.trim().toLowerCase();
  const lat = mid.place?.lat ?? null;
  const lng = mid.place?.lng ?? null;
  if (name && typeof lat === "number" && typeof lng === "number") {
    for (let i=0;i<cityList.length;i++) {
      const p = cityList[i];
      if (!p.name) continue;
      if (p.name.trim().toLowerCase() !== name) continue;
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      const d = haversineMeters({lat, lng}, {lat: p.lat, lng: p.lng});
      if (d <= 50) return i;
    }
  }

  return -1; // 未ヒット
}

/** ===== ID 生成 ===== */
function genId(country: string, citySlug: string, name?: string | null, lat?: number | null, lng?: number | null): string {
  const base = `${country}-${citySlug}-${slugify(name) || "place"}`;
  const h = crypto.createHash("sha1").update(`${name ?? ""}|${lat ?? ""}|${lng ?? ""}|${Date.now()}`).digest("base64url").slice(0,6);
  return `${base}-${h}`;
}

/** ===== マージポリシー実装 ===== */
function upgradeStatus(cur?: string, incoming?: string): string | undefined {
  const rank = (s?: string) => ["unverified","directory","community","owner"].indexOf((s || "unverified").toLowerCase());
  const rC = rank(cur), rI = rank(incoming);
  return (rI > rC) ? (incoming as any) : cur;
}

function union<T>(a: T[] | undefined, b: T[] | undefined, key?: (x:T)=>string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const push = (x:T) => {
    const k = key ? key(x) : JSON.stringify(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  };
  (a||[]).forEach(push);
  (b||[]).forEach(push);
  return out;
}

function mergeSocials(a?: MidSocial[], b?: MidSocial[]): MidSocial[] {
  const key = (s: MidSocial) => `${s.platform}:${s.url ?? ""}:${s.handle ?? ""}`.toLowerCase();
  return union(a||[], b||[], key);
}

function applyOwnerWins<T>(cur: T | undefined, incoming: T | undefined, isOwner: boolean): T | undefined {
  if (incoming == null) return cur;
  if (cur == null) return incoming;
  return isOwner ? incoming : cur;
}

function mergePlace(cur: PlaceRecord | null, mid: MidJSON): PlaceRecord {
  const isOwner = mid.verification?.status === "owner";
  const now = nowISO();

  const acceptsIncoming = normalizePayments(mid.submission?.coins_raw || []);

  const next: PlaceRecord = cur ? {...cur} : {
    id: "", // 後で確定
    payment: { accepts: [] },
    verification: { status: "unverified", sources: [] },
    review: { notes: [], category_suggestions: [] }
  };

  // 単項目：空→埋める / Ownerなら上書き / Communityは既存優先
  next.name    = applyOwnerWins(next.name,    mid.place?.name ?? undefined, isOwner);
  next.address = applyOwnerWins(next.address, mid.place?.address ?? undefined, isOwner);
  next.city    = next.city ?? mid.place?.city ?? undefined;
  next.country = next.country ?? (mid.place?.country ? countryCodeLite(mid.place.country) ?? mid.place.country : undefined);
  if (typeof mid.place?.lat === "number" && typeof mid.place?.lng === "number") {
    // 位置は Ownerなら上書き、Communityは既存優先
    if (isOwner || (next.lat == null || next.lng == null)) {
      next.lat = mid.place.lat; next.lng = mid.place.lng;
    }
  }
  next.category = isOwner
    ? (mid.place?.category ?? next.category)
    : (next.category ?? mid.place?.category);

  next.website = applyOwnerWins(next.website, mid.place?.website ?? undefined, isOwner);
  next.phone   = applyOwnerWins(next.phone,   mid.place?.phone   ?? undefined, isOwner);
  next.hours   = applyOwnerWins(next.hours,   mid.place?.hours   ?? undefined, isOwner);

  // socials
  next.socials = mergeSocials(next.socials, mid.place?.socials);

  // payments（AcceptItem[] に統一）
  next.payment = next.payment || { accepts: [] };
  next.payment.accepts = union<AcceptItem>(
    next.payment.accepts || [],
    acceptsIncoming,
    (a) => `${a.asset}:${a.chain}:${a.method || "onchain"}`
  );

  // profile.summary（Owner 600 / Community 300 で切り詰め）
  const curLen = next.profile?.summary?.length ?? 0;
  const incLen = mid.profile?.summary?.length ?? 0;
  const incMax = isOwner ? 600 : 300;
  const incTrim = mid.profile?.summary ? mid.profile.summary.slice(0, incMax) : undefined;
  if (incTrim && incTrim.length >= curLen) {
    next.profile = next.profile ?? {};
    next.profile.summary = incTrim;
  }

  // media.images（新着を先頭。上限 Owner8 / Community4）
  const limit = isOwner ? 8 : 4;

  const existingStrict: MediaImage[] = (next.media?.images || []).filter(
    (x: any): x is MediaImage => x && typeof x.hash === "string" && typeof x.ext === "string"
  );

  const incomingStrict: MediaImage[] =
    ((mid.submission?.images || mid.report?.images || []) as {fileId?: string|null}[])
      .filter(im => !!im.fileId)
      .map(im => ({ hash: im.fileId as string, ext: "jpg" }));

  const mergedImages = union<MediaImage>(incomingStrict, existingStrict, x => `${x.hash}.${x.ext}`);

  next.media = next.media ?? {};
  next.media.images = mergedImages.slice(0, limit);

  // verification
  next.verification = next.verification ?? {};
  next.verification.status = upgradeStatus(next.verification.status, mid.verification?.status) as any;
  next.verification.last_verified = now;
  next.verification.sources = next.verification.sources ?? [];

  // sources 追記（スキーマ enum に合わせて "other" 等で格納）
  if (mid.verification?.status === "owner") {
    next.verification.sources.push({ type: "other", name: "owner-submission", when: now });
  } else if (mid.verification?.status === "community") {
    next.verification.sources.push({ type: "other", name: "community-submission", when: now });
  }
  if (mid.links?.evidence?.length) {
    for (const u of mid.links.evidence) next.verification.sources.push({ type: "other", name: "evidence", url: u, when: now });
  }

  // report 反映（閉店・移転→disputed） ※ top-level status_override に書く
  const reason = mid.report?.reason?.toLowerCase().trim();
  if (reason && /(closed|移転|閉店|moved)/.test(reason)) {
    next.status_override = "disputed";
  }
  // report の proposed は要目視フラグを残して差し替え候補に
  if (mid.report?.proposed) {
    next.review = next.review ?? { notes: [], category_suggestions: [] };
    const r = mid.report.proposed;
    if (r.phone && (!next.phone || !isOwner)) next.phone = r.phone;
    if (r.hours && (!next.hours || !isOwner)) next.hours = r.hours;
    if (r.website && (!next.website || !isOwner)) next.website = r.website;
    if (r.category && !isOwner) next.review.category_suggestions?.push(r.category);
    if (r.coins?.length) {
      const add = normalizePayments(r.coins);
      next.payment.accepts = union<AcceptItem>(next.payment.accepts, add, (a) => `${a.asset}:${a.chain}:${a.method || "onchain"}`);
    }
  }

  return next;
}

/** ===== 都市ファイル I/O ===== */
type CityIndexItem = { country: string; city: string; path: string };
function loadIndex(): CityIndexItem[] { return readJson(INDEX_PATH, <CityIndexItem[]>[]); }
function saveIndex(list: CityIndexItem[]) {
  // アルファベット順
  const sorted = [...list].sort((a,b)=> (a.country+a.city).localeCompare(b.country+b.city));
  writeJson(INDEX_PATH, sorted);
}
function findCityPath(index: CityIndexItem[], country: string, city: string): string | null {
  const hit = index.find(i => i.country === country && i.city === city);
  return hit ? path.join(DATA_ROOT, "places", hit.path) : null;
}
function ensureCityFile(index: CityIndexItem[], country: string, city: string): string {
  let p = findCityPath(index, country, city);
  if (p) return p;
  const citySlug = slugify(city);
  const rel = `${country.toLowerCase()}/${citySlug}.json`;
  const abs = path.join(PLACES_DIR, rel);
  ensureDir(path.dirname(abs));
  if (!fs.existsSync(abs)) writeJson(abs, <PlaceRecord[]>[]);
  index.push({ country, city, path: rel });
  saveIndex(index);
  return abs;
}

/** ===== 実行本体 ===== */
(async function main(){
  ensureDir(LOG_DIR);
  const logPath = path.join(LOG_DIR, `${new Date().toISOString().slice(0,10)}.log`);
  const logs: string[] = [];
  const log = (m:string) => { logs.push(m); console.log(m); };

  const kinds: SubmissionKind[] = ["owner","community","report"];
  const files: string[] = [];
  for (const k of kinds) {
    const dir = path.join(SUBMISSIONS_DIR, k);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) files.push(path.join(dir, f));
    }
  }
  if (!files.length) {
    log("[import] submissions: no files.");
    writeJson(logPath, { at: nowISO(), summary: "no submissions", files: [] });
    process.exit(0);
  }

  const index = loadIndex();
  let added = 0, updated = 0, skipped = 0;

  for (const fp of files.sort()) {
    try {
      const mid = readJson<MidJSON>(fp, null as any);
      if (!mid) { log(`skip: invalid json ${fp}`); skipped++; continue; }

      const kind = mid.meta?.kind as SubmissionKind;
      if (!kind) { log(`skip: no kind ${fp}`); skipped++; continue; }

      // どの都市に入れるか：既存参照が無ければ city/country から決める
      let country = countryCodeLite(mid.place?.country || null);
      const city = mid.place?.city || null;

      if (!country || !city) {
        // listed_ref 経由で既存に当てるパターン等、ここでは city/country 必須扱い
        if (mid.submission?.already_listed) {
          // listed_refで検索して、所属ファイルを見つける（簡易総当り）
          let resolvedPath: string | null = null;
          for (const item of index) {
            const abs = path.join(PLACES_DIR, item.path);
            const list = readJson<PlaceRecord[]>(abs, []);
            const i = pickExistingIndex(list, mid);
            if (i >= 0) { resolvedPath = abs; country = item.country; break; }
          }
          if (!resolvedPath) { log(`skip: cannot resolve city for listed_ref ${fp}`); skipped++; continue; }
        } else {
          log(`skip: missing city/country ${fp}`);
          skipped++;
          continue;
        }
      }

      // 都市ファイルロード／確保
      const cityPath = ensureCityFile(index, country!, city!);
      const cityList = readJson<PlaceRecord[]>(cityPath, []);

      // 既存突合
      let idx = pickExistingIndex(cityList, mid);
      if (idx < 0 && mid.submission?.already_listed) {
        // 既存指定だが見つからない→スキップ（要レビュー）
        log(`skip: listed but not found ${path.basename(fp)}`);
        skipped++;
        continue;
      }

      if (idx >= 0) {
        // 更新
        const merged = mergePlace(cityList[idx], mid);
        merged.id = cityList[idx].id; // 既存ID保持
        cityList[idx] = merged;
        updated++;
        log(`update: ${merged.id} via ${path.basename(fp)} (${kind})`);
      } else {
        // 新規
        const citySlug = slugify(city!);
        const id = genId(country!, citySlug, mid.place?.name ?? null, mid.place?.lat ?? null, mid.place?.lng ?? null);
        const merged = mergePlace(null, mid);
        merged.id = id;
        merged.city = merged.city ?? city!;
        merged.country = merged.country ?? country!;
        cityList.push(merged);
        added++;
        log(`add: ${merged.id} via ${path.basename(fp)} (${kind})`);
      }

      // 保存
      writeJson(cityPath, cityList);

    } catch (e:any) {
      log(`error: ${path.basename(fp)} -> ${e?.message || e}`);
      skipped++;
    }
  }

  writeJson(logPath, { at: nowISO(), summary: { added, updated, skipped }, files: files.map(f=>path.basename(f)) });
  log(`[done] added=${added} updated=${updated} skipped=${skipped} log=${path.relative(process.cwd(), logPath)}`);
})();
