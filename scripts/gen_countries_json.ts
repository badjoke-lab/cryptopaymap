// scripts/gen_countries_json.ts
#!/usr/bin/env ts-node

/**
 * Generate public/data/meta/countries.json
 * - Format: [{ code: "JP", name: "Japan" }, ...]
 * - Source: i18n-iso-countries (official English names)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);

const ROOT = process.cwd();
const OUT_PATH =
  process.env.OUT ||
  path.join(ROOT, "public", "data", "meta", "countries.json");

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function main() {
  // Use official English names; returns { "AF": "Afghanistan", ... }
  const names = countries.getNames("en", { select: "official" }) as Record<
    string,
    string
  >;

  if (!names || typeof names !== "object") {
    die("Failed to load country names from i18n-iso-countries.");
  }

  // Normalize -> array
  const items = Object.entries(names).map(([code, name]) => {
    const c = String(code || "").trim().toUpperCase();
    const n = String(name || "").trim();
    if (!/^[A-Z]{2}$/.test(c) || !n) {
      // Skip anything unexpected (shouldn't happen)
      return null;
    }
    return { code: c, name: n };
  }).filter(Boolean) as Array<{ code: string; name: string }>;

  // Sort by name (stable, case-insensitive)
  items.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );

  // Ensure dir exists
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  // Write pretty JSON + trailing newline
  fs.writeFileSync(OUT_PATH, JSON.stringify(items, null, 2) + "\n", "utf8");

  console.log(`Wrote ${items.length} countries -> ${OUT_PATH}`);
}

main();
