#!/usr/bin/env ts-node
/* eslint-disable no-console */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { glob } from "glob";
import crypto from "crypto";
import { sendMail } from "../src/lib/mail"; // ★ 追加：共通メールユーティリティ

// ===== パス設定 =====
const DATA_ROOT = path.resolve("public", "data");
const SUBMISSIONS_DIRS = [
  path.join(DATA_ROOT, "submissions", "owner"),
  path.join(DATA_ROOT, "submissions", "community"),
  path.join(DATA_ROOT, "submissions", "report"),
];
const PLACES_DIR = path.join(DATA_ROOT, "places");      // 国/都市ごとの最終JSON（配列）
const INDEX_PATH = path.join(DATA_ROOT, "index.json");  // 都市一覧（{country, city, path}[]）
const LOG_DIR = path.join(DATA_ROOT, "logs", "promote");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// ===== Utils =====
const ensureDir = (p: string) => fs.mkdirSync(p, { recursive: true });
const readJson = <T = any>(p: string, fallback: T): T => {
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

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// country を ISO2 に寄せる軽量変換（小文字key）
function countryCodeLite(country?: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toLowerCase();
  const map: Record<string, string> = {
    usa: "US", "united states": "US", "united states of america": "US", us: "US",
    japan: "JP", jp: "JP", jpn: "JP",
    "united kingdom": "GB", uk: "GB", gb: "GB", gbr: "GB",
    france: "FR", fr: "FR", fra: "FR",
  };
  if (map[c]) return map[c];
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return c.slice(0, 2).toUpperCase();
}

// ===== 型（最低限） =====
type Submission = {
  meta: { kind: "owner" | "community" | "report"; timestamp?: string; ref?: string; notified_approved_at?: string };
  id?: string;
  name?: string;
  fields: Record<string, any>;
  location?: { country?: string; city?: string; address?: string };
  proposed?: { lat?: number; lng?: number; source?: "form" };
  external_ids?: Record<string, string>;
  submission?: { images?: Array<{ url?: string; fileId?: string; bytes?: number; type?: string }> };
  submitted_email?: string | null; // app/submit/owner で入る場合あり
};

type MidSocial = { platform: string; handle: string | null; url: string | null };
type MediaImage = { hash: string; ext: string; caption?: string };

type AcceptItem = {
  asset: string; // "BTC" | "ETH" | ...
  chain: string; // labels: bitcoin/ethereum/polygon/.../lightning/other
  method?: "onchain" | "lightning" | "lnurl" | "bolt12" | "other";
  processor?: "btcpay" | "opennode" | "strike" | "coinbase-commerce" | "nowpayments" | "bitpay" | "self-hosted" | "other";
  note?: string;
};

type PlaceRecord = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  country?: string; // alpha-2
  website?: string | null;
  phone?: string | null;
  hours?: string | null;
  category?: string | null;

  socials?: MidSocial[];
  payment?: { accepts: AcceptItem[]; preferred?: string[]; notes?: string };
  profile?: { summary?: string };
  media?: { images?: MediaImage[] };

  verification: {
    status: "owner" | "community" | "directory" | "unverified";
    last_verified?: string;
    sources?: {
      type?: "official_site" | "provider_directory" | "text" | "widget" | "receipt" | "screenshot" | "other";
      name?: string; url?: string; when?: string
    }[];
  };

  // スキーマでは top-level
  status_override?: "disputed" | "hidden" | "none";

  location?: { source?: "owner_gps" | "geocode" | "osm" | "ops_fix"; confidence?: "high" | "med" | "low" };
  history?: Array<{
    at: string; by?: string;
    type: "position_change" | "edit" | "close";
    from?: { lat: number; lng: number };
    to?: { lat: number; lng: number };
    reason?: string;
    evidence?: string[];
  }>;
  [k: string]: any;
};

