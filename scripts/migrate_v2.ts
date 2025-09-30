// /scripts/migrate_v2.ts
import fs from "fs";
import path from "path";

type Place = any;

const INPUT = process.env.CPM_INPUT || "public/places.json";
const OUTPUT = process.env.CPM_OUTPUT || INPUT;
const DEFAULT_STATUS = (process.env.CPM_DEFAULT_STATUS || "directory") as
  | "directory"
  | "unverified";

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p: string, data: any) =>
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");

function normalizeStatus(s: any): "owner" | "community" | "directory" | "unverified" {
  const v = String(s || "").toLowerCase();
  if (["owner", "owner_verified"].includes(v)) return "owner";
  if (["community", "community_verified", "non_owner"].includes(v)) return "community";
  if (["directory", "directory_listed", "directory_verified", "listed"].includes(v)) return "directory";
  if (["unverified", "pending", ""].includes(v)) return "unverified";
  return DEFAULT_STATUS;
}

function pick<T extends object>(obj: T, keys: (keyof T)[]) {
  const out: any = {};
  for (const k of keys) if (k in obj) out[k] = (obj as any)[k];
  return out;
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function migratePlace(p: Place): Place {
  const base = pick(p, ["id", "name", "lat", "lng", "city", "country", "address", "category", "coins", "website"]);

  // derive old status if existed
  const oldStatus =
    p.verification?.status ??
    p.status ??
    p.verification?.level ??
    (p.sources?.length ? "directory" : undefined);

  const status = normalizeStatus(oldStatus);

  const verification: any = {
    status
  };

  // carry over meta if present
  if (p.verification?.last_checked) verification.last_checked = p.verification.last_checked;
  if (p.verification?.last_verified) verification.last_verified = p.verification.last_verified;

  // sources normalize
  const srcs: any[] = [];
  const oldSources = p.verification?.sources || p.sources || [];
  for (const s of oldSources) {
    if (!s) continue;
    const type = s.type || s.kind || s.category || "other";
    const url = s.url || s.href;
    if (!url) continue;
    srcs.push({
      type: type
        .toString()
        .toLowerCase()
        .replace(/\s+/g, "_"),
      name: s.name,
      rule: s.rule,
      url,
      snippet: s.snippet,
      when: s.when
    });
  }
  if (srcs.length) verification.sources = srcs;

  // submitted_by normalize
  const submitted_by = p.verification?.submitted_by || p.submitted_by;
  if (submitted_by) {
    const v = submitted_by.toString().toLowerCase();
    verification.submitted_by = ["owner", "self", "third-party", "unknown"].includes(v) ? v : "unknown";
  }

  // submitted / review (if present keep)
  if (p.verification?.submitted) verification.submitted = p.verification.submitted;
  if (p.verification?.review) verification.review = p.verification.review;

  // profile: keep only for owner/community
  let profile = p.profile;
  if (!(status === "owner" || status === "community")) {
    profile = undefined;
  }

  // media: enforce policy here? -> leave to validator, but drop for non owner/community to be safe
  let media = p.media;
  if (!(status === "owner" || status === "community")) {
    media = undefined;
  }

  const migrated: Place = { ...base, verification };
  if (profile) migrated.profile = profile;
  if (media) migrated.media = media;

  return migrated;
}

function stableSortKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stableSortKeys);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = stableSortKeys(obj[k]);
    }
    return out;
  }
  return obj;
}

function main() {
  const inputPath = path.resolve(INPUT);
  const data = readJson(inputPath);
  if (!Array.isArray(data)) {
    console.error("places.json must be an array");
    process.exit(1);
  }
  const migrated = data.map(migratePlace).map(stableSortKeys);

  // 有意差分のみ：同一なら書き戻さない
  const originalStable = data.map(stableSortKeys);
  const changed = !deepEqual(originalStable, migrated);

  if (!changed) {
    console.log("No significant changes. Skip writing.");
    process.exit(0);
  }

  writeJson(OUTPUT, migrated);
  console.log(`Migrated ${migrated.length} records -> ${OUTPUT}`);
}

main();
