// scripts/validate_submissions.ts
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

// ★ 1) フォーム正規化（必ず通す）
import {
  normalizeOwnerForm,
  normalizeCommunityForm,
  normalizeReportForm,
} from "../src/normalizeSubmission";

const ROOT = process.cwd();
const SUB_DIR = process.env.SUBMISSIONS_DIR || "fixtures";
const TARGET_DIR = path.join(ROOT, SUB_DIR);

const SCHEMA_DIR = path.join(ROOT, "schema");
const CHAINS_META = path.join(SCHEMA_DIR, "chains.meta.json");
const PLACE_SCHEMA = path.join(SCHEMA_DIR, "place.schema.json");
const PATCH_OWNER = path.join(SCHEMA_DIR, "patch.owner.schema.json");
const PATCH_COMM = path.join(SCHEMA_DIR, "patch.community.schema.json");
const PATCH_REPT = path.join(SCHEMA_DIR, "patch.report.schema.json");

function die(msg: string) {
  console.error(msg);
  process.exit(1);
}

for (const p of [CHAINS_META, PLACE_SCHEMA, PATCH_OWNER, PATCH_COMM, PATCH_REPT, TARGET_DIR]) {
  if (!fs.existsSync(p)) die(`Not found: ${p}`);
}

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
  validateSchema: true
});
addFormats(ajv);

// 参照される側を先登録
const chainsSchema = JSON.parse(fs.readFileSync(CHAINS_META, "utf-8"));
if (!chainsSchema.$id) chainsSchema.$id = "chains.meta.json";
ajv.addSchema(chainsSchema, chainsSchema.$id);

// スキーマをコンパイル
const placeSchema = JSON.parse(fs.readFileSync(PLACE_SCHEMA, "utf-8"));
if (!placeSchema.$id) placeSchema.$id = "place.schema.json";
const validatePlace = ajv.compile(placeSchema);

const ownerSchema = JSON.parse(fs.readFileSync(PATCH_OWNER, "utf-8"));
if (!ownerSchema.$id) ownerSchema.$id = "patch.owner.schema.json";
const validateOwner = ajv.compile(ownerSchema);

const communitySchema = JSON.parse(fs.readFileSync(PATCH_COMM, "utf-8"));
if (!communitySchema.$id) communitySchema.$id = "patch.community.schema.json";
const validateCommunity = ajv.compile(communitySchema);

const reportSchema = JSON.parse(fs.readFileSync(PATCH_REPT, "utf-8"));
if (!reportSchema.$id) reportSchema.$id = "patch.report.schema.json";
const validateReport = ajv.compile(reportSchema);

// kind 推定（データ優先 → ファイル名）
function inferKind(data: any, filename: string): "owner" | "community" | "report" | "place" {
  try {
    const k = typeof data?.kind === "string" ? data.kind.toLowerCase() : "";
    if (k === "owner" || k === "community" || k === "report") return k as any;
  } catch {}
  const base = filename.toLowerCase();
  if (base.includes("owner")) return "owner";
  if (base.includes("community")) return "community";
  if (base.includes("report")) return "report";
  return "place";
}

// ===== FAIL ルール（scripts/validate.ts と整合） =====

type Verification = "owner" | "community" | "directory" | "unverified";

function levelLimits(level: Verification | string | undefined) {
  if (level === "owner")
    return { maxImages: 8, maxSummary: 600, requirePayments: true };
  if (level === "community")
    return { maxImages: 4, maxSummary: 300, requirePayments: true };
  // directory / unverified
  return { maxImages: 0, maxSummary: 0, requirePayments: false };
}

function isISO2Country(v: any): boolean {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v.trim());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectAddressTail(address?: string, city?: string, countryCode?: string): boolean {
  if (!address) return false;
  const a = String(address);
  const tails: string[] = [];
  if (city) tails.push(city);
  if (countryCode) tails.push(countryCode);
  for (const t of tails) {
    const re = new RegExp(`(?:,\\s*|\\s*/\\s*)${escapeRegExp(t)}\\.?$`, "i");
    if (re.test(a)) return true;
  }
  return false;
}

