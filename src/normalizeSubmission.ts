// src/normalizeSubmission.ts
// Forms -> place.schema.json-compatible patches.

// ===== 規約 =====
// - country: ISO alpha-2（必ず大文字2文字）
// - address: 末尾の「, City / , CountryName / , CountryCode」を除去し、区切り・空白を整形
// - profile.summary: Owner ≤600 / Community ≤300 に丸める（CI 側でも検証）
// - 可能なら City/Country/CountryCode（フォームの新フィールド）を優先し、従来 city_country は後方互換で利用

export type VerificationStatus = "owner" | "community" | "directory" | "unverified";

export interface ChainsMetaEntry { id: SchemaChain | string; label?: string; aliases?: string[]; }
export interface ChainsMeta { chains: ChainsMetaEntry[]; }

/** ---- フォーム入力（Owner）: 新旧フィールドを両方サポート ---- */
export interface OwnerFormInput {
  // コア
  business_name: string;
  address: string;

  // 新フォーム（優先）
  City?: string; Country?: string; CountryCode?: string;
  city?: string; country?: string; country_code?: string;

  // 旧フィールド（後方互換）
  city_country?: string; // "Tokyo / Japan" など

  website?: string;

  // 旧: 汎用 free-text
  payments: string;

  // 証拠
  payment_pages?: string; // multiline URLs
  owner_proof: string;

  // 既存登録
  already_listed?: "Yes" | "No";
  listed_url_or_id?: string;

  // 位置
  lat_lng?: string;     // "lat,lng"
  lat?: string | number; // 新フォーム対応
  lng?: string | number;

  // プロフィール / 画像 / SNS
  profile_summary?: string;
  gallery_urls?: string; // multiline URLs
  socials?: string;      // optional multiline: "<platform> <url|@handle>"
}

export interface CommunityFormInput {
  business_name: string;
  address?: string;

  // 新フォーム（任意）
  City?: string; Country?: string; CountryCode?: string;
  city?: string; country?: string; country_code?: string;

  website?: string;
  payments: string;
  evidence_urls: string;
  profile_summary?: string;
  gallery_urls?: string;
  socials?: string;
}

export interface ReportFormInput {
  place_id_or_url: string;
  details: string;
  proposed_status?: "disputed" | "hidden";
  evidence_urls?: string;
  images?: string;
}

type SchemaChain =
  | "bitcoin"
  | "lightning"
  | "evm-mainnet"
  | "polygon"
  | "arbitrum"
  | "base"
  | "bsc"
  | "solana"
  | "tron"
  | "ton"
  | "avalanche";

type SocialPlatform =
  | "instagram" | "facebook" | "x" | "tiktok" | "youtube"
  | "telegram" | "whatsapp" | "wechat" | "line" | "threads"
  | "pinterest" | "other";

/** ---- Patch 型（スキーマ準拠） ---- */
export type SourceType =
  | "official_site"
  | "provider_directory"
  | "text"
  | "widget"
  | "receipt"
  | "screenshot"
  | "other";

export type Source = {
  type: SourceType;
  name?: string;
  rule?: string;
  url?: string;
  snippet?: string;
  when?: string;
};

export type PlacePatch = Partial<{
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  country: string; // ISO alpha-2
  address: string;
  website: string | null;
  socials: Array<{ platform: SocialPlatform; url?: string; handle?: string }>;
  payment: {
    accepts: Array<{
      asset: string;
      chain: SchemaChain;
      method?: "onchain" | "lightning" | "lnurl" | "bolt12" | "other";
      processor?: "btcpay" | "opennode" | "strike" | "coinbase-commerce" | "nowpayments" | "bitpay" | "self-hosted" | "other";
      note?: string;
    }>;
    preferred?: string[];
  };
  verification: {
    status: VerificationStatus;
    sources?: Source[];
    submitted?: { by: string; role: "owner" | "non_owner" | "unknown"; at: string };
    review?: { status: "approved" | "rejected" | "pending"; by?: string; at?: string; notes?: string };
    last_checked?: string;
    last_verified?: string;
  };
  profile?: { summary?: string };
  media?: { images?: Array<{ url: string; credit?: string; caption?: string }> };
  status_override?: "disputed" | "hidden" | "none";
  notes_mod?: string;
}>;

