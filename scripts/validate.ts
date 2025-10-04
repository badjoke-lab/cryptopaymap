// /scripts/validate.ts
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const INPUT = process.env.CPM_INPUT || "public/data/places";
const SCHEMA = process.env.CPM_SCHEMA || "schema/place.schema.json";
const CHAINS_META_PATH = process.env.CPM_CHAINS || "chains.meta.json";

/** =========================
 *  Category (with normalization)
 *  ========================= */

const CATEGORY_SET = new Set([
  // food & drink
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "bakery",
  "wine",
  // retail
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
  // services & venues
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
  // garden & farm
  "garden_centre",
  "farm",
  // lodging & other
  "hotel",
  "lodging",
  "coworking",
  "other",
]);

/** category aliases -> canonical */
const CATEGORY_ALIAS: Record<string, string> = {
  // spelling / synonyms
  bookstore: "books",
  book_store: "books",
  book_shop: "books",
  community_center: "community_centre",
  jewellery: "jewelry",
  clothing: "clothes",
  mobile: "mobile_phone",
  phone: "mobile_phone",
  // niche -> other
  incense: "other",
  events_venue: "other",
};

/** normalize category (unknown -> "other") */
function normalizeCategory(raw: any): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const mapped = CATEGORY_ALIAS[v] || v;
  return CATEGORY_SET.has(mapped) ? mapped : "other";
}

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

/** =========================
 *  Chains meta (dynamic aliases / allowed ids)
 *  ========================= */

type ChainMetaEntry = { id: string; label?: string; aliases?: string[] };
type ChainsMeta = { chains: ChainMetaEntry[] };

const chainsMeta: ChainsMeta = readJson(CHAINS_META_PATH);

// allowed chain ids (must align with schema enum via $ref)
const CHAIN_SET = new Set<string>(chainsMeta.chains.map((c) => c.id));

// alias map (lower-cased) -> canonical id
const CHAIN_ALIAS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const norm = (s?: string) => (s || "").trim().toLowerCase();
  for (const c of chainsMeta.chains) {
    const id = c.id;
    if (!id) continue;
    map[norm(id)] = id;
    if (c.label) map[norm(c.label)] = id;
    for (const al of c.aliases || []) {
      map[norm(al)] = id;
    }
  }
  // some common shapes
  map["onchain"] = "bitcoin";
  map["on-chain"] = "bitcoin";
  return map;
})();

function levelLimits(level: string) {
  if (level === "owner")
    return { maxImages: 8, maxCaption: 600, requirePayments: true };
  if (level === "community")
    return { maxImages: 4, maxCaption: 300, requirePayments: true };
  // directory / unverified
  return { maxImages: 0, maxCaption: 0, requirePayments: false };
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
  const k = s.toLowerCase();
  const mapped = CHAIN_ALIAS[k] || k;
  return mapped;
}

/** =========================
 *  Extra Business Rule Assertions
 *  ========================= */

