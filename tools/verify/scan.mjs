// tools/verify/scan.mjs
// Minimal verifier: scan public JSON files, update labels/evidence.
// Chat in Japanese, code in English.

import fs from "fs";
import path from "path";
import fetchOrig from "node-fetch";
import { JSDOM } from "jsdom";

const VERBOSE = process.env.VERBOSE === "1";
const ROOT = "public";
const THRESHOLD = 4;          // how many successes to consider "verified" (example)
const TIMEOUT_MS = 7000;      // per-request timeout 7s
const MAX_HTML_BYTES = 1_000_000; // 1MB cap
const CONCURRENCY = 6;

function vLog(...args) { if (VERBOSE) console.log("[verify]", ...args); }

// ---------- file collection ----------
function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) out = out.concat(collectJsonFiles(p));
    else if (p.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

function listTargets() {
  const t = [];
  const placesDir = path.join(ROOT, "data", "places");
  if (fs.existsSync(placesDir)) t.push(...collectJsonFiles(placesDir));
  const legacy = path.join(ROOT, "places.json");
  if (fs.existsSync(legacy)) t.push(legacy);
  return t.sort();
}

// ---------- network helpers ----------
async function fetchWithTimeout(url, opt = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...opt.headers,
  };
  try {
    const res = await fetchOrig(url, {
      redirect: "follow",
      signal: controller.signal,
      headers,
      // don’t send cookies, etc.
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function getHtml(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    // cap body size
    let buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES) buf = buf.subarray(0, MAX_HTML_BYTES);
    let html = buf.toString("utf8");
    // strip <style> blocks to avoid jsdom CSS parser choking on broken CSS
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    return html;
  } catch (e) {
    throw e;
  }
}

// ---------- verify logic (example & conservative) ----------
function extractCandidateUrls(entry) {
  // try common fields
  const urls = new Set();
  for (const k of ["url", "site", "website", "homepage"]) {
    if (typeof entry?.[k] === "string") urls.add(entry[k]);
  }
  // nested proof fields
  const proofs = entry?.verification || entry?.proofs || [];
  if (Array.isArray(proofs)) {
    for (const p of proofs) {
      if (typeof p?.url === "string") urls.add(p.url);
    }
  }
  // normalize
  return [...urls].filter(u => /^https?:\/\//i.test(u));
}

function setVerification(obj, payload) {
  obj.verification = { ...(obj.verification || {}), ...payload };
}

async function verifyEntry(entry) {
  const urls = extractCandidateUrls(entry);
  if (!urls.length) {
    return { ok: false, reason: "no-urls" };
  }

  let hits = 0;
  for (const u of urls) {
    try {
      const html = await getHtml(u);
      // placeholder: simple heuristic — contains brand words or bitcoin-ish words
      const text = new JSDOM(html, { runScripts: "outside-only" }).window.document
        .body?.textContent?.toLowerCase() || "";
      const needles = [
        "bitcoin",
        "btc",
        entry.name?.toLowerCase?.(),
        entry.brand?.toLowerCase?.(),
      ]
        .filter(Boolean)
        .map(s => s.trim())
        .filter(s => s.length > 2);

      const matched = needles.some(w => text.includes(w));
      if (matched) hits++;
      vLog("checked", u, matched ? "✓" : "…");
    } catch (e) {
      vLog("fetch error:", u, e.message || String(e));
    }
  }

  return { ok: hits >= 1, hits, urls: urls.length };
}

async function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    vLog("skip (invalid json):", filePath);
    return { filePath, updated: false };
  }

  // accept array or object-with-places
  let items = Array.isArray(json)
    ? json
    : json.places || json.items || json.results || json.data || json.entries;

  if (!Array.isArray(items) || items.length === 0) {
    vLog("empty or unsupported shape:", filePath);
    return { filePath, updated: false };
  }

  let changed = false;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    try {
      const r = await verifyEntry(e);
      const label = r.ok ? "verified" : "unverified";
      const prev = e?.verification?.label;
      if (prev !== label) {
        setVerification(e, { label, hits: r.hits, checkedAt: new Date().toISOString() });
        changed = true;
      }
    } catch (e) {
      vLog("entry error:", e.message || String(e));
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
    console.log("[verify] updated:", filePath);
  }
  return { filePath, updated: changed };
}

// ---------- small async pool ----------
async function pool(items, n, fn) {
  const ret = new Array(items.length);
  let next = 0, active = 0;
  return new Promise((resolve) => {
    const kick = () => {
      if (next === items.length && active === 0) return resolve(ret);
      while (active < n && next < items.length) {
        const i = next++, it = items[i];
        active++;
        Promise.resolve(fn(it))
          .then(r => (ret[i] = r))
          .catch(e => (ret[i] = { error: e }))
          .finally(() => { active--; kick(); });
      }
    };
    kick();
  });
}

// ---------- main ----------
(async function main() {
  const targets = listTargets();
  vLog("targets:", targets.length);
  const results = await pool(targets, CONCURRENCY, processFile);

  const updated = results.filter(r => r?.updated).length;
  console.log("[verify] total updated entries:", updated);
})();
