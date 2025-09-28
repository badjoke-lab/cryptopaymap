// Minimal verifier: scan public JSON files, label entries, write back.
// Chat in Japanese, code in English.

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const VERBOSE = process.env.VERBOSE === "1";
const ROOT = "public";
const PROVIDERS_PATH = "tools/verify/providers.json";
const PROVIDERS = fs.existsSync(PROVIDERS_PATH)
  ? JSON.parse(fs.readFileSync(PROVIDERS_PATH, "utf8"))
  : { script_signatures: [], text_patterns: [] };

// parameters (conservative defaults)
const THRESHOLD = 4;
const TIMEOUT_MS = 15000;

// -------- helpers --------
function vLog(...args) { if (VERBOSE) console.log("[verify]", ...args); }

function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out = out.concat(collectJsonFiles(p));
    else if (p.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

// target files = public/data/places/** + public/places.json (if exists)
const TARGET_FILES = [
  ...collectJsonFiles(path.join(ROOT, "data", "places")),
  ...(fs.existsSync(path.join(ROOT, "places.json")) ? [path.join(ROOT, "places.json")] : [])
].sort();

vLog("target files:", TARGET_FILES.length);
for (const f of TARGET_FILES.slice(0, 10)) vLog("target:", f);

function stampDate() {
  return new Date().toISOString().slice(0, 10);
}

function labelCat(cat, tag) {
  if (!cat) return tag;
  if (/(?: · )?(Verified|Unverified|Disputed|Outdated)\b/.test(cat)) return cat;
  return `${cat} · ${tag}`;
}

// Accept multiple URL keys; don't break UI (data only)
function normalizePlace(p) {
  const coins =
    Array.isArray(p?.coins) ? p.coins
    : (typeof p?.coins === "string" ? [p.coins] : []);

  // URL fallbacks: url -> website -> homepage -> site
  const url = p?.url || p?.website || p?.homepage || p?.site || "";

  const name = String(p?.name || "Unnamed");
  return { ...p, name, url, coins };
}

async function checkUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return { score: 0, hits: [] };
  try {
    const res = await fetch(url, { redirect: "follow", timeout: TIMEOUT_MS });
    if (!res.ok) return { score: 0, hits: [] };

    const html = await res.text();
    const dom = new JSDOM(html);
    const text = dom.window.document.body.textContent?.toLowerCase() || "";

    let score = 0;
    const hits = [];

    // text patterns
    for (const p of PROVIDERS.text_patterns || []) {
      const needle = String(p).toLowerCase();
      if (needle && text.includes(needle)) { score += 2; hits.push({ type: "text", p }); }
    }

    // script/link signatures
    const nodes = [...dom.window.document.querySelectorAll("script,link")];
    for (const el of nodes) {
      const src = (el.getAttribute("src") || el.getAttribute("href") || "").toLowerCase();
      for (const sig of PROVIDERS.script_signatures || []) {
        const m = String(sig.match || "").toLowerCase();
        if (m && src.includes(m)) { score += 3; hits.push({ type: sig.type || "widget", name: sig.name || m }); }
      }
    }

    return { score, hits };
  } catch (e) {
    vLog("fetch error:", url, (e && e.message) || e);
    return { score: 0, hits: [] };
  }
}

function nextNameWithPrefix(name, prefix) {
  return (/^(✅|⚠︎|❓|⏳)\s/.test(name) ? name : `${prefix}${name}`);
}

// -------- main --------
(async () => {
  let touched = 0;

  for (const file of TARGET_FILES) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`[verify] skip (invalid JSON): ${file}`);
      continue;
    }

    // accept multiple container shapes
    let arr = Array.isArray(raw)
      ? raw
      : (raw.places || raw.items || raw.results || raw.data || raw.entries || []);

    // if still not an array, skip quietly
    if (!Array.isArray(arr) || arr.length === 0) {
      vLog("empty or unsupported shape:", file);
      continue;
    }

    let changed = false;

    for (let i = 0; i < arr.length; i++) {
      const p0 = normalizePlace(arr[i]);

      // fetch & score
      const res = await checkUrl(p0.url);
      const verified = res.score >= THRESHOLD;

      const tag = verified ? "Verified" : "Unverified";
      const nameTagPrefix = verified ? "✅ " : "⚠︎ ";

      const name = nextNameWithPrefix(p0.name, nameTagPrefix);
      const category = labelCat(p0.category || "", tag);

      const verification = {
        status: verified ? "verified" : "unverified",
        last_checked: stampDate(),
        sources: verified ? [{ type: "official_site", url: p0.url, hits: res.hits }] : []
      };

      const next = { ...arr[i], name, category, verification };
      if (verified) next.last_verified = stampDate();

      const before = JSON.stringify(arr[i]);
      const after = JSON.stringify(next);
      if (before !== after) {
        arr[i] = next;
        changed = true;
        touched++;
      }
    }

    if (changed) {
      const out = Array.isArray(raw) ? arr : { ...raw, places: arr };
      fs.writeFileSync(file, JSON.stringify(out, null, 2));
      console.log(`[verify] updated: ${file}`);
    }
  }

  console.log(`[verify] total updated entries: ${touched}`);
})();