function validateBusinessRulesForPatch(
  patch: any,
  fileLabel: string
): string[] {
  const errs: string[] = [];
  const lvl: Verification | string | undefined = patch?.verification?.status;
  const limits = levelLimits(lvl);

  // 1) country ISO2
  if (patch?.country != null && !isISO2Country(patch.country)) {
    errs.push(`${fileLabel}: country must be ISO alpha-2 (AA): "${patch.country}"`);
  }

  // 2) address 末尾に , City / , CountryCode が残存していないか
  if (typeof patch?.address === "string") {
    const city = typeof patch?.city === "string" ? patch.city : undefined;
    const cc = typeof patch?.country === "string" ? patch.country : undefined;
    if (detectAddressTail(patch.address, city, cc)) {
      errs.push(`${fileLabel}: address must not contain trailing ", City / , CountryCode"`);
    }
  }

  // 3) profile.summary の長さ
  const sum = patch?.profile?.summary;
  if (typeof sum === "string") {
    if (limits.maxSummary === 0 && sum.length > 0) {
      errs.push(`${fileLabel}: profile.summary not allowed for level=${String(lvl)}`);
    } else if (sum.length > limits.maxSummary) {
      errs.push(`${fileLabel}: profile.summary length ${sum.length} > ${limits.maxSummary} (level=${String(lvl)})`);
    }
  }

  // 4) media.images 上限
  const images: any[] = Array.isArray(patch?.media?.images) ? patch.media.images : [];
  if (images.length > limits.maxImages) {
    errs.push(`${fileLabel}: media.images length ${images.length} > ${limits.maxImages} (level=${String(lvl)})`);
  }
  if (images.length > 0 && limits.maxImages === 0) {
    errs.push(`${fileLabel}: media.images not allowed for level=${String(lvl)}`);
  }

  // 5) Owner/Community は payment.accepts 必須
  if (limits.requirePayments) {
    const acc: any[] = Array.isArray(patch?.payment?.accepts) ? patch.payment.accepts : [];
    if (acc.length === 0) {
      errs.push(`${fileLabel}: level=${String(lvl)} requires payment.accepts >= 1`);
    }
  }

  return errs;
}

// チェーンメタを（normalize* 用に）読み込み
type ChainMetaEntry = { id: string; label?: string; aliases?: string[] };
type ChainsMeta = { chains: ChainMetaEntry[] };
const chainsMeta: ChainsMeta = JSON.parse(fs.readFileSync(CHAINS_META, "utf-8"));

// ====== メイン ======

const files = fs.readdirSync(TARGET_DIR).filter(f => f.endsWith(".json"));
if (files.length === 0) {
  console.log(`No JSON files under ${SUB_DIR}. Nothing to validate.`);
  process.exit(0);
}

let pass = 0;
let fail = 0;
const errors: Array<{ file: string; detail: string }> = [];

for (const file of files) {
  const p = path.join(TARGET_DIR, file);
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw);

    const kind = inferKind(data, file);
    const nowISO = new Date().toISOString();

    // ★ 1) 正規化を必ず通す（Owner/Community/Report）
    let patch: any;
    if (kind === "owner") {
      patch = normalizeOwnerForm(data as any, chainsMeta, nowISO).patch;
    } else if (kind === "community") {
      patch = normalizeCommunityForm(data as any, chainsMeta, nowISO).patch;
    } else if (kind === "report") {
      patch = normalizeReportForm(data as any, nowISO).patch;
    } else {
      // place はそのままスキーマ検証（正規化の適用対象外）
      patch = data;
    }

    // ★ 2) スキーマ検証（patch.* または place）
    let ok: boolean;
    if (kind === "owner") ok = validateOwner(patch) as boolean;
    else if (kind === "community") ok = validateCommunity(patch) as boolean;
    else if (kind === "report") ok = validateReport(patch) as boolean;
    else ok = validatePlace(patch) as boolean;

    if (!ok) {
      fail++;
      const ajvErrs =
        kind === "owner" ? (validateOwner.errors || []) :
        kind === "community" ? (validateCommunity.errors || []) :
        kind === "report" ? (validateReport.errors || []) :
        (validatePlace.errors || []);
      const detail = ajvErrs.map(e => `${e.instancePath || "/"} ${e.message}`).join("; ");
      errors.push({ file, detail: `[${kind}] ${detail}` });
      continue;
    }

    // ★ 3) FAIL ルール適用（normalized patch に対して）
    // place は対象外（既存データは scripts/validate.ts 側で検証）
    if (kind === "owner" || kind === "community" || kind === "report") {
      const brErrs = validateBusinessRulesForPatch(patch, `${file}`);
      if (brErrs.length) {
        fail++;
        errors.push({ file, detail: brErrs.join("; ") });
        continue;
      }
    }

    pass++;
  } catch (e: any) {
    fail++;
    errors.push({ file, detail: e?.message || String(e) });
  }
}

if (fail === 0) {
  console.log(`OK: ${pass} records passed normalization + schema + business rules under ${SUB_DIR}.`);
  console.log("OK: owner patch / community patch / report patch");
  process.exit(0);
} else {
  console.error(`NG: ${fail} files failed under ${SUB_DIR}.`);
  for (const e of errors) console.error(` - ${e.file}: ${e.detail}`);
  process.exit(1);
}
