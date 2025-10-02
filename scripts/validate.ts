// /scripts/validate.ts
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const INPUT = process.env.CPM_INPUT || "public/data/places";
const SCHEMA = process.env.CPM_SCHEMA || "schema/place.schema.json";

/** =========================
 *  Category (w/ normalization)
 *  ========================= */

/** 許可カテゴリ（OSM起点で広めに許容） */
const CATEGORY_SET = new Set([
  // 飲食
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "bakery",
  "wine",
  // 小売
  "supermarket",
  "convenience",
  "grocery",
  "kiosk",
  "newsagent",
  "books",
  "bookshop",
  "video_games",
  "clothes",
  "shoes",
  "jewelry",
  "gift",
  "electronics",
  "mobile_phone",
  "toys",
  "beauty",
  "tattoo",
  "optician",
  "pharmacy",
  "butcher",
  "greengrocer",
  "furniture",
  "stationery",
  "interior_decoration",
  // サービス・施設
  "hairdresser",
  "spa",
  "gym",
  "college",
  "doctors",
  "dentist",
  "travel_agency",
  "car_rental",
  "motorcycle_rental",
  "ticket",
  "community_centre",
  "nightclub",
  "music",
  // ガーデン・農
  "garden_centre",
  "farm",
  // 宿泊・その他
  "hotel",
  "lodging",
  "coworking",
  "other",
]);

/** カテゴリ別名 → 正式名 */
const CATEGORY_ALIAS: Record<string, string> = {
  // 英米綴り・同義
  bookstore: "books",
  book_store: "books",
  book_shop: "books",
  community_center: "community_centre",
  jewellery: "jewelry",
  clothing: "clothes",
  mobile: "mobile_phone",
  phone: "mobile_phone",
  // マイナー/特殊は other に吸収
  incense: "other",
  events_venue: "other",
};

/** カテゴリ正規化（未知は other） */
function normalizeCategory(raw: any): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const mapped = CATEGORY_ALIAS[v] || v;
  return CATEGORY_SET.has(mapped) ? mapped : "other";
}

/** =========================
 *  Payment / Social constants
 *  ========================= */

/** 正式チェーン名 */
const CHAIN_SET = new Set([
  "bitcoin",
  "evm-mainnet",
  "polygon",
  "arbitrum",
  "base",
  "bsc",
  "solana",
  "tron",
  "ton",
  "avalanche",
  "other",
]);

/** チェーンの別名 → 正式名 */
const CHAIN_ALIAS: Record<string, string> = {
  evm: "evm-mainnet",
  ethereum: "evm-mainnet",
  eth: "evm-mainnet",
  btc: "bitcoin",
};

const METHOD_SET = new Set([
  "onchain",
  "lightning",
  "lnurl",
  "bolt12",
  "other",
]);

const PROCESSOR_SET = new Set([
  "btcpay",
  "opennode",
  "strike",
  "coinbase-commerce",
  "nowpayments",
  "bitpay",
  "self-hosted",
  "other",
]);

const SOCIAL_PLATFORM_SET = new Set([
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "youtube",
  "telegram",
  "whatsapp",
  "wechat",
  "line",
  "threads",
  "pinterest",
  "other",
]);

/** =========================
 *  AJV / IO helpers
 *  ========================= */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listPlaceFiles(root: string): string[] {
  const out: string[] = [];
  function walk(d: string) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const s = fs.statSync(q);
      if (s.isDirectory()) walk(q);
      else if (q.endsWith(".json")) out.push(q);
    }
  }
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
    walk(root);
  } else if (root.endsWith(".json")) {
    out.push(root);
  }
  return out.sort();
}

function levelLimits(level: string) {
  if (level === "owner")
    return { maxImages: 8, maxCaption: 600, requirePayments: true };
  if (level === "community")
    return { maxImages: 4, maxCaption: 300, requirePayments: true };
  return { maxImages: 0, maxCaption: 0, requirePayments: false }; // directory/unverified
}

/** =========================
 *  Normalizers
 *  ========================= */

function normStr(x: any): string | null {
  if (typeof x !== "string") return null;
  const v = x.trim();
  return v.length ? v : null;
}

function normalizeAsset(raw: any): string | null {
  const s = normStr(raw);
  if (!s) return null;
  const up = s.toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(up) ? up : null;
}

function normalizeChain(raw: any): string | null {
  const s = normStr(raw);
  if (!s) return null;
  const v = s.toLowerCase();
  const mapped = CHAIN_ALIAS[v] || v;
  return mapped;
}

/** =========================
 *  Business Rules
 *  ========================= */

