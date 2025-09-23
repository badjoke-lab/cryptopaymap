"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  country?: string;
  city?: string;
  coins?: string[];
  added_at?: string;
  created_at?: string;
  updated_at?: string;
  last_verified?: string;
};

type CoinSummary = {
  total: number;
  added_30d: number;
  top_cities: Array<{
    rank: number;
    city: string;
    country: string;
    count: number;
    added_30d: number;
    share: number; // 0..1
  }>;
  samples?: Array<{ id: string; name: string; city?: string; country?: string }>;
};

type CoinsAggregate = {
  generated_at?: string;
  coins: Record<string, CoinSummary>;
};

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const parseTime = (s?: string) => (s ? (isNaN(Date.parse(s)) ? 0 : Date.parse(s)) : 0);
const isAdded30d = (s: Spot) => {
  const t =
    parseTime(s.added_at) ||
    parseTime(s.created_at) ||
    parseTime(s.updated_at) ||
    parseTime(s.last_verified);
  return !!t && now() - t <= 30 * DAY;
};

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function loadAllPlaces(): Promise<Spot[]> {
  const idx = await fetchJSON<{ cities: { path: string }[] }>("/data/places/index.json");
  if (!idx?.cities?.length) return [];
  const all: Spot[] = [];
  for (const c of idx.cities) {
    const arr = await fetchJSON<Spot[]>(`/data/places/${c.path}`);
    if (Array.isArray(arr)) all.push(...arr);
  }
  return all;
}

function buildCoinsAggregateFromSpots(spots: Spot[]): CoinsAggregate {
  const coinsSet = new Set<string>();
  for (const s of spots) (s.coins || []).forEach((c) => coinsSet.add(c));
  const coins = Array.from(coinsSet).sort();

  const result: CoinsAggregate = { generated_at: new Date().toISOString(), coins: {} };

  for (const coin of coins) {
    const list = spots.filter((s) => (s.coins || []).includes(coin));
    const total = list.length;
    const added_30d = list.reduce((acc, s) => acc + (isAdded30d(s) ? 1 : 0), 0);

    const byCity = new Map<
      string,
      { city: string; country: string; count: number; added_30d: number }
    >();
    for (const s of list) {
      const city = s.city || "—";
      const country = s.country || "";
      const key = `${city}@@${country}`;
      const rec = byCity.get(key) || { city, country, count: 0, added_30d: 0 };
      rec.count += 1;
      if (isAdded30d(s)) rec.added_30d += 1;
      byCity.set(key, rec);
    }

    const top = Array.from(byCity.values()).sort(
      (a, b) => b.count - a.count || a.city.localeCompare(b.city)
    );

    const top_cities = top.slice(0, 50).map((r, i) => ({
      rank: i + 1,
      city: r.city,
      country: r.country,
      count: r.count,
      added_30d: r.added_30d,
      share: total ? r.count / total : 0,
    }));

    const samples = list.slice(0, 8).map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      country: s.country,
    }));

    result.coins[coin] = { total, added_30d, top_cities, samples };
  }
  return result;
}

async function loadCoinsAggregate(): Promise<CoinsAggregate> {
  const pre =
    (await fetchJSON<CoinsAggregate>("/data/aggregates/coins.json")) ||
    (await fetchJSON<CoinsAggregate>("/data/coins.json"));
  if (pre?.coins && Object.keys(pre.coins).length) return pre;
  const spots = await loadAllPlaces();
  return buildCoinsAggregateFromSpots(spots);
}

