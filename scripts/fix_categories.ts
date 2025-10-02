// scripts/fix_categories.ts
import fs from "fs";
import path from "path";

const ROOT = "public/data/places";

// allow-list (lowercase, underscore)
const ALLOWED = new Set([
  "cafe","bar","pub","restaurant","fast_food","supermarket","convenience","bakery",
  "butcher","greengrocer","books","jewelry","shoes","toys","gift","clothes","hairdresser",
  "optician","pharmacy","dentist","doctors","mobile_phone","travel_agency","ticket",
  "college","community_centre","music","video_games","interior_decoration","furniture",
  "garden_centre","motorcycle_rental","car_rental","nightclub","wine","tattoo","farm",
  "kiosk","newsagent","incense","beauty","other"
]);

function normalizeCategory(raw: any): string | undefined {
  if (typeof raw !== "string") return undefined;
  // drop trailing markers like " · Unverified"
  let v = raw.split(" · ")[0].trim();
  // normalize spaces/dashes to underscore and lowercase
  v = v.replace(/[ -]+/g, "_").toLowerCase();
  if (!v) return undefined;
  if (ALLOWED.has(v)) return v;
  // common remaps
  const remap: Record<string,string> = {
    "bar_pub": "bar",
    "coffee": "cafe",
    "super_market": "supermarket",
    "grocery": "convenience",
    "night_club": "nightclub",
  };
  if (remap[v]) return remap[v];
  return "other";
}

function loadJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function saveJson(p: string, j: any) {
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n", "utf8");
}

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const s = fs.statSync(q);
      if (s.isDirectory()) stack.push(q);
      else if (q.endsWith(".json")) out.push(q);
    }
  }
  return out;
}

function fixFile(file: string): boolean {
  const j = loadJson(file);
  const arr: any[] = Array.isArray(j) ? j : (j.places || j.items || j.results || j.data || j.entries || []);
  if (!Array.isArray(arr) || arr.length === 0) return false;

  let changed = false;
  for (const r of arr) {
    const before = r?.category;
    const after = normalizeCategory(before);
    if (after && after !== before) {
      r.category = after;
      changed = true;
    }
  }
  if (changed) {
    if (Array.isArray(j)) saveJson(file, arr);
    else {
      if (j.places) j.places = arr;
      else if (j.items) j.items = arr;
      else if (j.results) j.results = arr;
      else if (j.data) j.data = arr;
      else if (j.entries) j.entries = arr;
      saveJson(file, j);
    }
  }
  return changed;
}

function main() {
  const files = listJsonFiles(ROOT);
  let touched = 0;
  for (const f of files) {
    if (fixFile(f)) {
      touched++;
      console.log("[category-fixed]", f);
    }
  }
  console.log(`Done. files=${files.length}, category_fixed=${touched}`);
}

main();
