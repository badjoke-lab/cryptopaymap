// scripts/normalize_addresses.ts
/**
 * Normalize country/address fields across existing JSON sources.
 *
 * Targets:
 *  - public/places.json
 *  - public/data/places/**/*.json
 *
 * What this does:
 *  - country -> ISO alpha-2 (AA)
 *  - address -> trims trailing ", City / , CountryName / , CountryCode", normalizes commas/spaces
 *
 * Usage:
 *   pnpm ts-node --project tsconfig.scripts.json scripts/normalize_addresses.ts
 *   DRY_RUN=1 pnpm ts-node --project tsconfig.scripts.json scripts/normalize_addresses.ts   # show changes but don't write
 *
 * Env:
 *   CPM_SINGLE=<path/to/file.json>    # limit to a single file
 *   CPM_INPUT=<root/dir>              # override default "public/data/places"
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type PlaceLike = Record<string, any>;

const ROOT = process.cwd();
const SINGLE = process.env.CPM_SINGLE ? path.resolve(process.env.CPM_SINGLE) : "";
const INPUT_DIR = process.env.CPM_INPUT
  ? path.resolve(process.env.CPM_INPUT)
  : path.join(ROOT, "public", "data", "places");

const TOP_PLACES = path.join(ROOT, "public", "places.json");
const META_COUNTRIES = path.join(ROOT, "public", "data", "meta", "countries.json");
const DRY_RUN = !!process.env.DRY_RUN;

/* ========================================================================== */
/* Utilities                                                                  */
/* ========================================================================== */

function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p: string, data: any) {
  const text = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(p, text, "utf8");
}
function listJsonFiles(root: string): string[] {
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
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) walk(root);
  else if (root.endsWith(".json") && fs.existsSync(root)) out.push(root);
  return out.sort();
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ========================================================================== */
/* Country dictionary (flexible loader + fallback)                             */
/* ========================================================================== */

type CountryRow = {
  alpha2?: string; code?: string; cca2?: string; iso2?: string;
  name?: string; common?: string; official?: string; aliases?: string[]; altSpellings?: string[];
};

function loadCountryDict(): {
  nameToAlpha2: Record<string, string>;
  alpha2ToName: Record<string, string>;
} {
  const nameToAlpha2: Record<string, string> = {};
  const alpha2ToName: Record<string, string> = {};

  const put = (name: string, code: string) => {
    const n = (name || "").trim();
    const c = (code || "").trim().toUpperCase();
    if (!n || !/^[A-Z]{2}$/.test(c)) return;
    nameToAlpha2[n.toLowerCase()] = c;
    if (!alpha2ToName[c]) alpha2ToName[c] = n; // keep first seen as display
  };

  if (fs.existsSync(META_COUNTRIES)) {
    try {
      const raw = readJson(META_COUNTRIES);
      const rows: CountryRow[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.countries)
        ? raw.countries
        : [];
      for (const r of rows) {
        const code = (r.alpha2 || r.code || r.cca2 || r.iso2 || "").toString().toUpperCase();
        const names = new Set<string>();
        [r.name, r.common, r.official, ...(r.aliases || []), ...(r.altSpellings || [])]
          .filter(Boolean)
          .forEach((x: any) => names.add(String(x)));
        if (/^[A-Z]{2}$/.test(code)) {
          for (const n of names) put(n, code);
        }
      }
    } catch {
      // swallow; fallback will be used
    }
  }

  // Minimal fallback to avoid crashes if meta file not present:
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
    "vatican city": "VA", "holy see": "VA", va: "VA",
  };
  for (const [k, v] of Object.entries(fallback)) {
    if (!nameToAlpha2[k]) {
      nameToAlpha2[k] = v;
      if (!alpha2ToName[v]) alpha2ToName[v] = k;
    }
  }

  return { nameToAlpha2, alpha2ToName };
}

const { nameToAlpha2, alpha2ToName } = loadCountryDict();

/* ========================================================================== */
/* Normalizers (must align with src/normalizeSubmission.ts)                    */
/* ========================================================================== */

function normalizeCountry(codeMaybe?: any, nameMaybe?: any): {
  alpha2?: string; countryNameGuess?: string;
} {
  const code = (codeMaybe ?? "").toString().trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return { alpha2: code };

  const rawName = (nameMaybe ?? "").toString().trim();
  if (rawName) {
    const key = rawName.toLowerCase();
    if (nameToAlpha2[key]) return { alpha2: nameToAlpha2[key], countryNameGuess: rawName };
    return { countryNameGuess: rawName };
  }
  return {};
}

function normalizeAddress(address: any, city?: any, countryName?: any, countryAlpha2?: any): string {
  const s = (address ?? "").toString();
  if (!s.trim()) return s;

  const parts = s.split(",").map(t => t.trim()).filter(Boolean);
  let core = parts.join(", ");

  const tailCandidates: string[] = [];
  if (city) tailCandidates.push(String(city));
  if (countryName) tailCandidates.push(String(countryName));
  if (countryAlpha2) tailCandidates.push(String(countryAlpha2));

  for (const cand of tailCandidates) {
    const re = new RegExp(`(?:,\\s*)?${escapeRegExp(cand)}\\.?$`, "i");
    core = core.replace(re, "");
  }

  // Also handle " / City" and " / Country"
  for (const cand of tailCandidates) {
    const re = new RegExp(`(?:,\\s*|\\s*/\\s*)${escapeRegExp(cand)}\\.?$`, "i");
    core = core.replace(re, "");
  }

  // Normalize separators and spaces
  core = core.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").replace(/^,\s*|\s*,\s*$/g, "");
  return core.trim();
}

