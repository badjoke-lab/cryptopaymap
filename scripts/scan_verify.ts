/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Node 18+ has global fetch; Node 20 on GH Actions is OK.
type Place = {
  id: string;
  name: string;
  status?: "owner"|"community"|"directory"|"unverified";
  verification?: {
    last_checked?: string | { date?: string } | null;
    sources?: Array<{
      url?: string;
      when?: string | { date?: string } | null;
      type?: string;
    }>;
  };
  profile?: {
    website?: string;
  };
};

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "places");
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/verify/rules.json"), "utf-8"));
const NEG = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/verify/negatives.json"), "utf-8"));
const IGN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/verify/ignore_domains.json"), "utf-8"));
const LAST_RUNS_PATH = path.join(ROOT, "tools/verify/last_runs.json");
const SUMMARY_PATH = path.join(ROOT, "tools/verify/.last_summary.json");

const DRY_RUN = process.env.DRY_RUN === "1";

const isoNow = () => new Date().toISOString();
const isIgnored = (u: string) => {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return IGN.domains.some((d: string) => h === d || h.endsWith(`.${d}`));
  } catch { return true; }
};

const takeFirst = <T>(arr: T[], n: number) => arr.slice(0, n);

const listCityFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.isFile() && e.name.endsWith(".json")) {
        // city file heuristic: folder/city.json where folder name == file basename is common
        out.push(path.join(dir, e.name));
      }
    }
  };
  walk(DATA_DIR);
  return out;
};

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));
const writeJsonIfChanged = (p: string, obj: any) => {
  const next = JSON.stringify(obj, null, 2) + "\n";
  const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  if (prev === next) return false;
  if (!DRY_RUN) fs.writeFileSync(p, next, "utf-8");
  return true;
};

const extractUrls = (pl: Place): string[] => {
  const urls = new Set<string>();
  if (pl.profile?.website) urls.add(pl.profile.website);
  pl.verification?.sources?.forEach(s => { if (s?.url) urls.add(s.url); });
  return [...urls].filter(u => /^https?:\/\//i.test(u) && !isIgnored(u));
};

const fetchWithTimeout = async (url: string) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), RULES.timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const text = await res.text();
    clearTimeout(t);
    return { ok: res.ok, status: res.status, text };
  } catch (e: any) {
    clearTimeout(t);
    throw e;
  }
};

const scorePage = (html: string) => {
  const lower = html.toLowerCase();
  const hasNegative = NEG.negativePhrases.some((n: string) => lower.includes(n.toLowerCase()));
  if (hasNegative) return { score: 0, kinds: [] as string[] };

  let s = 0;
  const kinds: string[] = [];

  // text keywords
  const textHit = RULES.keywords.some((k: string) => lower.includes(k.toLowerCase()));
  if (textHit) { s += RULES.weights.text; kinds.push("text"); }

  // widget patterns
  const scriptHit = RULES.widgetPatterns.some((p: string) => {
    try {
      const re = new RegExp(p, "i");
      return re.test(lower);
    } catch { return false; }
  });
  if (scriptHit) { s += RULES.weights.script; kinds.push("script"); }

  // (optional) image hint — skip heavy parsing, keep placeholder for future
  // const imageHit = /png|jpg|svg/.test(lower); // not reliable; omit from score

  if (s > 1) s = 1;
  return { score: s, kinds };
};

type ScanStats = {
  scanned: number;
  hits: number;
  updated: number;
  unchanged: number;
  errors: number;
  byStatus: Record<string, { pass: number; warn: number; dateOnly: number; none: number }>;
  evidenceDist: Record<string, number>;
  failures: Record<string, number>; // domain -> count
};

const isTargetStatus = (st?: string) => st === "directory" || st === "unverified";
const prefixMark = (name: string, mark: "✅"|"⚠︎"|null) => {
  const trimmed = name.replace(/^[✅⚠︎]\s*/u, "");
  return mark ? `${mark} ${trimmed}` : trimmed;
};