// ===== accepts 正規化（スキーマ準拠） =====
function parseAccepted(input: string): AcceptItem[] {
  if (!input) return [];
  // 例: "BTC, ETH, USDT (Polygon)" / 改行や | 区切りも許可
  const chunks = input
    .split(/[,|]/).flatMap((s) => s.split(/\n/))
    .map((s) => s.trim()).filter(Boolean);

  const out: AcceptItem[] = [];
  const push = (a: Partial<AcceptItem>) => {
    const asset = String(a.asset || "").toUpperCase();
    const chain = String(a.chain || "").toLowerCase();
    if (!asset) return;
    const method: AcceptItem["method"] = chain === "lightning" ? "lightning" : "onchain";
    out.push({
      asset,
      chain: chain || (asset === "BTC" ? "bitcoin" : asset === "ETH" ? "ethereum" : "other"),
      method,
      processor: "other",
    });
  };

  for (const ch of chunks) {
    const m = ch.match(/^([A-Za-z0-9.+-]+)(?:\s*\(([^)]+)\))?$/);
    if (m) {
      const asset = m[1].toUpperCase();
      const rawChain = (m[2] || "").trim().toLowerCase();
      const chain =
        rawChain === "btc" || rawChain === "bitcoin" ? "bitcoin" :
        rawChain === "eth" || rawChain === "ethereum" ? "ethereum" :
        rawChain === "lightning" ? "lightning" :
        rawChain === "polygon" || rawChain === "matic" ? "polygon" :
        rawChain === "bsc" || rawChain === "bnb" ? "bsc" :
        rawChain === "arbitrum" ? "arbitrum" :
        rawChain === "base" ? "base" :
        rawChain === "sol" || rawChain === "solana" ? "solana" :
        rawChain === "tron" || rawChain === "trc20" ? "tron" :
        rawChain || "";
      push({ asset, chain });
      continue;
    }
    const bare = ch.toUpperCase();
    if (bare) push({ asset: bare });
  }

  // 重複除去（asset+chain+method）
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = `${a.asset}:${a.chain}:${a.method || "onchain"}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ===== 既存レコード突合 =====
function pickExistingIndex(cityList: PlaceRecord[], sub: Submission): number {
  // 1) 明示 ID
  const pid = String(sub.fields?.["placeId"] || sub.id || "").trim();
  if (pid) {
    const i = cityList.findIndex((p) => p.id === pid);
    if (i >= 0) return i;
  }
  // 2) 名前一致 + 近接（±50m）
  const name = String(
    sub.fields?.["BusinessName"] ??
    sub.fields?.["Business name"] ??
    sub.fields?.["placeName"] ??
    sub.name ??
    ""
  ).trim().toLowerCase();
  const lat = sub.proposed?.lat ?? null;
  const lng = sub.proposed?.lng ?? null;
  if (name && typeof lat === "number" && typeof lng === "number") {
    for (let i = 0; i < cityList.length; i++) {
      const p = cityList[i];
      if (!p.name) continue;
      if (p.name.trim().toLowerCase() !== name) continue;
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      const d = haversineMeters({ lat, lng }, { lat: p.lat, lng: p.lng });
      if (d <= 50) return i;
    }
  }
  return -1;
}

// ===== ID 生成（都市スタイル用） =====
function genId(country: string, citySlug: string, name?: string | null, lat?: number | null, lng?: number | null): string {
  const base = `${country}-${citySlug}-${slugify(name) || "place"}`;
  const h = crypto.createHash("sha1")
    .update(`${name ?? ""}|${lat ?? ""}|${lng ?? ""}|${Date.now()}`)
    .digest("base64url")
    .slice(0, 6);
  return `${base}-${h}`;
}

// ===== index & city I/O =====
type CityIndexItem = { country: string; city: string; path: string };
function loadIndex(): CityIndexItem[] { return readJson(INDEX_PATH, <CityIndexItem[]>[]); }
function saveIndex(list: CityIndexItem[]) {
  const sorted = [...list].sort((a, b) => (a.country + a.city).localeCompare(b.country + b.city));
  writeJson(INDEX_PATH, sorted);
}
function findCityPath(index: CityIndexItem[], country: string, city: string): string | null {
  const hit = index.find((i) => i.country === country && i.city === city);
  return hit ? path.join(PLACES_DIR, hit.path) : null;
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

// ===== マージヘルパ =====
function union<T>(a: T[] | undefined, b: T[] | undefined, key?: (x: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const push = (x: T) => {
    const k = key ? key(x) : JSON.stringify(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  };
  (a || []).forEach(push);
  (b || []).forEach(push);
  return out;
}

// ===== 承認メール（申請者） =====
function getSubmitterEmail(sub: Submission): string {
  const f = sub.fields || {};
  const cand = [
    (sub as any).submitted_email,
    f["SubmitterEmail"], f["submitterEmail"], f["submitter_email"],
    f["Submitter email"], f["Submitter E-mail"], f["Email"], f["email"]
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find((x) => !!x);
  return cand || "";
}

async function maybeNotifyApproved(opts: {
  subPath: string;
  sub: Submission;
  placeId: string;
  placeName: string;
  city?: string | null;
  country?: string | null;
}) {
  // 二重送信防止
  const meta = (opts.sub.meta || {}) as Submission["meta"];
  if (meta.notified_approved_at) return;

  const to = getSubmitterEmail(opts.sub);
  if (!to) return;

  const url =
    `${(BASE_URL || "").replace(/\/+$/, "")}/?select=${encodeURIComponent(opts.placeId)}`;

  try {
    await sendMail({
      to,
      subject: `Your place was approved — ${opts.placeName}`,
      text:
`Good news! Your place has been approved and published on CryptoPayMap.

