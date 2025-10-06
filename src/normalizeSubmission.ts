// src/normalizeSubmission.ts
// Forms -> place.schema.json-compatible patches.

export type VerificationStatus = "owner" | "community" | "directory" | "unverified";

export interface ChainsMetaEntry { id: SchemaChain | string; label?: string; aliases?: string[]; }
export interface ChainsMeta { chains: ChainsMetaEntry[]; }

export interface OwnerFormInput {
  business_name: string;
  address: string;
  website?: string;
  payments: string;            // multiline free-text
  payment_pages?: string;      // multiline URLs as evidence
  already_listed?: "Yes" | "No";
  listed_url_or_id?: string;
  city_country?: string;
  lat_lng?: string;            // "lat,lng"
  owner_proof: string;
  profile_summary?: string;
  gallery_urls?: string;       // multiline URLs
  socials?: string;            // optional multiline: "<platform> <url|@handle>"
}

export interface CommunityFormInput {
  business_name: string;
  address?: string;
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
  country: string;
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

  const patch: PlacePatch = {
    name: (input.business_name || "").trim(),
    address: (input.address || "").trim(),
    website: orNull(input.website),
    payment: { accepts, preferred: derivePreferred(accepts) },
    verification: {
      status: "owner",
      sources,
      submitted: { by: "github:owner", role: "owner", at: nowISO },
      last_checked: nowISO
    },
    profile: input.profile_summary ? { summary: squeeze(input.profile_summary, 2000) } : undefined,
    media: media.length ? { images: media } : undefined
  };
  const coords = parseLatLng(input.lat_lng);
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

  const patch: PlacePatch = {
    name: (input.business_name || "").trim(),
    address: (input.address || "").trim(),
    website: orNull(input.website),
    payment: { accepts, preferred: derivePreferred(accepts) },
    verification: {
      status: "community",
      sources,
      submitted: { by: "github:community", role: "non_owner", at: nowISO },
      last_checked: nowISO
    },
    profile: input.profile_summary ? { summary: squeeze(input.profile_summary, 2000) } : undefined,
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