function assertBusinessRules(place: any, file: string) {
  const v = place?.verification?.status;
  if (v === "directory" || v === "unverified") {
    if (place.media?.images?.length) {
      throw new Error(`${file}: Directory/Unverified must not include media.images`);
    }
  }
  const acc: string[] = (place?.payment?.accepts || []).map((a: any) => `${a.asset}:${a.chain}`);
  const pref: string[] = place?.payment?.preferred || [];
  for (const p of pref) {
    if (!acc.includes(p)) throw new Error(`${file}: payment.preferred contains unknown "${p}"`);
  }
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

    // (A) profile/media constraints by verification level
    const imgs = (r?.media?.images ?? []) as any[];
    if (imgs.length > limits.maxImages) {
      errs.push(
        `${fileLabel}:${id}: media.images length ${imgs.length} > ${limits.maxImages} (level=${lvl})`
      );
    }
    if (imgs.length > 0 && limits.maxImages === 0) {
      errs.push(`${fileLabel}:${id}: media.images not allowed for level=${lvl}`);
    }
    for (let j = 0; j < imgs.length; j++) {
      const img = imgs[j] || {};
      const cap = String(img.caption || "");
      if (cap.length > limits.maxCaption) {
        errs.push(
          `${fileLabel}:${id}: media.caption length ${cap.length} > ${limits.maxCaption} (level=${lvl})`
        );
      }
    }
    if (r.profile && !(lvl === "owner" || lvl === "community")) {
      errs.push(`${fileLabel}:${id}: profile present but level=${lvl}`);
    }

    // (B) category normalization (unknown -> "other"), not an error
    if (typeof r.category === "string") {
      const before = r.category;
      const after = normalizeCategory(before);
      if (after && after !== before) {
        r.category = after; // write back normalized
      }
    }
    if (r.category_confidence != null) {
      const c = Number(r.category_confidence);
      if (!(c >= 0 && c <= 1)) {
        errs.push(
          `${fileLabel}:${id}: category_confidence out of range (0..1): ${r.category_confidence}`
        );
      }
    }

    // (C) socials constraints
    if (Array.isArray(r.socials)) {
      for (let sIdx = 0; sIdx < r.socials.length; sIdx++) {
        const s = r.socials[sIdx];
        if (!s) continue;
        if (!s.platform || !new Set([
          "instagram","facebook","x","tiktok","youtube","telegram","whatsapp","wechat","line","threads","pinterest","other"
        ]).has(s.platform)) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}].platform invalid`);
        }
        if (!s.url && !s.handle) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}] must have url or handle`);
        }
        if (
          s.handle &&
          typeof s.handle === "string" &&
          !/^@?[\w.\-]{1,50}$/.test(s.handle)
        ) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}].handle invalid format`);
        }
      }
    }

    // (D) payment constraints (normalize then validate)
    const acc = r?.payment?.accepts;
    if (limits.requirePayments && (!Array.isArray(acc) || acc.length === 0)) {
      errs.push(
        `${fileLabel}:${id}: level=${lvl} requires at least one payment.accepts entry`
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
          a.asset = assetNorm; // write back normalized
        }

        // chain
        const chainNorm = normalizeChain(a.chain);
        if (!chainNorm || !CHAIN_SET.has(chainNorm)) {
          const raw = typeof a.chain === "string" ? a.chain : String(a.chain);
          errs.push(
            `${fileLabel}:${id}: payment.accepts[${k}].chain invalid (raw="${raw}", norm="${chainNorm}")`
          );
        } else {
          a.chain = chainNorm; // write back normalized
        }

        // method
        const METHOD_SET = new Set(["onchain","lightning","lnurl","bolt12","other"]);
        if (a.method != null && !METHOD_SET.has(String(a.method))) {
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].method invalid`);
        }

        // processor
        const PROCESSOR_SET = new Set([
          "btcpay","opennode","strike","coinbase-commerce","nowpayments","bitpay","self-hosted","other"
        ]);
        if (a.processor != null && !PROCESSOR_SET.has(String(a.processor))) {
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].processor invalid`);
        }
      }
    }

    // (E) preferred must be subset of accepts after normalization
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
            `${fileLabel}:${id}: payment.preferred[${pIdx}] invalid format`
          );
        } else if (!set.has(pr)) {
          errs.push(
            `${fileLabel}:${id}: payment.preferred[${pIdx}] not found in accepts (${pr})`
          );
        }
      }
    }

    // (F) explicit: directory/unverified must not include any media.* object
    if ((lvl === "directory" || lvl === "unverified") && r.media) {
      const hasImages =
        Array.isArray(r.media.images) && r.media.images.length > 0;
      const hasAnyOther = Object.keys(r.media).length > (hasImages ? 1 : 0);
      if (hasImages || hasAnyOther) {
        errs.push(
          `${fileLabel}:${id}: media.* not allowed for level=${lvl} (remove media entirely)`
        );
      }
    }

    // (G) call extra assertions
    try {
      assertBusinessRules(r, fileLabel);
    } catch (e: any) {
      errs.push(String(e.message || e));
    }
  }

  return errs;
}

/** =========================
 *  Main
 *  ========================= */

function main() {
  const placeSchema = readJson(SCHEMA);
  const chainsSchema = readJson(CHAINS_META_PATH);

  // preload chains schema so that $ref: "chains.meta.json#/definitions/chainId" can resolve
  ajv.addSchema(chainsSchema, "chains.meta.json");

  const validate = ajv.compile(placeSchema);

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

    // JSON Schema validation
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
            `${path.basename(f)}: ${id}: ${e.instancePath || "/"} ${e.message}`
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
      `Validation failed. Schema errors: ${schemaErrs}, Business rule errors: ${ruleErrs}`
    );
    process.exit(1);
  }

  console.log(
    `OK: ${totalRecords} records passed schema + business rules across ${files.length} file(s).`
  );
}

main();
