/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// ---- Types ---------------------------------------------------------------

type VerificationSource = {
  url?: string;
  when?: string | { date?: string } | null;
  type?: string;
};

type Verification = {
  last_checked?: string | { date?: string } | null;
  sources?: VerificationSource[];
};

type Place = {
  id?: string;
  name?: string;
  status?: string; // "owner" | "community" | "directory" | "unverified" | "active" | ...
  lat?: number;
  lng?: number;
  profile?: {
    website?: string;
  };
  website?: string; // root-level website (OSM等)
  verification?: Verification;
  last_verified?: string; // OSM等で使われることがある
};

// ---- Constants -----------------------------------------------------------

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "places");

const RULES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/verify", "rules.json"), "utf-8")
);
const NEG = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/verify", "negatives.json"), "utf-8")
);
const IGN = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/verify", "ignore_domains.json"), "utf-8")
);

const LAST_RUNS_PATH = path.join(ROOT, "tools/verify", "last_runs.json");
const SUMMARY_PATH = path.join(ROOT, "tools/verify", ".last_summary.json");

const DRY_RUN = process.env.DRY_RUN === "1";

// 対象とする status をルールから可変に
const TARGETS: string[] =
  Array.isArray(RULES.targetStatuses) && RULES.targetStatuses.length
    ? RULES.targetStatuses
    : ["directory", "unverified"];

// ---- Helpers -------------------------------------------------------------

const isoNow = () => new Date().toISOString();

const isIgnored = (u: string) => {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return IGN.domains.some((d: string) => h === d || h.endsWith(`.${d}`));
  } catch {
    return true;
  }
};

const takeFirst = <T>(arr: T[], n: number) => arr.slice(0, n);

