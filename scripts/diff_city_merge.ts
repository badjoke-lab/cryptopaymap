#!/usr/bin/env ts-node

/**
 * Diff report: city index (<cc>/<city>/<city>.json) vs cpm:* singles
 * - 選択した国コード/都市の index に、該当 cpm 単票が入っているかを検査
 * - レポートを public/_reports/diff_<cc>_<cityslug>.json に出力
 *
 * 使い方:
 *   pnpm exec ts-node --project tsconfig.scripts.json scripts/diff_city_merge.ts --country JP --city Tokyo
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { glob } from "glob";

type Place = {
  id: string;
  name?: string;
  lat?: number;
  lng?: number;
  address?: string;
  city?: string;
  country?: string; // "JP" or "Japan" など混在の可能性
  website?: string | null;
  external_ids?: Record<string, string>;
  verification?: any;
  location?: any;
  history?: any[];
};

const ROOT = "public/data/places";
const REPORT_DIR = "public/_reports";

// ---------- tiny utils ----------
function toCitySlug(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCountryToCC(val: string | undefined): string {
  if (!val) return "";
  const s = String(val).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase(); // すでに2文字コード

  const lower = s.toLowerCase();
  // よくある表記だけざっと吸収（ここは forms の CountryCode で今後安定化）
  const map: Record<string, string> = {
    japan: "JP",
    "日本": "JP",
    "jpn": "JP",
    "jp": "JP",
    "united states": "US",
    "usa": "US",
    "us": "US",
    germany: "DE",
    deutschland: "DE",
    france: "FR",
    "united kingdom": "GB",
    uk: "GB",
    spain: "ES",
    italy: "IT",
    canada: "CA",
    australia: "AU",
    singapore: "SG",
    india: "IN",
  };
  return map[lower] || s.toUpperCase(); // 不明なら大文字化（将来: i18n-iso-countriesに差し替え）
}

function safeReadJSON<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

// ---------- main ----------
async function main() {
  // 引数
  const args = process.argv.slice(2);
  const countryArg = getFlag(args, "--country") || getFlag(args, "-c") || "";
  const cityArg = getFlag(args, "--city") || getFlag(args, "-C") || "";
  if (!countryArg || !cityArg) {
    console.error("Usage: scripts/diff_city_merge.ts --country <CC|Name> --city <CityName>");
    process.exit(2);
  }

  // 標準化
  const cc = normalizeCountryToCC(countryArg);
  const cityName = cityArg.trim();
  const citySlug = toCitySlug(cityName);

  // index(baseline) のロード
  const indexPath = path.join(ROOT, cc.toLowerCase(), citySlug, `${citySlug}.json`);
  const baselineArr = safeReadJSON<Place[]>(indexPath) || [];
  const baselineIds = new Set(baselineArr.map((p) => p.id));

  // 対象都市の cpm 単票を抽出（country/city フィールドに基づく）
  const singleFiles = await glob(`${ROOT}/cpm:*\\.json`, { nodir: true });
  const singlesForCity: Place[] = [];

  for (const f of singleFiles) {
    const p = safeReadJSON<Place>(f);
    if (!p || !p.id?.startsWith("cpm:")) continue;

    // city / country のゆらぎに耐える
    const pCity = (p.city || "").trim().toLowerCase();
    const pCC = normalizeCountryToCC(p.country);
    if (!pCity || !pCC) continue;

    if (pCity === citySlug || toCitySlug(pCity) === citySlug || toCitySlug(p.city || "") === citySlug) {
      if (pCC === cc) {
        singlesForCity.push(p);
      }
    }
  }

  const expectedIds = new Set(singlesForCity.map((p) => p.id));
  const missingInIndex = [...expectedIds].filter((id) => !baselineIds.has(id)); // indexに未収録の cpm
  const extraCpmInIndex = [...baselineIds].filter((id) => id.startsWith("cpm:") && !expectedIds.has(id)); // index側にあるが該当 cpm が無い

  await fsp.mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `diff_${cc.toLowerCase()}_${citySlug}.json`);
  const report = {
    country: cc,
    city: cityName,
    indexPath,
    counts: {
      baseline: baselineArr.length,
      singlesForCity: singlesForCity.length,
      missingInIndex: missingInIndex.length,
      extraCpmInIndex: extraCpmInIndex.length,
    },
    missingInIndex,     // これらを index に追加すべき
    extraCpmInIndex,    // これらは index から外す/原因調査
    singlesPreview: singlesForCity.map((p) => ({ id: p.id, name: p.name })),
  };
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`[diff] country=${cc} city=${cityName}`);
  console.log(` - baseline items: ${baselineArr.length}`);
  console.log(` - cpm singles for city: ${singlesForCity.length}`);
  console.log(` - missing in index (should be added): ${missingInIndex.length}`);
  console.log(` - extra cpm in index (unexpected): ${extraCpmInIndex.length}`);
  console.log(`[diff] report saved: ${reportPath}`);
}

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return;
  return argv[i + 1];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
