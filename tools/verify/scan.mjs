// tools/verify/scan.mjs
// Minimal verifier: scan public JSON files, update labels/evidence.
// No JSDOM. Just fetch HTML, strip tags, and search keywords.

import fs from "fs";
import path from "path";
import fetchOrig from "node-fetch";

const VERBOSE = process.env.VERBOSE === "1";
const ROOT = "public";

// ---- default tunables (will be overridden by providers.json if present)
let CFG = {
  text_patterns: [
    "we accept bitcoin",
    "accept crypto",
    "pay with bitcoin",
    "bitcoin accepted",
    "支払い", "ビットコイン", "暗号", "仮想通貨", "btc"
  ],
  negative_text_patterns: [
    "do not accept bitcoin",
    "don’t accept bitcoin",
    "no bitcoin",
    "we no longer accept bitcoin",
    "not accept crypto",
    "no crypto",
    "bitcoin not accepted",
    "ビットコインは使えません",
    "仮想通貨は使えません"
  ],
  script_signatures: [
    // DOMは使わないので生HTML文字列中の一致のみ見る
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

// Merge external config if present
try {
  const p = path.join("tools", "verify", "providers.json");
  if (fs.existsSync(p)) {
    const loaded = JSON.parse(fs.readFileSync(p, "utf8"));
    CFG = { ...CFG, ...loaded };
  }
} catch (e) {
  // ignore config load errors
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
  return buf.toString("utf8"); // best-effort UTF-8
}

// ---------- text utils (no DOM) ----------
function stripTags(html) {
  // drop scripts/styles/links to reduce noise and avoid CSS/JS text
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<link\b[^>]*>/gi, "");
  // comments
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // collapse tags
  s = s.replace(/<[^>]+>/g, " ");
  // minimal entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return s;
}
const norm = (s) => (s || "").toString().toLowerCase();

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

function mergeVerification(obj, payload) {
  // Preserve existing verification; write under verification.auto to avoid clobbering manual decisions
  obj.verification = obj.verification || {};
  obj.verification.auto = { ...(obj.verification.auto || {}), ...payload };
}

// ---------- verify logic (no DOM) ----------
async function verifyOneUrl(u, seenProviders) {
  const out = { url: u, hits: 0, evidences: [], negative: false };

  const h = hostFrom(u);
  if (CFG.ignore_domains?.some(dom => h.endsWith(dom))) {
    vLog("skip ignored domain:", h);
    return out;
  }

  try {
    const htmlRaw = await getHtml(u);
    const html = norm(htmlRaw);
    const text = norm(stripTags(htmlRaw));

    // negative patterns -> immediate negative flag
    for (const neg of (CFG.negative_text_patterns || [])) {
      const p = norm(neg);
      if (p && text.includes(p)) {
        out.negative = true;
        out.evidences.push({ url: u, type: "negative", match: neg });
        return out;
      }
    }

    // text patterns
    for (const pat of (CFG.text_patterns || [])) {
      const p = norm(pat);
      if (p && text.includes(p)) {
        out.hits++;
        out.evidences.push({ url: u, type: "text", match: pat });
        if (out.hits >= (CFG.threshold || 4)) break;
      }
    }

    // script signatures (string search in raw HTML)
    for (const sig of (CFG.script_signatures || [])) {
      const m = norm(sig.match);
      if (m && html.includes(m) && !seenProviders.has(sig.name)) {
        out.hits++;
        seenProviders.add(sig.name);
        out.evidences.push({ url: u, type: sig.type || "widget", match: sig.name });
        if (out.hits >= (CFG.threshold || 4)) break;
      }
    }
  } catch (e) {
    vLog("fetch error:", u, e?.message || String(e));
    out.error = e?.message || String(e);
  }

  return out;
}

async function verifyEntry(entry) {
  const urls = extractCandidateUrls(entry);
  if (!urls.length) return { ok: false, reason: "no-urls" };

  const seenProviders = new Set();
  let totalHits = 0;
  let negatives = [];
  let evidences = [];

  for (const u of urls) {
    const r = await verifyOneUrl(u, seenProviders);
    if (r.negative) negatives.push(r);
    totalHits += r.hits;
    if (r.evidences?.length) evidences.push(...r.evidences);
    if (totalHits >= (CFG.threshold || 4)) break;
  }

  if (negatives.length) {
    return { ok: false, reason: "negative-match", evidences: negatives.flatMap(n => n.evidences) };
  }

  if (totalHits > 0) {
    return { ok: true, hits: totalHits, evidences };
  }

  return { ok: false, reason: "no-hits" };
}

async function verifyArray(arr) {
  let updated = 0;
  const concurrency = Math.max(1, CFG.max_parallel || 4);
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) break;

      const entry = arr[idx];
      const r = await verifyEntry(entry);

      const payload = {
        status: r.ok && r.hits >= (CFG.threshold || 4) ? "verified" : "unverified",
        hits: r.ok ? r.hits : 0,
        reason: r.ok ? undefined : r.reason,
        checkedAt: new Date().toISOString(),
        evidence: (r.evidences || []).slice(0, 20)
      };

      // Write under verification.auto only when we have something meaningful (including negative)
      if (r.ok || r.reason) {
        mergeVerification(entry, payload);
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