const listCityFiles = (): string[] => {
  const out: string[] = [];
  if (!fs.existsSync(DATA_DIR)) return out;

  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
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

  // ルート直下 website（OSM等）
  if (pl.website && typeof pl.website === "string") urls.add(pl.website);

  // profile.website
  if (pl.profile?.website) urls.add(pl.profile.website);

  // verification.sources[].url
  pl.verification?.sources?.forEach((s) => {
    if (s?.url) urls.add(s.url);
  });

  return [...urls].filter(
    (u) => /^https?:\/\//i.test(u) && !isIgnored(u)
  );
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

  // 否定表現に引っかかったらスコア 0
  const hasNegative = NEG.negativePhrases.some((n: string) =>
    lower.includes(n.toLowerCase())
  );
  if (hasNegative) return { score: 0, kinds: [] as string[] };

  let s = 0;
  const kinds: string[] = [];

  // text keywords
  const textHit = RULES.keywords.some((k: string) =>
    lower.includes(k.toLowerCase())
  );
  if (textHit) {
    s += RULES.weights.text;
    kinds.push("text");
  }

  // widget patterns
  const scriptHit = RULES.widgetPatterns.some((p: string) => {
    try {
      const re = new RegExp(p, "i");
      return re.test(lower);
    } catch {
      return false;
    }
  });
  if (scriptHit) {
    s += RULES.weights.script;
    kinds.push("script");
  }

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

const isTargetStatus = (st?: string) => !!st && TARGETS.includes(st);

const prefixMark = (name: string, mark: "✅" | "⚠︎" | null) => {
  const trimmed = name.replace(/^[✅⚠︎]\s*/u, "");
  return mark ? `${mark} ${trimmed}` : trimmed;
};

// ---- Main ----------------------------------------------------------------

async function run() {
  const files = listCityFiles();

  const stats: ScanStats = {
    scanned: 0,
    hits: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    byStatus: {
      directory: { pass: 0, warn: 0, dateOnly: 0, none: 0 },
      unverified: { pass: 0, warn: 0, dateOnly: 0, none: 0 },
      active: { pass: 0, warn: 0, dateOnly: 0, none: 0 }
    },
    evidenceDist: {},
    failures: {}
  };

  const changedFiles = new Set<string>();

  for (const file of files) {
    let data: any;
    try {
      data = readJson(file);
    } catch {
      continue;
    }

    // 配列 or { places: [...] } に対応
    const places: Place[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.places)
      ? data.places
      : Array.isArray(data?.features)
      ? data.features.map((f: any) => f?.properties ?? {}).filter(Boolean) // GeoJSON 拾い上げ（必要最小）
      : [];

    if (!Array.isArray(places) || places.length === 0) continue;

    let fileChanged = false;

    for (const pl of places) {
      if (!isTargetStatus(pl.status)) continue;

      stats.scanned++;

      const urls = takeFirst(extractUrls(pl), RULES.evidenceMaxPerPlace);
      if (urls.length === 0) {
        // URLが無い＝一次検証不可
        stats.byStatus[pl.status!]?.none !== undefined
          ? (stats.byStatus[pl.status!].none += 1)
          : (stats.byStatus[pl.status!] = { pass: 0, warn: 0, dateOnly: 0, none: 1 });
        continue;
      }

      let maxScore = 0;
      const hitKinds = new Set<string>();

      for (const u of urls) {
        try {
          const res = await fetchWithTimeout(u);
          if (!res.ok) {
            const host = new URL(u).hostname.replace(/^www\./, "");
            stats.failures[host] = (stats.failures[host] ?? 0) + 1;
            continue;
          }
          const { score, kinds } = scorePage(res.text);
          kinds.forEach((k) => {
            hitKinds.add(k);
            stats.evidenceDist[k] = (stats.evidenceDist[k] ?? 0) + 1;
          });
          if (score > maxScore) maxScore = score;
        } catch {
          try {
            const host = new URL(u).hostname.replace(/^www\./, "");
            stats.failures[host] = (stats.failures[host] ?? 0) + 1;
          } catch {
            /* ignore */
          }
        }
        await delay(0);
      }

      const pass = maxScore >= RULES.thresholds.pass;
      const warn = !pass && maxScore >= RULES.thresholds.warn;
      const mark: "✅" | "⚠︎" | null = pass ? "✅" : warn ? "⚠︎" : null;

      const beforeName = pl.name ?? "";
      const afterName = prefixMark(beforeName, mark);

      // ステータス別集計
      if (!stats.byStatus[pl.status!]) {
        stats.byStatus[pl.status!] = { pass: 0, warn: 0, dateOnly: 0, none: 0 };
      }
      if (pass) stats.byStatus[pl.status!].pass += 1;
      else if (warn) stats.byStatus[pl.status!].warn += 1;
      else stats.byStatus[pl.status!].none += 1;
      if (pass || warn) stats.hits++;

      // タイムスタンプ更新（最優先：verification.last_checked）
      const nowIso = isoNow();
      let dateOnly = false;

      if (!pl.verification) pl.verification = {};
      const prevLastChecked = pl.verification.last_checked;
      pl.verification.last_checked = nowIso;

      // sources[].when 更新（ignore対象は除外）
      if (Array.isArray(pl.verification.sources)) {
        for (const s of pl.verification.sources) {
          if (s?.url && !isIgnored(s.url)) {
            s.when = nowIso;
          }
        }
      }

      // 代替：last_verified を持つデータ構造（OSM等）
      if (prevLastChecked === undefined && pl.last_verified !== undefined) {
        const prevLv = pl.last_verified;
        pl.last_verified = nowIso;
        if (prevLv !== nowIso) dateOnly = true;
      }

      // name のマーク適用
      if (beforeName !== afterName) pl.name = afterName;
      else if (prevLastChecked !== pl.verification.last_checked) dateOnly = true;

      if (beforeName !== afterName || dateOnly) {
        fileChanged = true;
        stats.updated += 1;
        stats.byStatus[pl.status!].dateOnly += dateOnly && beforeName === afterName ? 1 : 0;
      } else {
        stats.unchanged += 1;
      }
    }

    if (fileChanged) {
      changedFiles.add(file);
      const out = Array.isArray(data) ? places : Array.isArray(data?.places) ? { ...data, places } : Array.isArray(data?.features) ? data : places;
      writeJsonIfChanged(file, out);
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
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([host, count]) => ({ host, count }))
    }
  };

  // コンソール出力
  console.log(`SCAN SUMMARY @ ${sum.timestamp}`);
  console.log(
    `  scanned: ${stats.scanned}, hits: ${stats.hits}, updated: ${stats.updated}, unchanged: ${stats.unchanged}, errors(domains): ${Object.keys(stats.failures).length}`
  );
  console.log(`  changed files: ${sum.changedFiles.length}`);
  if (sum.changedFiles.length) {
    sum.changedFiles.slice(0, 10).forEach((f) =>
      console.log(`   - ${path.relative(ROOT, f)}`)
    );
  }
  if (stats.scanned === 0) {
    console.log(
      "  note: no target records found. If your data uses non-standard statuses, update tools/verify/rules.json `targetStatuses`."
    );
  }

  // ワークフロー用の一時サマリは常に書く
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(sum, null, 2) + "\n", "utf-8");

  // last_runs は空走のときは更新しない
  if (stats.scanned > 0) {
    try {
      const prev = fs.existsSync(LAST_RUNS_PATH)
        ? JSON.parse(fs.readFileSync(LAST_RUNS_PATH, "utf-8"))
        : [];
      const next = [...prev, sum].slice(-10);
      if (!DRY_RUN)
        fs.writeFileSync(LAST_RUNS_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
    } catch {
      /* ignore */
    }
  }

  // スキャンはCI失敗にしない
  process.exit(0);
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(0);
});
