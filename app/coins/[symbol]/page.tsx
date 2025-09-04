// app/coins/[symbol]/page.tsx
// Server Component — FS優先 + aggregatesフォールバック
import Link from 'next/link';
import fs from 'node:fs/promises';
import path from 'node:path';
import s from './page.module.css';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { symbol: string } }) {
  const sym = String(params.symbol || '').toUpperCase();
  return { title: `${sym} adoption – CryptoPayMap` };
}

/* -------------------- types -------------------- */
type Place = {
  id?: string;
  name?: string;
  coins?: string[];
  city?: string;
  country?: string;
  cc?: string;
  category?: string;
};
type AggTopCity = { city: string; country?: string; count: number; added_30d?: number | null; share?: number | null };
type AggCoinEntry = { total: number; added_30d?: number | null; top_cities: AggTopCity[] };
type CoinsAggregate = { generated_at?: string; coins: Record<string, AggCoinEntry> };
type Headline = { title: string; url: string; summary?: string; published_at?: string };

/* -------------------- helpers -------------------- */
const fmtInt = (v?: number | null) => (typeof v === 'number' ? v.toLocaleString() : '—');
const pct = (v?: number | null) => (v == null ? '—' : `${(v <= 1 ? v * 100 : v).toFixed(1)}%`);

function classify(p: Place): 'atm' | 'online' | 'inperson' {
  const cat = String(p.category || '').toLowerCase();
  if (/\batm\b/.test(cat)) return 'atm';
  if (/(online|web|e-?commerce|remote)/.test(cat)) return 'online';
  return 'inperson';
}