export default function CoinsPage() {
  const router = useRouter();

  const [data, setData] = useState<CoinsAggregate | null>(null);
  const [active, setActive] = useState<string>("BTC");

  useEffect(() => {
    let alive = true;
    (async () => {
      const agg = await loadCoinsAggregate();
      if (!alive) return;
      setData(agg);
      const keys = Object.keys(agg.coins || {});
      if (keys.length) setActive(keys.includes("BTC") ? "BTC" : keys[0]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const coins = useMemo(() => (data ? Object.keys(data.coins).sort() : []), [data]);
  const summary: CoinSummary | null = useMemo(
    () => (data ? data.coins[active] || null : null),
    [data, active]
  );

  const goMap = useCallback(
    (city: string, coin: string) => {
      const usp = new URLSearchParams();
      if (city) usp.set("city", city);
      if (coin) usp.set("coins", coin);
      router.push(`/map?${usp.toString()}`);
    },
    [router]
  );

  // ====== ここから「見た目だけ」変更 ======
  if (!data)
    return (
      <main className="pt-[var(--header-h,64px)] max-w-6xl mx-auto px-4 md:px-6 py-16">
        <p className="text-sm text-neutral-600">Loading…</p>
      </main>
    );

  if (!coins.length)
    return (
      <main className="pt-[var(--header-h,64px)] max-w-6xl mx-auto px-4 md:px-6 py-12">
        <section className="mb-6">
          <h1 className="text-3xl font-extrabold">Coins</h1>
          <p className="text-sm text-neutral-600 mt-2">No data.</p>
        </section>
      </main>
    );

  return (
    <main className="pt-[var(--header-h,64px)] max-w-6xl mx-auto px-4 md:px-6 py-10 space-y-8">
      {/* タイトル行 */}
      <section className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">Coins</h1>
        {data.generated_at && (
          <p className="text-sm text-neutral-500">
            generated at: {new Date(data.generated_at).toLocaleString()}
          </p>
        )}
      </section>

      {/* タブ */}
      <section className="flex flex-wrap gap-2">
        {coins.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={[
              "h-9 px-3 rounded-full border text-sm transition",
              active === c
                ? "bg-blue-600 text-white border-blue-600 shadow"
                : "bg-white hover:bg-neutral-50"
            ].join(" ")}
          >
            {c}
          </button>
        ))}
      </section>

      {/* サマリーカード */}
      {summary && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border p-6 shadow-sm bg-white">
            <div className="text-xs text-neutral-500">Total Spots</div>
            <div className="text-3xl font-bold">{summary.total.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border p-6 shadow-sm bg-white">
            <div className="text-xs text-neutral-500">Added (30d)</div>
            <div className="text-3xl font-bold">{summary.added_30d.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border p-6 shadow-sm bg-white hidden md:block">
            <div className="text-xs text-neutral-500">—</div>
            <div className="text-xl text-neutral-400">coming</div>
          </div>
          <div className="rounded-2xl border p-6 shadow-sm bg-white hidden md:block">
            <div className="text-xs text-neutral-500">—</div>
            <div className="text-xl text-neutral-400">soon</div>
          </div>
        </section>
      )}

      {/* Top cities */}
      {summary && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Top cities — {active}</h2>
            <span className="text-xs text-neutral-500">Click a row → open map</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="text-left py-2 px-3 w-12">#</th>
                  <th className="text-left py-2 px-3">City</th>
                  <th className="text-left py-2 px-3">Country</th>
                  <th className="text-right py-2 px-3">Count</th>
                  <th className="text-right py-2 px-3">+30d</th>
                  <th className="text-right py-2 px-3">Share</th>
                </tr>
              </thead>
              <tbody>
                {summary.top_cities.map((r) => (
                  <tr
                    key={`${r.rank}-${r.city}-${r.country}`}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => goMap(r.city, active)}
                  >
                    <td className="py-2 px-3">{r.rank}</td>
                    <td className="py-2 px-3">{r.city || "—"}</td>
                    <td className="py-2 px-3">{r.country || ""}</td>
                    <td className="py-2 px-3 text-right">{r.count.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{r.added_30d.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{(r.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Samples */}
      {summary?.samples?.length ? (
        <section>
          <h3 className="text-lg font-semibold mb-2">Samples</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.samples.map((s) => (
              <div key={s.id} className="rounded-2xl border p-4 bg-white">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-neutral-600">
                  {s.city || "—"} {s.country ? `· ${s.country}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
