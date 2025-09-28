// tools/verify/scan.mjs
// Minimal verifier: scan public JSON files, update labels/evidence.
// No DOM, no jsdom — parse HTML as text only.

import fs from "fs";
import path from "path";
import fetchOrig from "node-fetch";

// ---------- config ----------
const VERBOSE = process.env.VERBOSE === "1";
const ROOT = "public";
const DEFAULTS = {
  threshold: 4,
  timeout_ms: 15000,
  max_parallel: 6,
  text_patterns: [
    "we accept bitcoin",
    "accept crypto",
    "pay with bitcoin",
    "bitcoin accepted",
    "支払い",
    "ビットコイン",
    "暗号",
    "仮想通貨",
  ],
  ignore_domains: ["wixsite.com", "square.site", "shopify.com"],
};
const MAX_HTML_BYTES = 1_000_000; // 1MB cap

function vLog(...args) {
  if (VERBOSE) console.log("[verify]", ...args);
}

function loadConfig() {
  try {
    const p = path.join("tools", "verify", "providers.json");
    const js = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      ...DEFAULTS,
      ...js,
      text_patterns: js.text_patterns || DEFAULTS.text_patterns,
      ignore_domains: js.ignore_domains || DEFAULTS.ignore_domains,
      threshold: js.threshold || DEFAULTS.threshold,
      timeout_ms: js.timeout_ms || DEFAULTS.timeout_ms,
      max_parallel: js.max_parallel || DEFAULTS.max_parallel,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
const CFG = loadConfig();

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
  return t.sort();
}

// ---------- network helpers ----------
async function fetchWithTimeout(url, opt = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), CFG.timeout_ms);
  const headers = {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
  if (buf.length > MAX_HTML_BYTES) buf = buf.subarray(0, MAX_HTML_BYTES);
  return buf.toString("utf8");
}

// --- HTML => text (no DOM) ---
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
function htmlToText(html) {
  if (!html) return "";
  // strip scripts/styles/links/comments/tags; also kill @import lines if any slipped in
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/@import[^;]*;/gi, " ")
    .replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned).replace(/\s+/g, " ").trim().toLowerCase();
}

// ---------- verify logic ----------
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
  return [...urls]
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => /^https?:\/\//i.test(u));
}

function domainOf(u) {
  try {
    return new URL(u).hostname || "";
  } catch {
    return "";
  }
}

function setVerification(obj, payload) {
  obj.verification = { ...(obj.verification || {}), ...payload };
}

async function verifyEntry(entry) {
  const urls = extractCandidateUrls(entry);
  if (!urls.length) return { ok: false, reason: "no-urls" };

  let hits = 0;
  const evidence = [];
  const needles = [
    ...(CFG.text_patterns || []),
    entry.name?.toLowerCase?.(),
    entry.brand?.toLowerCase?.(),
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  for (const u of urls) {
    const host = domainOf(u);
    if (CFG.ignore_domains?.some((d) => host.endsWith(d))) {
      vLog("skip domain (ignored):", host);
      continue;
    }
    try {
      const html = await getHtml(u);
      const text = htmlToText(html);
      const matched = [];
      for (const key of needles) {
        if (!key) continue;
        if (text.includes(key)) matched.push(key);
      }
      if (matched.length) {
        hits += 1;
        evidence.push({ url: u, matched });
      }
      if (hits >= CFG.threshold) break;
    } catch (e) {
      vLog("fetch error:", u, e?.message);
      evidence.push({ url: u, error: String(e?.message || e) });
    }
  }

  const ok = hits >= CFG.threshold;
  return {
    ok,
    hits,
    threshold: CFG.threshold,
    checkedAt: new Date().toISOString(),
    evidence,
  };
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

function pickArrayShape(js) {
  if (Array.isArray(js)) return js;
  const keys = ["places", "items", "results", "data", "entries"];
  for (const k of keys) {
    if (Array.isArray(js?.[k])) return js[k];
  }
  return null;
}

async function processFile(file) {
  const js = readJson(file);
  if (!js) {
    vLog("empty or bad json:", file);
    return { updated: false };
  }
  const arr = pickArrayShape(js);
  if (!arr) {
    vLog("empty or unsupported shape:", file);
    return { updated: false };
  }

  let changed = false;
  for (const item of arr) {
    const result = await verifyEntry(item);
    if (!result) continue;
    const prev = JSON.stringify(item.verification || {});
    setVerification(item, {
      status: result.ok ? "verified" : "unverified",
      hits: result.hits,
      threshold: result.threshold,
      checkedAt: result.checkedAt,
      evidence: result.evidence,
    });
    const next = JSON.stringify(item.verification || {});
    if (prev !== next) changed = true;
  }

  if (changed) {
    writeJson(file, js);
    vLog("updated:", file);
  }
  return { updated: changed };
}

// ---------- simple pool ----------
async function runAll(files, concurrency) {
  let i = 0;
  let updatedCount = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < files.length) {
      const idx = i++;
      const f = files[idx];
      try {
        const { updated } = await processFile(f);
        if (updated) updatedCount++;
      } catch (e) {
        vLog("error processing:", f, e?.message || e);
      }
    }
  });
  await Promise.all(workers);
  return updatedCount;
}

// ---------- main ----------
(async function main() {
  const targets = listTargets();
  const updated = await runAll(targets, CFG.max_parallel || 4);
  console.log(`[verify] total updated entries: ${updated}`);
})().catch((e) => {
  console.error("verify fatal:", e?.stack || e);
  process.exitCode = 1;
});