async function readJSON<T>(rel: string): Promise<T | null> {
  try {
    const full = path.join(process.cwd(), 'public', rel.replace(/^\/+/, ''));
    const txt = await fs.readFile(full, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

// index.json の多様な形に対応
function normalizeIndex(idx: any): string[] {
  if (Array.isArray(idx)) return idx as string[];
  if (idx?.files) return idx.files as string[];
  if (idx?.cities) return (idx.cities as string[]).map((c) => `${c}.json`);
  if (idx?.items) return idx.items as string[];
  return [];
}
function normalizeFile(entry: string): string {
  let f = entry.replace(/^\/+/, '');
  if (!f.endsWith('.json')) f = `${f}.json`;
  if (!/^data\//.test(f)) f = `data/places/${f}`;
  return f;
}

async function loadPlaces(): Promise<Place[]> {
  const idx = await readJSON<any>('data/places/index.json');
  const files = (normalizeIndex(idx ?? [])).map(normalizeFile);
  const targets = files.length ? files : ['data/places/index.json']; // 単一ファイル構成にも対応
  const all: Place[] = [];
  await Promise.all(
    targets.map(async (rel) => {
      const j = await readJSON<any>(rel);
      if (!j) return;
      const arr: Place[] = Array.isArray(j) ? j : (j.places ?? j.items ?? j.data ?? []);
      if (Array.isArray(arr)) all.push(...arr);
    }),
  );
  return all;
}

async function loadAgg(): Promise<CoinsAggregate | null> {
  return (await readJSON<CoinsAggregate>('data/aggregates/coins.json')) ?? null;
}

/* --- Country normalization (強化版) --- */
const REGION = typeof Intl !== 'undefined'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const ALIAS: Record<string, string> = {
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  'USA': 'US',
  'U S': 'US',
  'UAE': 'AE',
  'UK': 'GB',
  'SOUTH KOREA': 'KR',
  'KOREA, REPUBLIC OF': 'KR',
  'RUSSIAN FEDERATION': 'RU',
  'CZECH REPUBLIC': 'CZ',
  'CZECHIA': 'CZ',
};
const ALPHA3: Record<string, string> = {
  USA: 'US', GBR: 'GB', DEU: 'DE', JPN: 'JP', MEX: 'MX', FRA: 'FR', THA: 'TH',
  ARG: 'AR', CAN: 'CA', ESP: 'ES', ITA: 'IT', KOR: 'KR', ARE: 'AE',
};

function normCountry(raw?: string): string {
  if (!raw) return '—';
  let s = String(raw)
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/[.]/g, '')
    .toUpperCase();
  s = s.replace(/[,/|()].*$/, '').trim();
  const m2 = s.match(/^([A-Z]{2})(?=[\s\-_]|$)/);
  if (m2) s = m2[1];
  const m3 = s.match(/^([A-Z]{3})(?=[\s\-_]|$)/);
  if (!m2 && m3 && ALPHA3[m3[1]]) s = ALPHA3[m3[1]];
  if (ALIAS[s]) s = ALIAS[s];
  if (/^[A-Z]{2}[-_\s][A-Z0-9]{1,3}$/.test(String(raw).toUpperCase())) s = s.slice(0, 2);
  const fallback2 = s.match(/[A-Z]{2}/);
  if (s.length !== 2 && fallback2) s = fallback2[0];
  return /^[A-Z]{2}$/.test(s) ? s : '—';
}
const countryName = (code: string) => (code === '—' ? '—' : (REGION ? (REGION.of(code) ?? code) : code));

/* --- Coins catalog & Headlines loaders --- */
async function loadCoinsCatalog(): Promise<Array<{ symbol: string; total: number }>> {
  // aggregates があれば優先
  const agg = await loadAgg();
  if (agg?.coins) {
    return Object.entries(agg.coins)
      .map(([symbol, entry]) => ({ symbol: symbol.toUpperCase(), total: entry.total ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }
  // なければ places から推定
  const places = await loadPlaces();
  const map = new Map<string, number>();
  for (const p of places) {
    for (const c of p.coins ?? []) {
      const k = String(c).toUpperCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([symbol, total]) => ({ symbol, total }))
    .sort((a, b) => b.total - a.total);
}

async function loadCoinHeadlines(sym: string): Promise<Headline[]> {
  const candidates = [
    `data/aggregates/news/coins/${sym}.json`,
    `data/aggregates/coins-headlines/${sym}.json`,
    `data/news/${sym}.json`,
  ];
  for (const rel of candidates) {
    const j = await readJSON<any>(rel);
    if (!j) continue;
    const arr: Headline[] = Array.isArray(j)
      ? j
      : (j.items ?? j.headlines ?? j.data ?? []);
    const norm = (arr ?? [])
      .filter((x) => x && (x.title || x.t))
      .map((x) => ({
        title: x.title ?? x.t,
        url: x.url ?? x.link ?? '#',
        summary: x.summary ?? x.s ?? '',
        published_at: x.published_at ?? x.published ?? x.date ?? '',
      }));
    if (norm.length) return norm.slice(0, 10);
  }
  return [];
}

/* -------------------- page -------------------- */
export default async function CoinDetailPage({ params }: { params: { symbol: string } }) {
  const sym = String(params.symbol || '').trim().toUpperCase();

  // コイン一覧（スイッチャー用）
  const coinsCatalog = await loadCoinsCatalog();
  const symbols = coinsCatalog.map((c) => c.symbol);

  // 1) places から集計（優先）
  const places = await loadPlaces();
  const filtered = places.filter((p) => (p.coins ?? []).some((c) => String(c).toUpperCase() === sym));

  let total = filtered.length;
  let inperson = 0, atm = 0, online = 0;
  let byCountry = new Map<string, { country: string; spots: number; d30: number | null }>();

  if (filtered.length > 0) {
    for (const p of filtered) {
      const k = classify(p);
      if (k === 'atm') atm++;
      else if (k === 'online') online++;
      else inperson++;
      const code = normCountry(p.country || p.cc);
      const row = byCountry.get(code) ?? { country: code, spots: 0, d30: null };
      row.spots += 1;
      byCountry.set(code, row);
    }
  } else {
    // 2) aggregates フォールバック
    const agg = await loadAgg();
    const ce = agg?.coins?.[sym];
    if (ce) {
      total = ce.total ?? 0;
      for (const r of ce.top_cities) {
        const code = normCountry(r.country ?? '');
        const row = byCountry.get(code) ?? { country: code, spots: 0, d30: null };
        row.spots += r.count ?? 0;
        byCountry.set(code, row);
      }
    }
  }

  const countryRows = [...byCountry.values()]
    .sort((a, b) => b.spots - a.spots)
    .map((r) => ({ ...r, share: total > 0 ? (r.spots / total) * 100 : null }));

  // Headlines（存在すれば表示）
  const headlines = await loadCoinHeadlines(sym);

  return (
    <main className={s.wrap}>
      <header className={s.head}>
        <div className={s.titleRow}>
          <h1 className={s.h1}>{sym} adoption</h1>
          {/* コイン切替チップ */}
          <nav className={s.chips} aria-label="Select coin">
            {symbols.slice(0, 12).map((c) => (
              <Link key={c} href={`/coins/${c}`} className={`${s.chip} ${c === sym ? s.chipActive : ''}`}>
                {c}
              </Link>
            ))}
            {symbols.length > 12 && <span className={s.more}>+{symbols.length - 12}</span>}
          </nav>
        </div>

        <p className={s.sub}>
          30d change and top regions (preview data).
          <span className={s.muted}>
            {' '}
            • Online services available in multiple countries are counted once per country; “Global (online)” is listed separately.
          </span>
        </p>
      </header>

      {/* stat cards */}
      <section className={s.cards}>
        <div className={s.card}>
          <div className={s.ctitle}>Total Spots</div>
          <div className={s.cnum}>{fmtInt(total)}</div>
          <div className={s.cmuted}>— / 30d</div>
        </div>
        <div className={s.card}>
          <div className={s.ctitle}>In-person</div>
          <div className={s.cnum}>{inperson ? fmtInt(inperson) : '—'}</div>
          <div className={s.cmuted}>&nbsp;</div>
        </div>
        <div className={s.card}>
          <div className={s.ctitle}>ATM / Online</div>
          <div className={s.cnum}>
            {atm ? fmtInt(atm) : '—'} <span className={s.slash}>/</span> {online ? fmtInt(online) : '—'}
          </div>
          <div className={s.cmuted}>&nbsp;</div>
        </div>
      </section>

      {/* by region */}
      <section className={s.section}>
        <h2 className={s.h2}>Adoption by Region</h2>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={`${s.th} ${s.left}`}>Country</th>
                <th className={`${s.th} ${s.right}`}>Spots</th>
                <th className={`${s.th} ${s.right}`}>30d Δ</th>
                <th className={`${s.th} ${s.right}`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {countryRows.length > 0 ? (
                countryRows.map((r) => (
                  <tr key={r.country} className={s.tr}>
                    <td className={`${s.td} ${s.left}`}>{countryName(r.country)}</td>
                    <td className={`${s.td} ${s.right}`}>{fmtInt(r.spots)}</td>
                    <td className={`${s.td} ${s.right}`}>—</td>
                    <td className={`${s.td} ${s.right}`}>{pct(r.share ?? null)}</td>
                  </tr>
                ))
              ) : (
                <tr className={s.tr}>
                  <td className={s.td} colSpan={4}>No data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* headlines（ファイルがあれば表示、無ければ非表示） */}
      {headlines.length > 0 && (
        <section className={s.section}>
          <h2 className={s.h2}>Recent Headlines</h2>
          <ul className={s.news}>
            {headlines.map((h, i) => (
              <li key={i} className={s.newsItem}>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className={s.ntitle}>{h.title}</a>
                {h.summary && <div className={s.nsub}>{h.summary}</div>}
                {h.published_at && <div className={s.ndate}>{new Date(h.published_at).toLocaleString()}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className={s.foot}>
        <Link href="/about" className={s.alink}>About &amp; Disclaimer</Link>
        <span className={s.sep}>•</span>
        <span className={s.muted}>OpenStreetMap contributors</span>
      </footer>
    </main>
  );
}