export interface NormalizeResult {
  patch: PlacePatch;
  rejects: Array<{ raw: string; reason: string }>;
}

/* ========================================================================== */
/* Public API                                                                 */
/* ========================================================================== */

export function normalizeOwnerForm(
  input: OwnerFormInput,
  chainsMeta: ChainsMeta,
  nowISO = new Date().toISOString()
): NormalizeResult {
  const { accepts, rejects } = parsePaymentsBlock(input.payments, chainsMeta);
  const sources = mergeEvidence(input.payment_pages, input.website, nowISO);
  const media = parseImages(input.gallery_urls, 8);
  const socials = parseSocials(input.socials);

  // ====== City / Country / Address 正規化 ======
  const rawCity = coalesce(input.City, input.city) || parseCityFromCityCountry(input.city_country);
  const { alpha2, countryNameGuess } = normalizeCountry(
    coalesce(input.CountryCode, input.country_code),
    coalesce(input.Country, input.country)
  );
  const normalizedAddress = normalizeAddress((input.address || "").trim(), rawCity, countryNameGuess, alpha2);

  // ====== 緯度経度（新旧両対応） ======
  const coords = parseLatLng(input.lat_lng) ?? parseLatLngLoose(input.lat, input.lng);

  const patch: PlacePatch = {
    name: (input.business_name || "").trim(),
    city: rawCity || undefined,
    country: alpha2 || undefined,
    address: normalizedAddress,
    website: orNull(input.website),
    payment: { accepts, preferred: derivePreferred(accepts) },
    verification: {
      status: "owner",
      sources,
      submitted: { by: "github:owner", role: "owner", at: nowISO },
      last_checked: nowISO
    },
    // サマリは CI の上限に合わせて丸める（Owner 600）
    profile: input.profile_summary ? { summary: squeeze(input.profile_summary, 600) } : undefined,
    media: media.length ? { images: media } : undefined
  };
  if (coords) { patch.lat = coords.lat; patch.lng = coords.lng; }
  if (socials.length) patch.socials = socials;

  return { patch, rejects };
}

export function normalizeCommunityForm(
  input: CommunityFormInput,
  chainsMeta: ChainsMeta,
  nowISO = new Date().toISOString()
): NormalizeResult {
  const { accepts, rejects } = parsePaymentsBlock(input.payments, chainsMeta);
  const sources = mergeEvidence(input.evidence_urls, input.website, nowISO);
  const media = parseImages(input.gallery_urls, 4);
  const socials = parseSocials(input.socials);

  const rawCity = coalesce(input.City, input.city) || undefined;
  const { alpha2, countryNameGuess } = normalizeCountry(
    coalesce(input.CountryCode, input.country_code),
    coalesce(input.Country, input.country)
  );
  const normalizedAddress = normalizeAddress((input.address || "").trim(), rawCity, countryNameGuess, alpha2);

  const patch: PlacePatch = {
    name: (input.business_name || "").trim(),
    city: rawCity || undefined,
    country: alpha2 || undefined,
    address: normalizedAddress || undefined,
    website: orNull(input.website),
    payment: { accepts, preferred: derivePreferred(accepts) },
    verification: {
      status: "community",
      sources,
      submitted: { by: "github:community", role: "non_owner", at: nowISO },
      last_checked: nowISO
    },
    // サマリは CI の上限に合わせて丸める（Community 300）
    profile: input.profile_summary ? { summary: squeeze(input.profile_summary, 300) } : undefined,
    media: media.length ? { images: media } : undefined
  };
  if (socials.length) patch.socials = socials;

  return { patch, rejects };
}

