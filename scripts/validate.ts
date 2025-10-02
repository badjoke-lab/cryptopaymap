// /scripts/validate.ts
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const DEFAULT_INPUT = process.env.CPM_INPUT || "public/data/places";
const SCHEMA = process.env.CPM_SCHEMA || "schema/place.schema.json";

// ★ 追加: lint-staged から渡ってくる引数（変更ファイルのリスト）
const ARGS = process.argv.slice(2);

/** 許可カテゴリ */
const CATEGORY_SET = new Set([
  "cafe","restaurant","bar","pub","bakery","grocery","butcher","optician","pharmacy","doctors",
  "dentist","hairdresser","spa","electronics","clothing","jewelry","bookshop","convenience",
  "hotel","lodging","gym","dancing_school","tool_hire","coworking","other"
]);

/** 正式チェーン名（JSON Schema 側の enum と揃えること） */
const CHAIN_SET = new Set([
  "bitcoin","evm-mainnet","polygon","arbitrum","base","bsc","solana","tron","ton","avalanche","other",
]);

/** チェーン別名 → 正式名 */
const CHAIN_ALIAS: Record<string,string> = {
  evm: "evm-mainnet",
  ethereum: "evm-mainnet",
  eth: "evm-mainnet",
  btc: "bitcoin",
};

const METHOD_SET = new Set(["onchain","lightning","lnurl","bolt12","other"]);
const PROCESSOR_SET = new Set([
  "btcpay","opennode","strike","coinbase-commerce","nowpayments","bitpay","self-hosted","other"
]);
const SOCIAL_PLATFORM_SET = new Set([
  "instagram","facebook","x","tiktok","youtube","telegram","whatsapp","wechat","line","threads","pinterest","other"
]);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function listPlaceFiles(target: string): string[] {
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
  if (!target) return out;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) walk(target);
  else if (target.endsWith(".json") && fs.existsSync(target)) out.push(target);
  return out.sort();
}

function levelLimits(level: string) {
  if (level === "owner") return { maxImages: 8, maxCaption: 600, requirePayments: true };
  if (level === "community") return { maxImages: 4, maxCaption: 300, requirePayments: true };
  return { maxImages: 0, maxCaption: 0, requirePayments: false }; // directory/unverified
}

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