/* ========================================================================== */
/* Core normalization per record                                               */
/* ========================================================================== */

type Change = { field: string; before: any; after: any };

function normalizePlaceRecord(p: PlaceLike): { changed: boolean; changes: Change[] } {
  const changes: Change[] = [];
  const before = (k: string) => (p as any)[k];

  // Country -> ISO2
  let alpha2 = "";
  let countryNameGuess = "";
  if (typeof p.country === "string") {
    const c = p.country.trim();
    const { alpha2: a2, countryNameGuess: guess } = normalizeCountry(
      /^[A-Z]{2}$/.test(c) ? c : undefined,
      /^[A-Z]{2}$/.test(c) ? undefined : c
    );
    if (a2 && c !== a2) {
      changes.push({ field: "country", before: c, after: a2 });
      p.country = a2;
    }
    alpha2 = a2 || ( /^[A-Z]{2}$/.test(c) ? c : "" );
    countryNameGuess = guess || (alpha2 && alpha2ToName[alpha2]) || "";
  }

  // City (no transformation, but we will use it to trim address)
  const city = typeof p.city === "string" ? p.city.trim() : "";

  // Address normalization (trim trailing city/countryName/countryCode)
  if (typeof p.address === "string") {
    const oldAddr = p.address;
    const newAddr = normalizeAddress(oldAddr, city || undefined, countryNameGuess || undefined, alpha2 || undefined);
    if (newAddr !== oldAddr) {
      changes.push({ field: "address", before: oldAddr, after: newAddr });
      p.address = newAddr;
    }
  }

  return { changed: changes.length > 0, changes };
}

/* ========================================================================== */
/* File-level processing                                                       */
/* ========================================================================== */

function extractArray(doc: any): { kind: "array" | "wrapped"; arr: any[]; key?: string } {
  if (Array.isArray(doc)) return { kind: "array", arr: doc };
  const key = ["places", "items", "results", "data", "entries"].find(k => Array.isArray(doc?.[k]));
  if (key) return { kind: "wrapped", arr: doc[key], key };
  return { kind: "array", arr: [] };
}

function processFile(file: string) {
  const js = readJson(file);
  const { kind, arr, key } = extractArray(js);

  if (!Array.isArray(arr) || arr.length === 0) {
    return { file, records: 0, touched: 0, fields: 0, details: [] as string[] };
  }

  let touched = 0;
  let fields = 0;
  const details: string[] = [];

  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (!rec || typeof rec !== "object") continue;
    const { changed, changes } = normalizePlaceRecord(rec);
    if (changed) {
      touched++;
      fields += changes.length;
      const id = rec.id || `${path.basename(file)}#${i}`;
      const line = changes.map(c => `${c.field}: "${String(c.before)}" -> "${String(c.after)}"`).join("; ");
      details.push(` - ${id}: ${line}`);
    }
  }

  if (touched > 0 && !DRY_RUN) {
    if (kind === "array") writeJson(file, arr);
    else if (kind === "wrapped" && key) {
      js[key] = arr;
      writeJson(file, js);
    }
  }

  return { file, records: arr.length, touched, fields, details };
}

/* ========================================================================== */
/* Main                                                                        */
/* ========================================================================== */

function main() {
  const files: string[] = [];

  if (SINGLE) {
    if (!fs.existsSync(SINGLE)) {
      console.error(`Not found: ${SINGLE}`);
      process.exit(1);
    }
    files.push(SINGLE);
  } else {
    if (fs.existsSync(TOP_PLACES)) files.push(TOP_PLACES);
    files.push(...listJsonFiles(INPUT_DIR));
  }

  if (files.length === 0) {
    console.log("No JSON files to normalize.");
    return;
  }

  let totalRecords = 0;
  let totalTouched = 0;
  let totalFields = 0;
  const perFile: string[] = [];

  for (const f of files) {
    try {
      const r = processFile(f);
      totalRecords += r.records;
      totalTouched += r.touched;
      totalFields += r.fields;

      if (r.touched > 0) {
        perFile.push(`[changed] ${f}  (records=${r.records}, touched=${r.touched}, fields=${r.fields})`);
        if (r.details.length) perFile.push(...r.details);
      } else {
        perFile.push(`[ok] ${f}  (records=${r.records}, touched=0)`);
      }
    } catch (e: any) {
      perFile.push(`[error] ${f}: ${e?.message || String(e)}`);
    }
  }

  console.log(perFile.join("\n"));
  console.log(
    `\nSummary: files=${files.length}, records=${totalRecords}, touched=${totalTouched}, field_changes=${totalFields}` +
      (DRY_RUN ? "  [DRY_RUN]" : "")
  );

  if (DRY_RUN) {
    console.log("\nDRY_RUN set: no files were written.");
  }
}

main();
