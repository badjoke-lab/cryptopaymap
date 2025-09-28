// Node 20+ required (global fetch). Parses public JSON, adds verification info,
// and creates minimal, reviewable diffs. Coins are NEVER removed/overwritten.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "../../..");
const PUB  = path.join(ROOT, "public");

const PROVIDERS = JSON.parse(fs.readFileSync(path.join(__dirname, "providers.json"), "utf8"));
const THRESHOLD = Number(PROVIDERS.threshold ?? 4);
const TIMEOUT_MS = Number(PROVIDERS.timeout_ms ?? 15000);
const MAX_PARALLEL = Number(PROVIDERS.max_parallel ?? 6);
const IGNORE = new Set(PROVIDERS.ignore_domains ?? []);

const TARGET_FILES = [
  ...collectJsonFiles(path.join(PUB, "data", "places")),
  ...(fs.existsSync(path.join(PUB, "places.json")) ? [path.join(PUB, "places.json")] : [])
];

function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...collectJsonFiles(p));
    else if (p.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

function arrFromRoot(js) {
  if (Array.isArray(js)) return js;
  if (Array.isArray(js.places)) return js.places;
  if (Array.isArray(js.items))  return js.items;
  if (Array.isArray(js.results))return js.results;
  return null;
}
function putBack(root, arr) {
  if (Array.isArray(root)) return arr;
  if ("places" in (root||{}))  return { ...root, places: arr };
  if ("items"  in (root||{}))  return { ...root, items:  arr };
  if ("results"in (root||{}))  return { ...root, results: arr };
  return arr;
}

function normalizedName(n) {
  const s = typeof n === "string" && n.trim() ? n.trim() : "Unnamed";
  return s;
}
function addPrefix(name, verified) {
  return /^(✅|⚠︎|❓|⏳)\s/.test(name) ? name : (verified ? `✅ ${name}` : `⚠︎ ${name}`);
}
function labelCategory(cat, tag) {
  const c = typeof cat === "string" ? cat : "";
  return (/(?:\s·\s)(Verified|Unverified|Disputed|Outdated)\b/.test(c))
    ? c
    : (c ? `${c} · ${tag}` : tag);
}

function urlFromPlace(p) {
  const u = (p.url || p.website || p.site || p.link || "").toString().trim();
  return /^https?:\/\//i.test(u) ? u : "";
}
function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } }

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { redirect: "follow", signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
async function checkUrl(url) {
  if (!url) return { score: 0, hits: [] };
  if (IGNORE.has(domainOf(url))) return { score: 0, hits: [] };
  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!res.ok) return { score: 0, hits: [] };
    const html = await res.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    let score = 0; const hits = [];
    const text = (doc.body?.textContent || "").toLowerCase();

    for (const p of PROVIDERS.text_patterns) {
      if (text.includes(String(p).toLowerCase())) {
        score += 2; hits.push({ type: "text", p });
      }
    }
    for (const el of doc.querySelectorAll("script,link")) {
      const src = (el.getAttribute("src") || el.getAttribute("href") || "").toLowerCase();
      if (!src) continue;
      for (const sig of PROVIDERS.script_signatures) {
        if (src.includes(sig.match.toLowerCase())) {
          score += 3; hits.push({ type: sig.type, name: sig.name });
        }
      }
    }
    return { score, hits };
  } catch {
    return { score: 0, hits: [] };
  }
}

function today() { return new Date().toISOString().slice(0,10); }

async function limitAll(limit, tasks) {
  const pool = new Set();
  const results = [];
  for (const t of tasks) {
    const p = Promise.resolve().then(t);
    results.push(p);
    pool.add(p);
    const done = () => pool.delete(p);
    p.then(done, done);
    if (pool.size >= limit) await Promise.race(pool);
  }
  return Promise.all(results);
}

(async () => {
  let touched = 0;
  for (const file of TARGET_FILES) {
    let root;
    try { root = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const arr = arrFromRoot(root);
    if (!Array.isArray(arr) || arr.length === 0) continue;

    let changed = false;

    await limitAll(MAX_PARALLEL, arr.map((orig, idx) => async () => {
      const name0 = normalizedName(orig.name);
      const url = urlFromPlace(orig);

      const verification = {
        status: "unverified",
        last_checked: today(),
        sources: [],
        ...(orig.verification || {})
      };

      let score = 0, hits = [];
      if (url) {
        const r = await checkUrl(url);
        score = r.score; hits = r.hits;
      }

      const isVerified = score >= THRESHOLD;
      const tag = isVerified ? "Verified" : "Unverified";

      const next = { ...orig };

      // name/category labeling (minimal, idempotent)
      next.name = addPrefix(name0, isVerified);
      next.category = labelCategory(orig.category, tag);

      // verification metadata
      next.verification = {
        ...verification,
        status: isVerified ? "verified" : "unverified",
        last_checked: today(),
        ...(isVerified ? { sources: [{ type: "official_site", url, hits }] } : {})
      };

      // last_verified only when verified
      if (isVerified) next.last_verified = today();

      // IMPORTANT: never remove or narrow coins
      // (If provider implies extra coins, add only; do not overwrite.)
      // -> This minimal version does not auto-add coins to avoid false positives.

      const before = JSON.stringify({ n: orig.name, c: orig.category, v: orig.verification, lv: orig.last_verified });
      const after  = JSON.stringify({ n: next.name, c: next.category, v: next.verification, lv: next.last_verified });
      if (before !== after) {
        arr[idx] = next;
        changed = true;
        touched++;
      }
    }));

    if (changed) {
      const out = putBack(root, arr);
      fs.writeFileSync(file, JSON.stringify(out, null, 2));
      console.log(`[verify] updated: ${path.relative(ROOT, file)}`);
    }
  }
  console.log(`[verify] total updated entries: ${touched}`);
})();