async function run() {
  const files = listCityFiles();
  const stats: ScanStats = {
    scanned: 0, hits: 0, updated: 0, unchanged: 0, errors: 0,
    byStatus: { directory: { pass:0, warn:0, dateOnly:0, none:0 }, unverified: { pass:0, warn:0, dateOnly:0, none:0 } },
    evidenceDist: {},
    failures: {}
  };
  const changedFiles = new Set<string>();

  for (const file of files) {
    let data: Place[] | { places?: Place[] };
    try {
      data = readJson(file);
    } catch {
      continue;
    }
    const places: Place[] = Array.isArray(data) ? data : ((data as any).places ?? []);
    if (!Array.isArray(places) || places.length === 0) continue;

    let fileChanged = false;
    for (const pl of places) {
      if (!isTargetStatus(pl.status)) continue;

      stats.scanned++;
      const urls = takeFirst(extractUrls(pl), RULES.evidenceMaxPerPlace);
      if (urls.length === 0) { stats.byStatus[pl.status!].none++; continue; }

      let maxScore = 0;
      const hitKinds = new Set<string>();
      let anyError = false;

      for (const u of urls) {
        try {
          const res = await fetchWithTimeout(u);
          if (!res.ok) {
            const host = new URL(u).hostname.replace(/^www\./, "");
            stats.failures[host] = (stats.failures[host] ?? 0) + 1;
            continue;
          }
          const { score, kinds } = scorePage(res.text);
          kinds.forEach(k => { hitKinds.add(k); stats.evidenceDist[k] = (stats.evidenceDist[k] ?? 0) + 1; });
          if (score > maxScore) maxScore = score;
        } catch {
          anyError = true;
          try {
            const host = new URL(u).hostname.replace(/^www\./, "");
            stats.failures[host] = (stats.failures[host] ?? 0) + 1;
          } catch {/* ignore */}
        }
        await delay(0); // yield
      }

      const pass = maxScore >= RULES.thresholds.pass;
      const warn = !pass && maxScore >= RULES.thresholds.warn;
      const mark: "✅"|"⚠︎"|null = pass ? "✅" : (warn ? "⚠︎" : null);

      const beforeName = pl.name ?? "";
      const afterName = prefixMark(beforeName, mark);

      // update counters
      if (pass || warn) stats.hits++;
      stats.byStatus[pl.status!][pass ? "pass" : warn ? "warn" : "none"]++;

      // last_checked fields
      const nowIso = isoNow();
      let dateOnly = false;
      // update verification.last_checked
      if (!pl.verification) pl.verification = {};
      const prevLastChecked = pl.verification.last_checked;
      pl.verification.last_checked = nowIso;

      // update sources.when (if exists)
      if (Array.isArray(pl.verification.sources)) {
        for (const s of pl.verification.sources) {
          if (s?.url && !isIgnored(s.url)) {
            s.when = nowIso;
          }
        }
      }

      // apply name mark
      if (beforeName !== afterName) {
        pl.name = afterName;
      } else if (prevLastChecked !== pl.verification.last_checked) {
        dateOnly = true;
      }

      if ((beforeName !== afterName) || dateOnly) {
        fileChanged = true;
        stats.updated += 1;
        if (dateOnly) stats.byStatus[pl.status!].dateOnly++;
      } else {
        stats.unchanged += 1;
      }
    }

    if (fileChanged) {
      changedFiles.add(file);
      if (!DRY_RUN) {
        const out = Array.isArray(data) ? places : { ...(data as any), places };
        writeJsonIfChanged(file, out);
      }
    }
  }

  // summary
  const sum = {
    timestamp: isoNow(),
    rulesVersion: RULES.version,
    changedFiles: [...changedFiles],
    stats: {
      ...stats,
      failuresTop: Object.entries(stats.failures)
        .sort((a,b) => b[1]-a[1])
        .slice(0, 10)
        .map(([host,count]) => ({ host, count }))
    }
  };

  // persist last_runs (keep last 10)
  try {
    const prev = fs.existsSync(LAST_RUNS_PATH) ? JSON.parse(fs.readFileSync(LAST_RUNS_PATH, "utf-8")) : [];
    const next = [...prev, sum].slice(-10);
    if (!DRY_RUN) fs.writeFileSync(LAST_RUNS_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  } catch {/* ignore */}

  // write ephemeral summary for workflow to read
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(sum, null, 2) + "\n", "utf-8");

  // console summary
  const s = sum.stats;
  console.log(`SCAN SUMMARY @ ${sum.timestamp}`);
  console.log(`  scanned: ${s.scanned}, hits: ${s.hits}, updated: ${s.updated}, unchanged: ${s.unchanged}, errors(domains): ${Object.keys(s.failures).length}`);
  console.log(`  changed files: ${sum.changedFiles.length}`);
  if (sum.changedFiles.length) {
    sum.changedFiles.slice(0,10).forEach(f => console.log(`   - ${path.relative(ROOT, f)}`));
  }
  // Always zero exit (we don't fail CI on scan)
  process.exit(0);
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(0); // never fail CI by design
});