function validateBusinessRules(records: any[], fileLabel: string): string[] {
  const errs: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const id = r?.id || `${fileLabel}#${i}`;
    const lvl = r?.verification?.status;
    const limits = levelLimits(lvl);

    // 1) profile/media constraints by level
    const imgs = (r?.media?.images ?? []) as any[];
    if (imgs.length > limits.maxImages) {
      errs.push(
        `${fileLabel}:${id}: media.images length ${imgs.length} > ${limits.maxImages} (level=${lvl})`,
      );
    }
    if (imgs.length > 0 && limits.maxImages === 0) {
      errs.push(
        `${fileLabel}:${id}: media/images not allowed for level=${lvl}`,
      );
    }
    for (let j = 0; j < imgs.length; j++) {
      const img = imgs[j] || {};
      const cap = String(img.caption || "");
      if (cap.length > limits.maxCaption) {
        errs.push(
          `${fileLabel}:${id}: media.caption length ${cap.length} > ${limits.maxCaption} (level=${lvl})`,
        );
      }
    }
    if (r.profile && !(lvl === "owner" || lvl === "community")) {
      errs.push(`${fileLabel}:${id}: profile present but level=${lvl}`);
    }

    // 2) category constraints（正規化。未知は other。= エラーにしない）
    if (typeof r.category === "string") {
      const before = r.category;
      const after = normalizeCategory(before);
      if (after && after !== before) {
        r.category = after; // 正規化を書き戻し
      }
    }
    if (r.category_confidence != null) {
      const c = Number(r.category_confidence);
      if (!(c >= 0 && c <= 1)) {
        errs.push(
          `${fileLabel}:${id}: category_confidence out of range (0..1): ${r.category_confidence}`,
        );
      }
    }

    // 3) socials constraints
    if (Array.isArray(r.socials)) {
      for (let sIdx = 0; sIdx < r.socials.length; sIdx++) {
        const s = r.socials[sIdx];
        if (!s) continue;
        if (!s.platform || !SOCIAL_PLATFORM_SET.has(s.platform)) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}].platform invalid`);
        }
        if (!s.url && !s.handle) {
          errs.push(
            `${fileLabel}:${id}: socials[${sIdx}] must have url or handle`,
          );
        }
        if (
          s.handle &&
          typeof s.handle === "string" &&
          !/^@?[\w.\-]{1,50}$/.test(s.handle)
        ) {
          errs.push(
            `${fileLabel}:${id}: socials[${sIdx}].handle invalid format`,
          );
        }
      }
    }

    // 4) payment constraints（正規化してから検査する）
    const acc = r?.payment?.accepts;
    if (limits.requirePayments && (!Array.isArray(acc) || acc.length === 0)) {
      errs.push(
        `${fileLabel}:${id}: level=${lvl} requires at least one payment.accepts entry`,
      );
    }
    if (Array.isArray(acc)) {
      for (let k = 0; k < acc.length; k++) {
        const a = acc[k];
        if (!a) continue;

        // asset
        const assetNorm = normalizeAsset(a.asset);
        if (!assetNorm) {
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].asset invalid`);
        } else {
          a.asset = assetNorm; // 正規化
        }

        // chain
        const chainNorm = normalizeChain(a.chain);
        if (!chainNorm || !CHAIN_SET.has(chainNorm)) {
          const raw = typeof a.chain === "string" ? a.chain : String(a.chain);
          errs.push(
            `${fileLabel}:${id}: payment.accepts[${k}].chain invalid (raw="${raw}", norm="${chainNorm}")`,
          );
        } else {
          a.chain = chainNorm; // 正規化
        }

        // method
        if (a.method != null && !METHOD_SET.has(String(a.method))) {
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].method invalid`);
        }

        // processor
        if (a.processor != null && !PROCESSOR_SET.has(String(a.processor))) {
          errs.push(
            `${fileLabel}:${id}: payment.accepts[${k}].processor invalid`,
          );
        }
      }
    }

    // 5) preferred must reference accepts（正規化後で照合）
    const preferred = r?.payment?.preferred;
    if (Array.isArray(preferred) && Array.isArray(acc)) {
      const set = new Set<string>();
      for (let q = 0; q < acc.length; q++) {
        const a = acc[q];
        const ch = normalizeChain(a?.chain);
        const as = normalizeAsset(a?.asset);
        if (as && ch) set.add(`${as}:${ch}`);
      }
      for (let pIdx = 0; pIdx < preferred.length; pIdx++) {
        const pr = preferred[pIdx];
        if (
          typeof pr !== "string" ||
          !/^[A-Z0-9]{2,10}:[a-z0-9\-]{2,32}$/.test(pr)
        ) {
          errs.push(
            `${fileLabel}:${id}: payment.preferred[${pIdx}] invalid format`,
          );
        } else if (!set.has(pr)) {
          errs.push(
            `${fileLabel}:${id}: payment.preferred[${pIdx}] not found in accepts (${pr})`,
          );
        }
      }
    }
  }

  return errs;
}

/** =========================
 *  Main
 *  ========================= */

function main() {
  const schema = readJson(SCHEMA);
  const validate = ajv.compile(schema);

  const files = listPlaceFiles(INPUT);
  if (files.length === 0) {
    console.log("OK: no JSON targets found (nothing to validate).");
    return;
  }

  let schemaErrs = 0;
  let ruleErrs = 0;
  let totalRecords = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    const js = readJson(f);
    const arr = Array.isArray(js)
      ? js
      : js.places || js.items || js.results || js.data || js.entries || [];
    if (!Array.isArray(arr)) continue;

    // JSON Schema
    const thisSchemaErrs: string[] = [];
    for (let pi = 0; pi < arr.length; pi++) {
      const p = arr[pi];
      const ok = validate(p);
      if (!ok) {
        const id = p && p.id ? p.id : "unknown";
        const errors = validate.errors || [];
        for (let ei = 0; ei < errors.length; ei++) {
          const e = errors[ei];
          thisSchemaErrs.push(
            `${path.basename(f)}: ${id}: ${e.instancePath || "/"} ${e.message}`,
          );
        }
      }
    }
    if (thisSchemaErrs.length) {
      console.error(`Schema errors in ${f}`);
      console.error(thisSchemaErrs.join("\n"));
      schemaErrs += thisSchemaErrs.length;
    }

    // Business rules
    const brErrs = validateBusinessRules(arr, path.basename(f));
    if (brErrs.length) {
      console.error(`Business rule errors in ${f}`);
      console.error(brErrs.join("\n"));
      ruleErrs += brErrs.length;
    }

    totalRecords += arr.length;
  }

  if (schemaErrs || ruleErrs) {
    console.error(
      `Validation failed. Schema errors: ${schemaErrs}, Business rule errors: ${ruleErrs}`,
    );
    process.exit(1);
  }

  console.log(
    `OK: ${totalRecords} records passed schema + business rules across ${files.length} file(s).`,
  );
}

main();