function validateBusinessRules(records: any[], fileLabel: string): string[] {
  const errs: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const id = r?.id || `${fileLabel}#${i}`;
    const lvl = r?.verification?.status;
    const limits = levelLimits(lvl);

    // 1) media / profile
    const imgs = (r?.media?.images ?? []) as any[];
    if (imgs.length > limits.maxImages) {
      errs.push(`${fileLabel}:${id}: media.images length ${imgs.length} > ${limits.maxImages} (level=${lvl})`);
    }
    if (imgs.length > 0 && limits.maxImages === 0) {
      errs.push(`${fileLabel}:${id}: media/images not allowed for level=${lvl}`);
    }
    for (let j = 0; j < imgs.length; j++) {
      const cap = String((imgs[j] || {}).caption || "");
      if (cap.length > limits.maxCaption) {
        errs.push(`${fileLabel}:${id}: media.caption length ${cap.length} > ${limits.maxCaption} (level=${lvl})`);
      }
    }
    if (r.profile && !(lvl === "owner" || lvl === "community")) {
      errs.push(`${fileLabel}:${id}: profile present but level=${lvl}`);
    }

    // 2) category
    if (typeof r.category === "string" && !CATEGORY_SET.has(r.category)) {
      errs.push(`${fileLabel}:${id}: invalid category "${r.category}"`);
    }
    if (r.category_confidence != null) {
      const c = Number(r.category_confidence);
      if (!(c >= 0 && c <= 1)) {
        errs.push(`${fileLabel}:${id}: category_confidence out of range (0..1): ${r.category_confidence}`);
      }
    }

    // 3) socials
    if (Array.isArray(r.socials)) {
      for (let sIdx = 0; sIdx < r.socials.length; sIdx++) {
        const s = r.socials[sIdx];
        if (!s) continue;
        if (!s.platform || !SOCIAL_PLATFORM_SET.has(s.platform)) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}].platform invalid`);
        }
        if (!s.url && !s.handle) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}] must have url or handle`);
        }
        if (s.handle && typeof s.handle === "string" && !/^@?[\w.\-]{1,50}$/.test(s.handle)) {
          errs.push(`${fileLabel}:${id}: socials[${sIdx}].handle invalid format`);
        }
      }
    }

    // 4) payments
    const acc = r?.payment?.accepts;
    if (limits.requirePayments && (!Array.isArray(acc) || acc.length === 0)) {
      errs.push(`${fileLabel}:${id}: level=${lvl} requires at least one payment.accepts entry`);
    }
    if (Array.isArray(acc)) {
      for (let k = 0; k < acc.length; k++) {
        const a = acc[k];
        if (!a) continue;

        const assetNorm = normalizeAsset(a.asset);
        if (!assetNorm) errs.push(`${fileLabel}:${id}: payment.accepts[${k}].asset invalid`);
        else a.asset = assetNorm;

        const chainNorm = normalizeChain(a.chain);
        if (!chainNorm || !CHAIN_SET.has(chainNorm)) {
          const raw = typeof a.chain === "string" ? a.chain : String(a.chain);
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].chain invalid (raw="${raw}", norm="${chainNorm}")`);
        } else {
          a.chain = chainNorm;
        }

        if (a.method != null && !METHOD_SET.has(String(a.method))) {
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].method invalid`);
        }
        if (a.processor != null && !PROCESSOR_SET.has(String(a.processor))) {
          errs.push(`${fileLabel}:${id}: payment.accepts[${k}].processor invalid`);
        }
      }
    }

    // 5) preferred ⊆ accepts
    const preferred = r?.payment?.preferred;
    if (Array.isArray(preferred) && Array.isArray(acc)) {
      const set = new Set<string>();
      for (const a of acc) {
        const ch = normalizeChain(a?.chain);
        const as = normalizeAsset(a?.asset);
        if (as && ch) set.add(`${as}:${ch}`);
      }
      for (let pIdx = 0; pIdx < preferred.length; pIdx++) {
        const pr = preferred[pIdx];
        if (typeof pr !== "string" || !/^[A-Z0-9]{2,10}:[a-z0-9\-]{2,32}$/.test(pr)) {
          errs.push(`${fileLabel}:${id}: payment.preferred[${pIdx}] invalid format`);
        } else if (!set.has(pr)) {
          errs.push(`${fileLabel}:${id}: payment.preferred[${pIdx}] not found in accepts (${pr})`);
        }
      }
    }
  }

  return errs;
}

function main() {
  const schema = readJson(SCHEMA);
  const validate = ajv.compile(schema);

  // ★ 変更: 引数があればそれらだけ、なければ既定ディレクトリを走査
  const targets = ARGS.length ? ARGS : [DEFAULT_INPUT];
  const files = targets.flatMap(listPlaceFiles);

  if (files.length === 0) {
    console.log("OK: no JSON targets found (nothing to validate).");
    return;
  }

  let schemaErrs = 0;
  let ruleErrs = 0;
  let totalRecords = 0;

  for (const f of files) {
    const js = readJson(f);
    const arr = Array.isArray(js)
      ? js
      : (js.places || js.items || js.results || js.data || js.entries || []);
    if (!Array.isArray(arr)) continue;

    const thisSchemaErrs: string[] = [];
    for (let pi = 0; pi < arr.length; pi++) {
      const p = arr[pi];
      const ok = validate(p);
      if (!ok) {
        const id = (p && p.id) ? p.id : "unknown";
        const errors = validate.errors || [];
        for (const e of errors) {
          thisSchemaErrs.push(`${path.basename(f)}: ${id}: ${e.instancePath || "/"} ${e.message}`);
        }
      }
    }
    if (thisSchemaErrs.length) {
      console.error(`Schema errors in ${f}`);
      console.error(thisSchemaErrs.join("\n"));
      schemaErrs += thisSchemaErrs.length;
    }

    const brErrs = validateBusinessRules(arr, path.basename(f));
    if (brErrs.length) {
      console.error(`Business rule errors in ${f}`);
      console.error(brErrs.join("\n"));
      ruleErrs += brErrs.length;
    }

    totalRecords += arr.length;
  }

  if (schemaErrs || ruleErrs) {
    console.error(`Validation failed. Schema errors: ${schemaErrs}, Business rule errors: ${ruleErrs}`);
    process.exit(1);
  }

  console.log(`OK: ${totalRecords} records passed schema + business rules across ${files.length} file(s).`);
}

main();
