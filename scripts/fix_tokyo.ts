// scripts/fix_tokyo.ts
/* eslint-disable no-console */
import fs from "fs";

const FILE = "public/data/places/jp/tokyo/tokyo.json";

const STATUS_MAP: Record<string, "owner" | "community" | "directory" | "unverified"> = {
  // common variants
  "owner-verified": "owner",
  "owner_verified": "owner",
  "ownerverified": "owner",
  "owner": "owner",
  "community-verified": "community",
  "community_verified": "community",
  "communityverified": "community",
  "community": "community",
  "directory-listed": "directory",
  "directory_listed": "directory",
  "directory-verified": "directory",
  "directory_verified": "directory",
  "directory": "directory",
  "unverified": "unverified",
  "pending": "unverified",
  "unknown": "unverified"
};

const SOURCE_ALLOWED = new Set(["type", "name", "rule", "url", "snippet", "when"]);

function load(): any[] {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.places)) return raw.places;
  throw new Error("Unexpected JSON shape in tokyo.json");
}

function save(list: any[], base: any) {
  if (Array.isArray(base)) {
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2) + "\n", "utf8");
  } else {
    base.places = list;
    fs.writeFileSync(FILE, JSON.stringify(base, null, 2) + "\n", "utf8");
  }
}

function normalizeStatus(v: unknown) {
  if (typeof v !== "string") return undefined;
  const k = v.trim().toLowerCase();
  if (STATUS_MAP[k]) return STATUS_MAP[k];
  // already valid?
  if (["owner", "community", "directory", "unverified"].includes(k as any)) return k as any;
  return undefined;
}

function cleanSources(a: any): any[] | undefined {
  const srcs = Array.isArray(a) ? a : [];
  const out: any[] = [];
  for (const s of srcs) {
    if (!s || typeof s !== "object") continue;
    const obj: any = {};
    for (const k of Object.keys(s)) {
      if (SOURCE_ALLOWED.has(k)) obj[k] = s[k];
    }
    if (obj.type && obj.url) out.push(obj);
  }
  return out.length ? out : undefined;
}

function main() {
  const base = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const list = Array.isArray(base) ? base : (base.places || []);
  let touched = 0;

  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    // status
    if (r.verification && typeof r.verification === "object") {
      const before = r.verification.status;
      const norm = normalizeStatus(before);
      if (norm && norm !== before) {
        r.verification.status = norm;
        touched++;
      }
      // sources
      if (Array.isArray(r.verification.sources)) {
        const cleaned = cleanSources(r.verification.sources);
        if (cleaned) {
          const beforeStr = JSON.stringify(r.verification.sources);
          r.verification.sources = cleaned;
          const afterStr = JSON.stringify(cleaned);
          if (beforeStr !== afterStr) touched++;
        }
      }
    }
  }

  save(list, base);
  console.log(`fixed tokyo.json, touched=${touched}`);
}

main();
