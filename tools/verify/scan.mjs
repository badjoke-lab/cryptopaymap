// tools/verify/scan.mjs
// Minimal verifier: scan public JSON files, update labels/evidence.
// No JSDOM. Just fetch HTML, strip tags, and search keywords.

import fs from "fs";
import path from "path";
import fetchOrig from "node-fetch";

const VERBOSE = process.env.VERBOSE === "1";
const ROOT = "public";

// tunables (providers.json があればそれを優先)
let CFG = {
  text_patterns: [
    "we accept bitcoin",
    "accept crypto",
    "pay with bitcoin",
    "bitcoin accepted",
    "支払い", "ビットコイン", "暗号", "仮想通貨",
    "btc"
  ],
  script_signatures: [
    // kept for future; we don't parse DOM, but we can text-search HTML for src URLs
    { name: "btcpay",            match: "btcpayserver",          type: "widget" },
    { name: "coinbase-commerce", match: "commerce.coinbase.com", type: "widget" },
    { name: "nowpayments",       match: "nowpayments.io",        type: "widget" },
    { name: "bitpay",            match: "bitpay.com",            type: "widget" },
    { name: "coingate",          match: "coingate.com",          type: "widget" }
  ],
  ignore_domains: ["wixsite.com", "square.site", "shopify.com"],
  threshold: 4,
  timeout_ms: 15000,
  max_parallel: 6,
  max_html_bytes: 1_000_000
};

try {
  const p = path.join("tools", "verify", "providers.json");
  if (fs.existsSync(p)) {
    const loaded = JSON.parse(fs.readFileSync(p, "utf8"));
    CFG = { ...CFG, ...loaded };
  }
} catch (e) {
  // ignore
}

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
  vLog("target files:", t.length);
  for (const f of t.slice(0, 50)) vLog("target:", f);
  return t.sort();
}

// ---------- network helpers ----------
async function fetchWithTimeout(url, opt = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), CFG.timeout_ms);
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
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function getHtml(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > CFG.max_html_bytes) buf = buf.subarray(0, CFG.max_html_bytes);
  // always decode as utf8 (best-effort)
  return buf.toString("utf8");
}

// ---------- text utils (no DOM) ----------
function stripTags(html) {
  // drop scripts/styles/links quickly to reduce noise and avoid CSS/JS text
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<link\b[^>]*>/gi, "");
  // remove comments
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // collapse tags
  s = s.replace(/<[^>]+>/g, " ");
  // decode minimal entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return s;
}

function norm(s) {
  return (s || "").toString().toLowerCase();
}

function hostFrom(urlStr) {
  try { return new URL(urlStr).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function extractCandidateUrls(entry) {
  const urls = new Set();
  for (const k of ["url", "site", "website", "homepage"]) {
    if (typeof entry?.[k] === "string") urls.add(entry[k]);
  }
  const proofs = entry?.verification || entry?.proofs || [];
  if (Array.isArray(proofs)) {
    for (const p of proofs) {
      if (typeof p?.url === "string") urls.add(p.url);
    }
  }
  return [...urls].filter(u => /^https?:\/\//i.test(u));
}

function setVerification(obj, payload) {
  obj.verification = { ...(obj.verification || {}), ...payload };
}

// ---------- verify logic (no DOM) ----------
async function verifyEntry(entry) {
  const urls = extractCandidateUrls(entry);
  if (!urls.length) return { ok: false, reason: "no-urls" };

  let hits = 0;
  const seenProviders = new Set();
  const evidences = [];

  for (const u of urls) {
    const h = hostFrom(u);
    if (CFG.ignore_domains.some(dom => h.endsWith(dom))) {
      vLog("skip ignored domain:", h);
      continue;
    }
    try {
      const html = await getHtml(u);
      const text = norm(stripTags(html));

      // text patterns
      for (const pat of CFG.text_patterns || []) {
        const p = norm(pat);
        if (p && text.includes(p)) {
          hits++;
          evidences.push({ url: u, type: "text", match: pat });
          if (hits >= CFG.threshold) break;
        }
      }

      // crude “script signatures” by plain string search in HTML source
      for (const sig of CFG.script_signatures || []) {
        const m = norm(sig.match);
        if (m && norm(html).includes(m) && !seenProviders.has(sig.name)) {
          hits++;
          seenProviders.add(sig.name);
          evidences.push({ url: u, type: sig.type || "widget", match: sig.name });
          if (hits >= CFG.threshold) break;
        }
      }

      if (hits >= CFG.threshold) break;

    } catch (e) {
      vLog("fetch error:", u, e?.message || String(e));
    }
  }

  if (hits > 0) {
    return { ok: true, hits, evidences };
  }
  return { ok: false, reason: "no-hits" };
}

async function verifyArray(arr) {
  let updated = 0;
  const concurrency = Math.max(1, CFG.max_parallel || 4);
  let i = 0;

  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      const entry = arr[idx];
      const r = await verifyEntry(entry);
      if (r.ok) {
        setVerification(entry, {
          status: r.hits >= (CFG.threshold || 4) ? "✅" : "⚠︎",
          hits: r.hits,
          updatedAt: new Date().toISOString(),
          evidence: r.evidences?.slice(0, 10) || []
        });
        updated++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.allSettled(workers);
  return updated;
}

function detectArray(js) {
  if (Array.isArray(js)) return js;
  return js.places || js.items || js.results || js.data || js.entries || null;
}

async function run() {
  const files = listTargets();
  let totalUpdated = 0;

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      vLog("skip unreadable:", file);
      continue;
    }

    let js;
    try {
      js = JSON.parse(raw);
    } catch {
      vLog("skip invalid json:", file);
      continue;
    }

    const arr = detectArray(js);
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
      vLog("empty or unsupported shape:", file);
      continue;
    }

    const updated = await verifyArray(arr);
    if (updated > 0) {
      fs.writeFileSync(file, JSON.stringify(js, null, 2) + "\n");
      console.log("[verify] updated:", file);
      totalUpdated += updated;
    }
  }

  console.log("[verify] total updated entries:", totalUpdated);
}

run().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
