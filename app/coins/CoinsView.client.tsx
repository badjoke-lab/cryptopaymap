// app/coins/CoinsView.client.tsx  ← Client（純CSS: styled-jsx でUI調整）
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type TopCity = { city: string; country?: string; count: number; added_30d?: number | null; share?: number | null };
type CoinEntry = { total: number; added_30d?: number | null; top_cities: TopCity[] };
type CoinsAggregate = { generated_at?: string; coins: Record<string, CoinEntry> };

const fmtInt = (v: number | null | undefined) => (typeof v === 'number' ? v.toLocaleString() : '—');
const fmtPct = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
};

export default function CoinsView() {
  const [data, setData] = useState<CoinsAggregate | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/data/aggregates/coins.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const json = (await res.json()) as CoinsAggregate;
        if (!alive) return;
        setData(json);
        const first = Object.entries(json.coins)
          .sort((a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0))[0]?.[0];
        setActive(first ?? null);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, []);

  const coins = useMemo(() => {
    if (!data) return [] as Array<[string, CoinEntry]>;
    return Object.entries(data.coins)
      .filter(([, v]) => v && typeof v.total === 'number')
      .sort((a, b) => (b[1].total ?? 0) - (a[1].total ?? 0));
  }, [data]);

  const current = active && data ? data.coins[active] ?? null : null;

  if (err) {
    return (
      <main className="wrap">
        <header className="head">
          <h1 className="h1">Coins</h1>
        </header>
        <p className="error">Failed to load: {err}</p>
        <Styles />
      </main>
    );
  }
  if (!data || !current || !active) {
    return (
      <main className="wrap">
        <header className="head">
          <h1 className="h1">Coins</h1>
        </header>
        <p className="muted">Loading…</p>
        <Styles />
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="head">
        <h1 className="h1">Coins</h1>
        {data.generated_at && (
          <div className="gen">Generated: {new Date(data.generated_at).toLocaleString()}</div>
        )}
      </header>

      {/* Overview */}
      <section className="section">
        <h2 className="h2">Overview</h2>
        <div className="cards">
          {coins.map(([sym, entry]) => (
            <button
              key={sym}
              onClick={() => setActive(sym)}
              className={`card ${active === sym ? 'active' : ''}`}
              aria-pressed={active === sym}
              aria-label={`Select ${sym}`}
            >
              <div className="card-top">
                <div className="card-title">{sym}</div>
                <span className="badge">{fmtInt(entry.total)}</span>
              </div>
              <div className="card-sub">+30d: {fmtInt(entry.added_30d ?? null)}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Top cities */}
      <section className="section">
        <div className="row">
          <h2 className="h2">Top cities — {active}</h2>
          <div className="meta">
            Total: <span className="bold">{fmtInt(current.total)}</span>
            {' '}• +30d: <span className="bold">{fmtInt(current.added_30d ?? null)}</span>
          </div>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th className="th wnum">#</th>
                <th className="th wcity">City</th>
                <th className="th wcountry">Country</th>
                <th className="th wnum right">Spots</th>
                <th className="th wnum right">+30d</th>
                <th className="th wnum right">Share</th>
                <th className="th wnum right">Open</th>
              </tr>
            </thead>
            <tbody>
              {current.top_cities.map((r, i) => (
                <tr key={`${r.city}-${i}`} className="tr">
                  <td className="td">{i + 1}</td>
                  <td className="td">{r.city}</td>
                  <td className="td">{r.country ?? '—'}</td>
                  <td className="td right">{fmtInt(r.count)}</td>
                  <td className="td right">{fmtInt(r.added_30d ?? null)}</td>
                  <td className="td right">{fmtPct(r.share ?? null)}</td>
                  <td className="td right">
                    <Link
                      href={`/map?city=${encodeURIComponent(r.city)}&coins=${encodeURIComponent(active)}`}
                      className="pill"
                      aria-label={`Open ${r.city} on map filtered by ${active}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {current.top_cities.length === 0 && (
                <tr><td className="td center muted" colSpan={7}>No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="foot">
        <p className="muted small">Data sources: OpenStreetMap contributors. Use at your own risk. No warranty.</p>
      </footer>

      <Styles />
    </main>
  );
}

/** 純CSS（styled-jsx）— 箇条点リセット/余白/テーブル/カード **/
function Styles() {
  return (
    <style jsx>{`
      /* Reset bullets & spacing under this page */
      .wrap ul, .wrap ol { list-style: none; margin: 0; padding: 0; }
      .wrap li { list-style: none; }

      .wrap { max-width: 1120px; margin: 0 auto; padding: 20px 24px 32px; }
      .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .h1 { font-size: 36px; font-weight: 800; margin: 0; line-height: 1.2; }
      .gen { font-size: 12px; color: #6b7280; white-space: nowrap; }
      .section { margin: 20px 0 28px; }
      .h2 { font-size: 24px; font-weight: 700; margin: 0 0 12px; }
      .muted { color: #6b7280; }
      .small { font-size: 12px; }
      .bold { font-weight: 600; }
      .row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
      .meta { color: #6b7280; font-size: 14px; }

      /* Cards */
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
      .card {
        display: block; text-align: left; background: #fff;
        border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px;
        cursor: pointer; transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease;
      }
      .card:hover { background: #fafafa; }
      .card:active { transform: translateY(1px); }
      .card.active { box-shadow: 0 0 0 2px #3b82f6 inset; }
      .card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .card-title { font-weight: 600; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .card-sub { margin-top: 2px; font-size: 12px; color: #6b7280; }
      .badge { font-size: 12px; border: 1px solid #e5e7eb; padding: 2px 6px; border-radius: 9999px; }

      /* Table */
      .tableWrap { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #fff; }
      .table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead .th { background: #f8fafc; position: sticky; top: 0; z-index: 1; }
      .th, .td { padding: 10px 12px; font-size: 14px; }
      .th { text-align: left; font-weight: 600; border-bottom: 1px solid #eef2f7; }
      .td { border-top: 1px solid #f3f4f6; }
      .tr:hover .td { background: #fafafa; }
      .wnum { width: 90px; }
      .wcity { min-width: 180px; }
      .wcountry { width: 140px; }
      .right { text-align: right; }
      .center { text-align: center; }

      /* Button-like link */
      .pill {
        display: inline-flex; align-items: center; padding: 4px 8px;
        border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px;
        text-decoration: none; color: inherit; background: #fff;
      }
      .pill:hover { background: #fafafa; }
      
      .foot { margin-top: 28px; }
    `}</style>
  );
}