export function normalizeReportForm(
  input: ReportFormInput,
  nowISO = new Date().toISOString()
): NormalizeResult {
  const imgs = parseImages(input.images || input.evidence_urls, 12);
  const sources = toUrlList(input.evidence_urls).map((u) => toSource(u, nowISO));
  const patch: PlacePatch = {
    verification: {
      status: "unverified",
      sources,
      submitted: { by: "github:reporter", role: "unknown", at: nowISO },
      last_checked: nowISO
    },
    notes_mod: squeeze(input.details || "", 1000),
    status_override: input.proposed_status || "none"
  };
  if (imgs.length) patch.media = { images: imgs };
  return { patch, rejects: [] };
}

/* ========================================================================== */
/* Payments parsing                                                            */
/* ========================================================================== */

/** このファイル内で実際に生成する accepts の型（狭い定義） */
type AcceptEntry = { asset: string; chain: SchemaChain; method: "onchain" | "lightning" };

const KNOWN_SCHEMA_CHAINS: SchemaChain[] = [
  "bitcoin","lightning","evm-mainnet","polygon","arbitrum","base","bsc","solana","tron","ton","avalanche"
];

const FALLBACK_ALIAS_TABLE: Record<string, SchemaChain> = {
  bitcoin: "bitcoin", btc: "bitcoin", onchain: "bitcoin", "on-chain": "bitcoin",
  lightning: "lightning", ln: "lightning", bolt11: "lightning", bolt12: "lightning",
  evm: "evm-mainnet", ethereum: "evm-mainnet", "ethereum mainnet": "evm-mainnet", "eth mainnet": "evm-mainnet", "eip155:1": "evm-mainnet",
  polygon: "polygon", matic: "polygon", "eip155:137": "polygon",
  arbitrum: "arbitrum", "arbitrum one": "arbitrum", "eip155:42161": "arbitrum",
  base: "base", "eip155:8453": "base",
  bsc: "bsc", "bnb smart chain": "bsc", "binance smart chain": "bsc", "eip155:56": "bsc", bep20: "bsc",
  solana: "solana", sol: "solana",
  tron: "tron", trc20: "tron",
  ton: "ton",
  avalanche: "avalanche", avax: "avalanche", "c-chain": "avalanche", "eip155:43114": "avalanche"
};

function parsePaymentsBlock(
  text: string,
  chainsMeta: ChainsMeta
): { accepts: AcceptEntry[]; rejects: Array<{ raw: string; reason: string }>; } {
  const lines = toLines(text);
  const accepts: AcceptEntry[] = [];
  const rejects: Array<{ raw: string; reason: string }> = [];

  for (const raw of lines) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) continue;

    const parsed = parseAssetChain(s);
    if (!parsed) { rejects.push({ raw, reason: "unparseable" }); continue; }

    const asset = normalizeAsset(parsed.asset);
    if (!asset) { rejects.push({ raw, reason: "invalid-asset" }); continue; }

    const chain = normalizeChain(parsed.chain, chainsMeta);
    if (!chain) { rejects.push({ raw, reason: "unsupported-chain" }); continue; }

    const method: AcceptEntry["method"] = chain === "lightning" ? "lightning" : "onchain";
    if (method === "lightning" && asset !== "BTC") {
      rejects.push({ raw, reason: "lightning-requires-btc" });
      continue;
    }

    accepts.push({ asset, chain, method });
  }

  // dedupe by asset+chain
  const uniq = new Map<string, AcceptEntry>();
  for (const a of accepts) uniq.set(`${a.asset}__${a.chain}`, a);
  return { accepts: Array.from(uniq.values()), rejects };
}

