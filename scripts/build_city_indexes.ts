#!/usr/bin/env ts-node
import { glob } from "glob";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const ROOT = "public/data/places";
const COUNTRY_MAP_FILE = "schema/country-map.json"; // 任意。あれば使う。

// tiny slugger
function slug(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// load optional country map (user-provided)
async function loadCountryMap(): Promise<Record<string,string>> {
  try {
    const s = await fsp.readFile(COUNTRY_MAP_FILE, "utf8");
    const m = JSON.parse(s);
    if (m && typeof m === "object") {
      const out: Record<string,string> = {};
      for (const [k,v] of Object.entries(m)) out[slug(k)] = String(v).toLowerCase();
      return out;
    }
  } catch {}
  return {};
}

// built-in minimal map (fallback)
const builtinMap: Record<string,string> = {
  "japan": "jp",
  "united-states": "us",
  "united-kingdom": "gb",
  "south-korea": "kr",
  "north-korea": "kp",
  "germany": "de",
  "france": "fr",
  "italy": "it",
  "spain": "es",
  "canada": "ca",
  "australia": "au",
};

// pick country folder name
function pickCountryCode(countryRaw: string, userMap: Record<string,string>) {
  const s = String(countryRaw || "");
  // looks like alpha-2? accept as-is (lowercased)
  if (/^[A-Za-z]{2}$/.test(s)) return s.toLowerCase();

  const key = slug(s);
  if (!key) return "unknown";
  if (userMap[key]) return userMap[key];
  if (builtinMap[key]) return builtinMap[key];
  return key; // fallback to slug
}

function cityIndexPath(country: string, city: string, userMap: Record<string,string>) {
  const ccode = pickCountryCode(country, userMap);
  const cslug = slug(city || "unknown");
  return path.join(ROOT, ccode, cslug, `${cslug}.json`);
}

type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  address?: string;
  location?: { country?: string; city?: string };
};

// merge existing city aggregate (if exists) with new items; dedupe by id (new wins)
async function mergeWithExisting(outFile: string, items: Place[]) {
  let base: Place[] = [];
  try {
    const s = await fsp.readFile(outFile, "utf8");
    const json = JSON.parse(s);
    if (Array.isArray(json)) base = json;
  } catch {
    // no existing file -> start from empty
  }
  const byId = new Map<string, Place>();
  for (const p of base) if (p && p.id) byId.set(p.id, p);
  for (const p of items) if (p && p.id) byId.set(p.id, p); // new overrides old
  return Array.from(byId.values());
}

async function main() {
  const userCountryMap = await loadCountryMap();

  // 1) collect all flat single-place files
  //    ex) public/data/places/cpm:japan-tokyo-nakamoto-bakery-1.json
  const flatFiles = await glob(`${ROOT}/cpm:*.json`, { nodir: true });

  // bucket by city index path
  const buckets = new Map<string, Place[]>();

  for (const f of flatFiles) {
    try {
      const p = JSON.parse(await fsp.readFile(f, "utf8"));
      const country = p.country || p.location?.country || "unknown";
      const city = p.city || p.location?.city || "unknown";
      const out = cityIndexPath(country, city, userCountryMap);
      if (!buckets.has(out)) buckets.set(out, []);
      buckets.get(out)!.push(p);
    } catch (e) {
      console.warn(`[skip] bad json: ${f}`);
    }
  }

  // 2) write each city aggregate, MERGING with existing file (if any)
  let wrote = 0;
  for (const [out, arr] of buckets) {
    const merged = await mergeWithExisting(out, arr);
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, JSON.stringify(merged, null, 2) + "\n", "utf8");
    console.log(`[index] ${out} (${merged.length})`);
    wrote++;
  }

  if (wrote === 0) {
    console.log("[index] no cpm:* place files found (nothing to do)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
