// scripts/strip_badge_emojis.ts
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "places");

// 先頭から取り除く記号（必要に応じて追加）
const BADGE_EMOJI = ["👑", "⭐", "📂", "⚠️", "⚠︎", "✅", "✔︎"];

// 正規表現メタ文字を安全にエスケープ
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const reLeading = new RegExp(
  `^(?:\\s*(?:${BADGE_EMOJI.map(escapeRegExp).join("|")})\\s*)+`,
  "u"
);

function strip(s?: string) {
  return String(s ?? "").replace(reLeading, "").trim();
}

async function* walk(dir: string): AsyncGenerator<string> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && p.endsWith(".json")) yield p;
  }
}

function sanitizeOne(obj: any): number {
  let changed = 0;
  const hit = (o: any) => {
    if (o && typeof o === "object" && typeof o.name === "string") {
      const s = o.name;
      const t = strip(s);
      if (s !== t) {
        o.name = t;
        changed++;
      }
    }
  };
  if (Array.isArray(obj)) obj.forEach(hit);
  else if (obj && typeof obj === "object") {
    if (Array.isArray(obj.places)) obj.places.forEach(hit);
    if (Array.isArray(obj.items)) obj.items.forEach(hit);
    if (Array.isArray(obj.results)) obj.results.forEach(hit);
    if (Array.isArray(obj.rows)) obj.rows.forEach(hit);
    if (Array.isArray(obj.markers)) obj.markers.forEach(hit);
    if (Array.isArray(obj.features)) obj.features.forEach((f: any) => hit(f?.properties));
    if (!("places" in obj || "items" in obj || "results" in obj || "rows" in obj || "markers" in obj || "features" in obj)) {
      hit(obj); // 単一オブジェクト形式にも対応
    }
  }
  return changed;
}

async function main() {
  const WRITE = process.argv.includes("--write");
  let changedFiles = 0,
    changedNames = 0;

  try {
    await fs.access(DATA_DIR);
  } catch {
    console.error(`[strip-badge-emojis] not found: ${DATA_DIR}`);
    process.exit(1);
  }

  for await (const file of walk(DATA_DIR)) {
    const raw = await fs.readFile(file, "utf8");
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const c = sanitizeOne(json);
    if (!c) continue;

    changedFiles++;
    changedNames += c;

    if (WRITE) {
      await fs.writeFile(file, JSON.stringify(json, null, 2) + "\n");
      console.log(`fix: ${file} (${c} names)`);
    } else {
      console.log(`would fix: ${file} (${c} names)`);
    }
  }

  console.log(
    `[strip-badge-emojis] files=${changedFiles} names=${changedNames} ${WRITE ? "written" : "(dry-run)"}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
