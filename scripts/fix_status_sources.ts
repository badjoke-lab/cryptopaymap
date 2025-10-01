// scripts/fix_status_sources.ts
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

type Status = "owner" | "community" | "directory" | "unverified";

const ROOT = process.cwd();
const ALLOWED_STATUS = new Set<Status>(["owner","community","directory","unverified"]);

// NOTE: include legacy "verified" -> directory
const STATUS_MAP: Record<string, Status> = {
  "owner-verified": "owner",
  "owner_verified": "owner",
  "ownerverified": "owner",
  "ownersubmitted": "owner",
  "owner": "owner",

  "community-verified": "community",
  "community_verified": "community",
  "communityverified": "community",
  "communitysubmitted": "community",
  "community": "community",

  "directory-listed": "directory",
  "directory_listed": "directory",
  "directory-verified": "directory",
  "directory_verified": "directory",
  "directorysourced": "directory",
  "directory": "directory",

  "verified": "directory",   // ← 追加：曖昧な verified は directory に寄せる
  "pending": "unverified",
  "unknown": "unverified",
  "unverified": "unverified"
};

const SOURCE_ALLOWED = new Set(["type","name","rule","url","snippet","when"] as const);
const SOURCE_TYPE_ALLOWED = new Set([
  "official_site",
  "provider_directory",
  "text",
  "widget",
  "receipt",
  "screenshot",
  "other"
]);

function discoverFiles(): string[] {
  const out = new Set<string>();
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const st = fs.statSync(q);
      if (st.isDirectory()) walk(q);
      else if (q.toLowerCase().endsWith(".json")) out.add(q);
    }
  };
  walk(path.join(ROOT, "public", "data", "places"));
  const top = path.join(ROOT, "public", "places.json");
  if (fs.existsSync(top)) out.add(top);
  return Array.from(out).sort();
}

function loadList(file: string): { list: any[], base: any } {
  const base = JSON.parse(fs.readFileSync(file, "utf8"));
  const list: any[] = Array.isArray(base)
    ? base
    : (base.places || base.items || base.results || base.data || base.entries || []);
  return { list: Array.isArray(list) ? list : [], base };
}

function saveList(file: string, list: any[], base: any) {
  if (Array.isArray(base)) {
    fs.writeFileSync(file, JSON.stringify(list, null, 2) + "\n", "utf8");
  } else {
    if (base.places) base.places = list;
    else if (base.items) base.items = list;
    else if (base.results) base.results = list;
    else if (base.data) base.data = list;
    else if (base.entries) base.entries = list;
    else base.places = list;
    fs.writeFileSync(file, JSON.stringify(base, null, 2) + "\n", "utf8");
  }
}

function normalizeStatus(v: unknown): Status | undefined {
  if (typeof v !== "string") return undefined;
  const k = v.trim().toLowerCase();
  if (ALLOWED_STATUS.has(k as Status)) return k as Status;
  const compact = k.replace(/[\s_\-]+/g, "");
  if (STATUS_MAP[k]) return STATUS_MAP[k];
  if (STATUS_MAP[compact]) return STATUS_MAP[compact];
  return undefined;
}

function cleanSources(a: any): any[] | undefined {
  if (!Array.isArray(a)) return undefined;
  const out: any[] = [];
  for (const s of a) {
    if (!s || typeof s !== "object") continue;
    const obj: any = {};
    for (const k of Object.keys(s)) {
      if (SOURCE_ALLOWED.has(k as any)) obj[k] = s[k];
    }
    if (typeof obj.type === "string") {
      const t = obj.type.trim();
      obj.type = SOURCE_TYPE_ALLOWED.has(t) ? t : "other";
    }
    if (typeof obj.url !== "string") continue;
    out.push(obj);
  }
  return out.length ? out : undefined;
}

function fixFile(file: string): boolean {
  const { list, base } = loadList(file);
  if (!list.length) return false;

  let touched = false;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const v = r.verification;
    if (v && typeof v === "object") {
      const before = v.status;
      const norm = normalizeStatus(before);
      if (norm && norm !== before) { v.status = norm; touched = true; }

      if (Array.isArray(v.sources)) {
        const cleaned = cleanSources(v.sources);
        if (cleaned) {
          const b = JSON.stringify(v.sources);
          const a = JSON.stringify(cleaned);
          if (a !== b) { v.sources = cleaned; touched = true; }
        } else if (v.sources && v.sources.length) {
          delete v.sources; touched = true;
        }
      }
    }
  }

  if (touched) saveList(file, list, base);
  if (touched) console.log("[fixed]", file);
  return touched;
}

function main() {
  const files = process.env.CPM_INPUT
    ? [path.resolve(process.env.CPM_INPUT)]
    : discoverFiles();

  let changed = 0;
  for (const f of files) if (fixFile(f)) changed++;
  console.log(`Done. files_changed=${changed}`);
}
main();