function parseAssetChain(s: string): { asset: string; chain: string } | null {
  const m1 = /^([A-Za-z0-9]+)\s*\(([^)]+)\)$/.exec(s); // "ASSET (Chain..., ...)"
  if (m1) return { asset: m1[1], chain: m1[2].split(",")[0].trim() };
  const partsSlash = s.split("/").map((x) => x.trim());
  if (partsSlash.length === 2 && /^[A-Za-z0-9]+$/.test(partsSlash[0])) return { asset: partsSlash[0], chain: partsSlash[1] };
  const partsGap = s.split(/\s{2,}|\t+/).map((x) => x.trim());
  if (partsGap.length >= 2 && /^[A-Za-z0-9]+$/.test(partsGap[0])) return { asset: partsGap[0], chain: partsGap.slice(1).join(" ") };
  return null;
}

function normalizeAsset(asset: string): string | null {
  const a = (asset || "").trim().toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(a) ? a : null;
}

function normalizeChain(chainText: string, chainsMeta: ChainsMeta): SchemaChain | null {
  const q = (chainText || "").trim().toLowerCase();
  const fromMeta = findInChainsMeta(q, chainsMeta);
  if (fromMeta) return fromMeta;
  if (q in FALLBACK_ALIAS_TABLE) return FALLBACK_ALIAS_TABLE[q];
  const cleaned = q.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned in FALLBACK_ALIAS_TABLE) return FALLBACK_ALIAS_TABLE[cleaned];
  if ((KNOWN_SCHEMA_CHAINS as readonly string[]).includes(q)) return q as SchemaChain;
  return null; // drop unknown
}

function findInChainsMeta(q: string, meta: ChainsMeta): SchemaChain | null {
  const norm = (s: string) => (s || "").trim().toLowerCase();
  for (const e of meta.chains || []) {
    if (!e?.id) continue;
    const id = e.id as SchemaChain;
    if (!KNOWN_SCHEMA_CHAINS.includes(id)) continue;
    if (norm(String(e.id)) === q) return id;
    if (e.label && norm(e.label) === q) return id;
    for (const al of e.aliases || []) if (norm(al) === q) return id;
  }
  return null;
}

function derivePreferred(accepts: AcceptEntry[]): string[] {
  const score = (a: { asset: string; chain: SchemaChain }) =>
    a.asset === "BTC" && a.chain === "lightning" ? 100 :
    a.asset === "BTC" && a.chain === "bitcoin" ? 90 :
    a.asset === "ETH" && a.chain === "evm-mainnet" ? 80 : 10;
  return [...accepts].sort((x, y) => score(y) - score(x)).map((a) => `${a.asset}:${a.chain}`);
}

/* ========================================================================== */
/* Evidence / Socials                                                          */
/* ========================================================================== */

function toSourceType(t?: string): SourceType {
  const k = (t || "").trim().toLowerCase();
  switch (k) {
    case "official_site": return "official_site";
    case "provider_directory": return "provider_directory";
    case "text": return "text";
    case "widget": return "widget";
    case "receipt": return "receipt";
    case "screenshot": return "screenshot";
    default: return "other";
  }
}

function mergeEvidence(block?: string, website?: string, whenISO?: string): Source[] {
  const out: Source[] = toUrlList(block).map((u) => toSource(u, whenISO));
  if (website) out.unshift(toSource(website, whenISO, "official_site"));
  const m = new Map(out.map((s) => [s.url || "", s]));
  return Array.from(m.values()).filter((s) => !!s.url);
}

function toSource(
  url: string,
  whenISO?: string,
  forcedType?: SourceType
): Source {
  const u = safeUrl(url);
  const host = u?.hostname || "";
  const inferred: SourceType =
    forcedType ??
    (host.includes("btcpay") || host.includes("coinbase")) ? "provider_directory" :
    (host.includes("x.com") || host.includes("twitter.com")) ? "text" :
    "other";
  return { type: toSourceType(inferred), name: host || "source", url: u ? u.toString() : undefined, when: whenISO };
}

function parseImages(block?: string, max = 8) {
  return toUrlList(block).slice(0, max).map((u) => ({ url: u }));
}

