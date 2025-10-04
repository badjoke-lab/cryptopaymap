// scripts/migrate_pending_assets.ts
import fs from "fs";
import path from "path";

const ROOT = process.env.CPM_INPUT || "public/data/places";
const NOW = new Date().toISOString();
const BY = process.env.CPM_MIGRATOR || "system:migrate-penassets";

function listJsonFiles(root: string): string[] {
  const out: string[] = [];
  function walk(d: string) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const st = fs.statSync(q);
      if (st.isDirectory()) walk(q);
      else if (q.endsWith(".json")) out.push(q);
    }
  }
  const st = fs.statSync(root);
  if (st.isDirectory()) walk(root);
  else if (root.endsWith(".json")) out.push(root);
  return out.sort();
}

function migrateFile(p: string): number {
  const raw = fs.readFileSync(p, "utf8");
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error(`Skip (invalid json): ${p}`);
    return 0;
  }

  const arr = Array.isArray(json)
    ? json
    : json.places || json.items || json.results || json.data || json.entries || [];

  if (!Array.isArray(arr)) return 0;

  let fixes = 0;

  for (const place of arr) {
    const pa = place?.pending_assets;
    if (!Array.isArray(pa) || pa.length === 0) continue;

    for (const item of pa) {
      if (item && typeof item === "object") {
        if (!item.asset_raw && item.asset) item.asset_raw = String(item.asset);
        if (!item.chain_raw && item.chain) item.chain_raw = String(item.chain);

        if (!item.submitted_by) {
          // 導出できるなら verification.submitted.by を使う
          item.submitted_by =
            place?.verification?.submitted?.by ||
            place?.verification?.submitted_by ||
            BY;
          fixes++;
        }
        if (!item.submitted_at) {
          // 導出できるなら verification.last_checked / submitted.at を使う
          item.submitted_at =
            place?.verification?.submitted?.at ||
            place?.verification?.last_checked ||
            NOW;
          fixes++;
        }
      }
    }
  }

  if (fixes > 0) {
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  }
  return fixes;
}

function main() {
  const files = listJsonFiles(ROOT);
  let total = 0;
  let fixed = 0;

  for (const f of files) {
    const n = migrateFile(f);
    total += n > 0 ? 1 : 0;
    fixed += n;
  }

  console.log(`pending_assets migration: files touched=${total}, fields filled=${fixed}`);
}

main();