Business: ${opts.placeName}
Location: ${(opts.city || "")} ${(opts.country || "")}
Link: ${url}

If you need to update or remove the listing, just reply to this email.

— CryptoPayMap`,
    });

    // フラグ付けて submission を上書き保存（再実行で重複送信しない）
    (opts.sub.meta as any).notified_approved_at = nowISO();
    writeJson(opts.subPath, opts.sub);
  } catch (e: any) {
    console.error(`[mail] approval notify failed for ${opts.placeId}:`, e?.message || e);
  }
}

// ===== Main =====
(async function main() {
  ensureDir(LOG_DIR);
  const logPath = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`);
  const logs: string[] = [];
  const log = (m: string) => { logs.push(m); console.log(m); };

  const index = loadIndex();

  // 収集
  const files: string[] = SUBMISSIONS_DIRS.flatMap((d) => glob.sync(`${d}/*.json`));
  if (!files.length) {
    log("[promote] submissions: no files.");
    writeJson(logPath, { at: nowISO(), summary: "no submissions", files: [] });
    process.exit(0);
  }

  let added = 0, updated = 0, skipped = 0;

  for (const fp of files.sort()) {
    try {
      const sub = readJson<Submission>(fp, null as any);
      if (!sub) { log(`skip: invalid json ${fp}`); skipped++; continue; }

      // kind & 位置
      const kind = sub.meta?.kind;
      if (!kind || (kind !== "owner" && kind !== "community" && kind !== "report")) {
        log(`skip: unknown kind ${fp}`); skipped++; continue;
      }

      // country / city 必須
      const country = countryCodeLite(sub.location?.country || null);
      const city = sub.location?.city || null;
      if (!country || !city) {
        log(`skip: missing city/country ${path.basename(fp)}`);
        skipped++;
        continue;
      }

      // 都市ファイルロード
      const cityPath = ensureCityFile(index, country, city);
      const list = readJson<PlaceRecord[]>(cityPath, []);

      // 既存突合
      const idx = pickExistingIndex(list, sub);
      const isOwner = kind === "owner";
      const isCommunity = kind === "community";

      // 基本項目
      const name =
        String(
          sub.fields?.["BusinessName"] ??
          sub.fields?.["Business name"] ??
          sub.fields?.["placeName"] ??
          sub.name ??
          ""
        ).trim() || "Unnamed";

      const address = String(sub.location?.address || "").trim() || undefined;

      // 座標：owner提案を優先（このスクリプトでは geocode しない）
      const lat = typeof sub.proposed?.lat === "number" ? sub.proposed!.lat! : undefined;
      const lng = typeof sub.proposed?.lng === "number" ? sub.proposed!.lng! : undefined;

      // 連絡先・カテゴリ等
      const website =
        (["Website", "OfficialWebsite", "Official website", "website"]
          .map((k) => sub.fields?.[k]).find((v) => v != null) ?? null) as string | null;

      const hours = (["Hours", "OpeningHours", "opening_hours"].map((k) => sub.fields?.[k]).find((v) => v != null) ?? null) as string | null;
      const phone = (["Phone", "Contact", "Tel", "Telephone"].map((k) => sub.fields?.[k]).find((v) => v != null) ?? null) as string | null;

      const category = (() => {
        const cat = String(sub.fields?.["Category"] ?? "").trim();
        const other = String(sub.fields?.["CategoryOther"] ?? "").trim();
        if (cat) return cat;
        if (other) return "Other";
        return null;
      })();

      // Payments
      const acceptedRaw = String(sub.fields?.["Accepted"] ?? sub.fields?.["Coins"] ?? sub.fields?.["Crypto"] ?? "");
      const accepts = parseAccepted(acceptedRaw);

      // Media（提出画像の fileId を hash として保持。実ファイル処理は別フェーズ）
      const incomingImages: MediaImage[] = (sub.submission?.images || [])
        .filter((x) => !!x.fileId)
        .map((x) => ({ hash: String(x.fileId), ext: "jpg" }));

      if (idx >= 0) {
        // 既存更新
        const cur = list[idx];

        // 位置：owner で ±30m 以内は自動更新、その他は履歴のみ
        if (typeof lat === "number" && typeof lng === "number" && typeof cur.lat === "number" && typeof cur.lng === "number") {
          const d = haversineMeters({ lat, lng }, { lat: cur.lat, lng: cur.lng });
          if (isOwner && d <= 30) {
            const prev = { lat: cur.lat, lng: cur.lng };
            cur.lat = lat; cur.lng = lng;
            cur.location = { ...(cur.location || {}), source: "owner_gps", confidence: "high" };
            cur.history = cur.history || [];
            cur.history.push({
              at: nowISO(), by: "owner", type: "position_change",
              from: prev, to: { lat, lng }, reason: "owner small shift",
            });
          } else if (d > 30 && d <= 500) {
            cur.history = cur.history || [];
            cur.history.push({
              at: nowISO(), by: isOwner ? "owner" : "community",
              type: "edit",
              reason: `proposed medium shift ~${Math.round(d)}m`,
            });
          }
        }

        // 単項目：空なら補完。Owner は上書き許容。
        const ownerWins = <T>(base: T | undefined, inc: T | undefined) =>
          inc == null ? base : isOwner ? inc : (base ?? inc);

        cur.name = ownerWins(cur.name, name)!;
        cur.address = ownerWins(cur.address, address);
        cur.city = cur.city ?? city;
        cur.country = cur.country ?? country;

        cur.website = ownerWins(cur.website ?? null, website ?? null) ?? null;
        cur.hours = ownerWins(cur.hours ?? null, hours ?? null) ?? null;
        cur.phone = ownerWins(cur.phone ?? null, phone ?? null) ?? null;
        cur.category = ownerWins(cur.category ?? null, category ?? null) ?? null;

        // accepts / images ユニオン
        cur.payment = cur.payment || { accepts: [] };
        cur.payment.accepts = union<AcceptItem>(cur.payment.accepts || [], accepts, (a) => `${a.asset}:${a.chain}:${a.method || "onchain"}`);

        cur.media = cur.media || {};
        cur.media.images = union<MediaImage>(cur.media.images || [], incomingImages, (x) => `${x.hash}.${x.ext}`);

        // verification
        cur.verification = cur.verification || { status: "unverified", sources: [] };
        const nextStatus = isOwner ? "owner" : isCommunity ? "community" : cur.verification.status || "unverified";
        const rank = (s: string) => ["unverified", "directory", "community", "owner"].indexOf((s || "unverified").toLowerCase());
        if (rank(nextStatus) > rank(cur.verification.status)) cur.verification.status = nextStatus as any;
        cur.verification.last_verified = nowISO();
        cur.verification.sources = cur.verification.sources || [];
        cur.verification.sources.push({ type: "other", name: `${kind}-submission`, when: nowISO() });

        // 保存
        list[idx] = cur;
        writeJson(cityPath, list);
        updated++;
        log(`[EDIT] ${cur.id} in ${path.relative(DATA_ROOT, cityPath)}`);

        // ★ 承認メール（編集反映＝承認とみなす）
        await maybeNotifyApproved({
          subPath: fp,
          sub,
          placeId: cur.id,
          placeName: cur.name,
          city,
          country,
        });

      } else {
        // 新規
        if (typeof lat !== "number" || typeof lng !== "number") {
          log(`[SKIP] no coordinates for new place: ${path.basename(fp)}`);
          skipped++;
          continue;
        }
        const citySlug = slugify(city);
        const id = genId(country, citySlug, name, lat, lng);

        const rec: PlaceRecord = {
          id, name, lat, lng,
          address, city, country,
          website: website ?? null, phone: phone ?? null, hours: hours ?? null, category: category ?? null,
          payment: { accepts: accepts.slice(0), preferred: [] },
          media: incomingImages.length ? { images: incomingImages } : undefined,
          verification: {
            status: isOwner ? "owner" : isCommunity ? "community" : "unverified",
            last_verified: nowISO(),
            sources: [{ type: "other", name: `${kind}-submission`, when: nowISO() }],
          },
          location: { source: isOwner ? "owner_gps" : "ops_fix", confidence: isOwner ? "high" : "med" },
          history: [],
        };

        list.push(rec);
        writeJson(cityPath, list);
        added++;
        log(`[NEW] ${rec.id} in ${path.relative(DATA_ROOT, cityPath)}`);

        // ★ 承認メール（新規作成＝承認とみなす）
        await maybeNotifyApproved({
          subPath: fp,
          sub,
          placeId: rec.id,
          placeName: rec.name,
          city,
          country,
        });
      }
    } catch (e: any) {
      log(`error: ${path.basename(fp)} -> ${e?.message || e}`);
      skipped++;
    }
  }

  writeJson(logPath, { at: nowISO(), summary: { added, updated, skipped }, files: files.map((f) => path.basename(f)) });
  log(`[done] added=${added} updated=${updated} skipped=${skipped} log=${path.relative(process.cwd(), logPath)}`);
})();