function parseSocials(block?: string): NonNullable<PlacePatch["socials"]> {
  const out: NonNullable<PlacePatch["socials"]> = [];
  for (const line of toLines(block)) {
    const tokens = line.trim().split(/\s+/);
    if (!tokens.length) continue;
    const platform = normalizePlatform(tokens[0]);
    if (!platform) continue;
    const rest = line.trim().slice(tokens[0].length).trim();
    const url = looksLikeUrl(rest) ? rest : undefined;
    const handle = !url && rest.startsWith("@") ? rest : undefined;
    const item: { platform: SocialPlatform; url?: string; handle?: string } = { platform };
    if (url) item.url = url;
    if (handle) item.handle = handle;
    if (item.url || item.handle) out.push(item);
  }
  return out;
}

function normalizePlatform(p: string): SocialPlatform | null {
  const k = (p || "").trim().toLowerCase();
  const table: Record<string, SocialPlatform> = {
    instagram: "instagram", ig: "instagram",
    facebook: "facebook", fb: "facebook",
    x: "x", twitter: "x",
    tiktok: "tiktok",
    youtube: "youtube", yt: "youtube",
    telegram: "telegram", tg: "telegram",
    whatsapp: "whatsapp",
    wechat: "wechat",
    line: "line",
    threads: "threads",
    pinterest: "pinterest"
  };
  return table[k] || "other";
}

/* ========================================================================== */
/* Country / Address 正規化                                                    */
/* ========================================================================== */

function coalesce<T>(...vals: (T | undefined)[]): T | undefined {
  for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== "") return v as T; }
  return undefined;
}

// lazy load countries.json (名前/別名 → ISO2)
let _countriesDictCache: Record<string, string> | null = null;
function loadCountriesDict(): Record<string, string> {
  if (_countriesDictCache) return _countriesDictCache;
  try {
    // dynamic import to avoid bundler complaints
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path") as typeof import("path");
    const p = require.resolve
      ? ((): string | null => {
          const cand = path.resolve(process.cwd(), "public/data/meta/countries.json");
          return fs.existsSync(cand) ? cand : null;
        })()
      : null;
    if (!p) { _countriesDictCache = {}; return _countriesDictCache; }
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);

    // 想定フォーマット（柔軟に吸収）:
    // [{ name: "Japan", alpha2: "JP", aliases: ["日本","jp"] }, ...]
    const dict: Record<string, string> = {};
    const lc = (s: any) => String(s || "").trim().toLowerCase();
    if (Array.isArray(data)) {
      for (const it of data) {
        const code = String(it?.alpha2 || it?.["alpha-2"] || "").toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) continue;
        const names: string[] = [];
        if (it?.name) names.push(String(it.name));
        if (Array.isArray(it?.aliases)) names.push(...it.aliases.map(String));
        if (Array.isArray(it?.alt_names)) names.push(...it.alt_names.map(String));
        if (Array.isArray(it?.altNames)) names.push(...it.altNames.map(String));
        // 自身のコードや lower 版も一応
        names.push(code, code.toLowerCase());
        for (const n of names) {
          const key = lc(n);
          if (key) dict[key] = code;
        }
      }
    }
    _countriesDictCache = dict;
    return _countriesDictCache;
  } catch {
    _countriesDictCache = {};
    return _countriesDictCache;
  }
}

