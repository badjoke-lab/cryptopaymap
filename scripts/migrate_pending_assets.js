// scripts/migrate_pending_assets.js
// Fill required fields in pending_assets[*]: submitted_by, submitted_at
// No deps. Run with: node scripts/migrate_pending_assets.js

const fs = require("fs");
const path = require("path");

const ROOT = process.env.CPM_INPUT || "public/data/places";
const NOW = new Date().toISOString();
const BY = process.env.CPM_MIGRATOR || "system:migrate-penassets";

function listJsonFiles(root) {
  const out = [];
  function walk(d) {
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

function migrateFile(p) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    console.error(`Skip (invalid JSON): ${p}`);
    return 0;
  }

  const arr = Array.isArray(json)
    ? json
    : json.places || json.items || json.results || json.data || json.entries || [];

  if (!Array.isArray(arr)) return 0;

  let fixes = 0;

  for (const place of arr) {
    const pa = place && place.pending_assets;
    if (!Array.isArray(pa) || pa.length === 0) continue;

    for (const item of pa) {
      if (!item || typeof item !== "object") continue;

      if (!item.asset_raw && item.asset) item.asset_raw = String(item.asset);
      if (!item.chain_raw && item.chain) item.chain_raw = String(item.chain);

      if (!item.submitted_by) {
        item.submitted_by =
          (place.verification &&
            place.verification.submitted &&
            place.verification.submitted.by) ||
          (place.verification && place.verification.submitted_by) ||
          BY;
        fixes++;
      }
      if (!item.submitted_at) {
        item.submitted_at =
          (place.verification &&
            place.verification.submitted &&
            place.verification.submitted.at) ||
          (place.verification && place.verification.last_checked) ||
          NOW;
        fixes++;
      }
    }
  }

  if (fixes > 0) {
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  }
  return fixes;
}

function main() {
  const root = ROOT;
  if (!fs.existsSync(root)) {
    console.error(`Not found: ${root}`);
    process.exit(1);
  }
  const files = listJsonFiles(root);
  let filesTouched = 0;
  let fieldsFilled = 0;

  for (const f of files) {
    const n = migrateFile(f);
    if (n > 0) filesTouched++;
    fieldsFilled += n;
  }

  console.log(
    `pending_assets migration: files touched=${filesTouched}, fields filled=${fieldsFilled}`
  );
}

main();
