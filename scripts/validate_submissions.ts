// scripts/validate_submissions.ts
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

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

// 文字列→URL判定の簡易関数
function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

// プラットフォーム名っぽいキーを標準化（なければ "other"）
function normalizePlatformKey(k: string): string {
  const v = k.toLowerCase();
  const known = [
    "instagram","facebook","x","tiktok","youtube",
    "telegram","whatsapp","wechat","line","threads","pinterest","other"
  ];
  return known.includes(v) ? v : "other";
}

// owner用 socials 標準化：
// - 文字列: URLなら {url, platform:"other"} / それ以外は {handle, platform:"other"}
// - オブジェクト: {instagram:"url"} 形式は entries 展開
// - 既に {platform,url,handle} ならそのまま
function normalizeOwnerSocials(s: any): any {
  if (s == null) return s;

  // 1) 配列以外なら配列に
  let arr: any[] = Array.isArray(s) ? s : [s];

  // 2) 各要素を標準化して配列に平坦化
  const out: any[] = [];
  for (const item of arr) {
    if (item == null) continue;

    if (typeof item === "string") {
      const str = item.trim();
      if (!str) continue;
      if (looksLikeUrl(str)) {
        out.push({ platform: "other", url: str });
      } else {
        out.push({ platform: "other", handle: str });
      }
      continue;
    }

    if (typeof item === "object") {
      // 既に標準形:
      if ("platform" in item || "url" in item || "handle" in item) {
        const platform = normalizePlatformKey(String((item as any).platform ?? "other"));
        const url = (item as any).url;
        const handle = (item as any).handle;
        const o: any = { platform };
        if (typeof url === "string" && url.trim()) o.url = url.trim();
        if (typeof handle === "string" && handle.trim()) o.handle = handle.trim();
        if (o.url || o.handle) out.push(o);
        continue;
      }
      // { instagram:"url", x:"@id" } のような辞書型
      for (const [k, v] of Object.entries(item)) {
        if (v == null) continue;
        const platform = normalizePlatformKey(k);
        if (typeof v === "string") {
          const vv = v.trim();
          if (!vv) continue;
          if (looksLikeUrl(vv)) {
            out.push({ platform, url: vv });
          } else {
            out.push({ platform, handle: vv });
          }
        } else if (typeof v === "object" && v) {
          const url = (v as any).url;
          const handle = (v as any).handle;
          const o: any = { platform };
          if (typeof url === "string" && url.trim()) o.url = url.trim();
          if (typeof handle === "string" && handle.trim()) o.handle = handle.trim();
          if (o.url || o.handle) out.push(o);
        }
      }
      continue;
    }
    // その他の型は無視
  }

  // 重複を簡易除去（url/handle/platの組み合わせ）
  const seen = new Set<string>();
  const dedup = out.filter(o => {
    const key = `${o.platform}|${o.url ?? ""}|${o.handle ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedup;
}

// report 用のトップレベル → report ネスト化（前回と同様）
function normalizeReportTopLevel(out: any) {
  const hasNested = typeof out.report === "object" && out.report !== null;
  const hasTopStatus = typeof out.status === "string";
  const hasTopEvidence = Array.isArray(out.evidence);
  const hasTopNote = typeof out.note === "string";
  if (!hasNested && (hasTopStatus || hasTopEvidence || hasTopNote)) {
    out.report = {
      ...(hasTopStatus ? { status: out.status } : {}),
      ...(hasTopEvidence ? { evidence: out.evidence } : {}),
      ...(hasTopNote ? { note: out.note } : {})
    };
  }
}

function normalizeForSchema(kind: "owner" | "community" | "report" | "place", data: any): any {
  const out = typeof data === "object" && data ? { ...data } : data;

  // kind 補完
  if (kind !== "place" && (typeof out !== "object" || out === null || !("kind" in out))) {
    if (typeof out === "object" && out) out.kind = kind;
  }

  // owner: socials 標準化（ここで配列要素をオブジェクト化）
  if (kind === "owner" && out && typeof out === "object" && "socials" in out) {
    out.socials = normalizeOwnerSocials(out.socials);
  }

  // report: トップレベル項目を report へ寄せる
  if (kind === "report" && out && typeof out === "object") {
    normalizeReportTopLevel(out);
  }

  return out;
}

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
    const normalized = normalizeForSchema(kind, data);

    let ok: boolean;
    switch (kind) {
      case "owner":
        ok = validateOwner(normalized) as boolean;
        break;
      case "community":
        ok = validateCommunity(normalized) as boolean;
        break;
      case "report":
        ok = validateReport(normalized) as boolean;
        break;
      default:
        ok = validatePlace(normalized) as boolean;
    }

    if (!ok) {
      fail++;
      const ajvErrs =
        kind === "owner" ? (validateOwner.errors || []) :
        kind === "community" ? (validateCommunity.errors || []) :
        kind === "report" ? (validateReport.errors || []) :
        (validatePlace.errors || []);
      const detail = ajvErrs.map(e => `${e.instancePath || "/"} ${e.message}`).join("; ");
      errors.push({ file, detail: `[${kind}] ${detail}` });
    } else {
      pass++;
    }
  } catch (e: any) {
    fail++;
    errors.push({ file, detail: e?.message || String(e) });
  }
}

if (fail === 0) {
  console.log(`OK: ${pass} records passed schema under ${SUB_DIR}.`);
  console.log("OK: owner patch / community patch / report patch");
  process.exit(0);
} else {
  console.error(`NG: ${fail} files failed schema under ${SUB_DIR}.`);
  for (const e of errors) console.error(` - ${e.file}: ${e.detail}`);
  process.exit(1);
}