function normalizeCountry(codeMaybe?: string, nameMaybe?: string): { alpha2?: string; countryNameGuess?: string } {
  const code = (codeMaybe || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return { alpha2: code };

  const name = (nameMaybe || "").trim();
  if (!name) return {};

  // まず countries.json を見る
  const dict = loadCountriesDict();
  const iso2FromFile = dict[String(name).toLowerCase()];
  if (iso2FromFile) return { alpha2: iso2FromFile, countryNameGuess: name };

  // 最低限の内蔵辞書（フォールバック）
  const fallback: Record<string, string> = {
    japan: "JP", 日本: "JP", jp: "JP",
    italy: "IT", italia: "IT", it: "IT",
    "united states": "US", usa: "US", us: "US", america: "US",
    "united kingdom": "GB", uk: "GB", britain: "GB", "great britain": "GB",
    germany: "DE", deutschland: "DE", de: "DE",
    france: "FR", fr: "FR",
    spain: "ES", españa: "ES", es: "ES",
    korea: "KR", "south korea": "KR", 대한민국: "KR", 韓国: "KR", kr: "KR",
    china: "CN", 中国: "CN", cn: "CN",
    taiwan: "TW", 台灣: "TW", tw: "TW",
    "hong kong": "HK", hk: "HK",
    russia: "RU", "russian federation": "RU", ru: "RU",
    "vatican city": "VA", "holy see": "VA", va: "VA"
  };
  const key = name.toLowerCase();
  if (fallback[key]) return { alpha2: fallback[key], countryNameGuess: name };

  return { countryNameGuess: name };
}

function normalizeAddress(address: string, city?: string, countryName?: string, countryAlpha2?: string): string {
  if (!address) return "";

  const parts = address.split(",").map(s => s.trim()).filter(Boolean);
  let core = parts.join(", ");

  // 除去対象（大小/前後空白を無視）
  const tailCandidates: string[] = [];
  if (city) tailCandidates.push(city);
  if (countryName) tailCandidates.push(countryName);
  if (countryAlpha2) tailCandidates.push(countryAlpha2);

  for (const cand of tailCandidates) {
    const re = new RegExp(`(?:,\\s*)?${escapeRegExp(cand)}\\.?$`, "i");
    core = core.replace(re, "");
  }

  // 典型パターン: "Tokyo / Japan", "Rome / IT" のような末尾の国表記
  if (city) {
    const reCity = new RegExp(`(?:,\\s*|\\s*/\\s*)${escapeRegExp(city)}\\.?$`, "i");
    core = core.replace(reCity, "");
  }
  if (countryName) {
    const reCn = new RegExp(`(?:,\\s*|\\s*/\\s*)${escapeRegExp(countryName)}\\.?$`, "i");
    core = core.replace(reCn, "");
  }
  if (countryAlpha2) {
    const reCc = new RegExp(`(?:,\\s*|\\s*/\\s*)${escapeRegExp(countryAlpha2)}\\.?$`, "i");
    core = core.replace(reCc, "");
  }

  // 区切り整形: 連続カンマ/空白 → 単一化、前後の , を除去
  core = core.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").replace(/^,\s*|\s*,\s*$/g, "");
  return core.trim();
}

function parseCityFromCityCountry(s?: string): string | undefined {
  if (!s) return;
  // 例: "Tokyo / Japan", "Rome / IT"
  const m = String(s).split("/").map(x => x.trim());
  if (m.length >= 1 && m[0]) return m[0];
  return;
}

/* ========================================================================== */
/* Utils                                                                       */
/* ========================================================================== */

function toLines(block?: string): string[] {
  if (!block) return [];
  return block.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function toUrlList(block?: string): string[] {
  return toLines(block).filter((l) => looksLikeUrl(l)).map((l) => l.trim());
}

function looksLikeUrl(s: string): boolean { return /^https?:\/\//i.test((s || "").trim()); }
function safeUrl(s?: string): URL | undefined { try { return s ? new URL(s.trim()) : undefined; } catch { return; } }
function squeeze(s: string, max: number): string { const t = (s || "").trim(); return t.length <= max ? t : t.slice(0, max); }
function orNull(s?: string): string | null { const t = (s || "").trim(); return t ? t : null; }
function parseLatLng(s?: string): { lat: number; lng: number } | null {
  if (!s) return null;
  const m = s.split(",").map((x) => x.trim());
  if (m.length !== 2) return null;
  const lat = Number(m[0]); const lng = Number(m[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
function parseLatLngLoose(lat?: string | number, lng?: string | number): { lat: number; lng: number } | null {
  if (lat === undefined || lng === undefined || lat === null || lng === null) return null;
  const la = Number(lat); const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : null;
}
function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
