"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DiscoverAgg = {
  generated_at?: string;
  window_days?: number;
  new_arrivals?: Array<{
    id: string;
    name: string;
    city?: string;
    country?: string;
    category?: string;
    coins?: string[];
    last_verified?: string;
  } | null>;
  recently_verified?: Array<{
    id: string;
    name: string;
    city?: string;
    country?: string;
    category?: string;
    coins?: string[];
    last_verified?: string;
  } | null>;
  hot_cities?: Array<{ city?: string; country?: string; count?: number } | null>;
  popular_categories?: Array<{ category?: string; count?: number } | null>;
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

/** 安全な数値フォーマット（undefined/null/NaN → 0） */
function fmt(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
}

export default function DiscoverPage() {
  const [data, setData] = useState<DiscoverAgg | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const agg = (await fetchJSON<DiscoverAgg>("/data/aggregates/discover.json")) || null;
      if (!alive) return;
      setData(agg);
    })();
    return () => { alive = false; };
  }, []);

  if (!data)
    return (
      <main className="pt-[var(--header-h,64px)] max-w-6xl mx-auto px-4 md:px-6 py-16">
        <p className="text-sm text-neutral-600">Loading…</p>
      </main>
    );

  const win = data.window_days ?? 30;

  // null/undefined をはじく（ロジックは元のまま）
  const newArrivals = (data.new_arrivals || []).filter(Boolean) as NonNullable<
    DiscoverAgg["new_arrivals"]
  >;
  const recentlyVerified = (data.recently_verified || []).filter(Boolean) as NonNullable<
    DiscoverAgg["recently_verified"]
  >;
  const hotCities = (data.hot_cities || []).filter(Boolean) as Array<{
    city?: string; country?: string; count?: number;
  }>;
  const popularCats = (data.popular_categories || []).filter(Boolean) as Array<{
    category?: string; count?: number;
  }>;

  return (
    <main className="pt-[var(--header-h,64px)] max-w-6xl mx-auto px-4 md:px-6 py-10 space-y-8">
      {/* タイトル行（セマンティクスのみ整理） */}
      <section className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">Discover</h1>
        {data.generated_at && (
          <p className="text-sm text-neutral-500">
            window: {win}d · generated at: {new Date(data.generated_at).toLocaleString()}
          </p>
        )}
      </section>

      {/* New arrivals */}
      {newArrivals.length ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">New arrivals (last {win}d)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {newArrivals.slice(0, 12).map((p) => (
              <div key={p!.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="font-medium">{p!.name}</div>
                <div className="text-xs text-neutral-600">
                  {p!.city || "—"} {p!.country ? `· ${p!.country}` : ""}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-neutral-600 mt-2">
                  {p!.category && (
                    <span className="px-2 py-0.5 rounded-full border">{p!.category}</span>
                  )}
                  {(p!.coins || []).map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded-full border">{c}</span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  {p!.last_verified
                    ? `verified: ${new Date(p!.last_verified).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Recently verified */}
      {recentlyVerified.length ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">Recently verified</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentlyVerified.slice(0, 12).map((p) => (
              <div key={p!.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="font-medium">{p!.name}</div>
                <div className="text-xs text-neutral-600">
                  {p!.city || "—"} {p!.country ? `· ${p!.country}` : ""}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-neutral-600 mt-2">
                  {p!.category && (
                    <span className="px-2 py-0.5 rounded-full border">{p!.category}</span>
                  )}
                  {(p!.coins || []).map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded-full border">{c}</span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  {p!.last_verified
                    ? `verified: ${new Date(p!.last_verified).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Hot cities */}
      {hotCities.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Hot cities</h2>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-[640px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="text-left py-2 px-3 w-12">#</th>
                  <th className="text-left py-2 px-3">City</th>
                  <th className="text-left py-2 px-3">Country</th>
                  <th className="text-right py-2 px-3">Count</th>
                  <th className="text-right py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {hotCities.map((c, i) => (
                  <tr key={`${c.city || "-"}-${c.country || ""}-${i}`} className="hover:bg-blue-50">
                    <td className="py-2 px-3">{i + 1}</td>
                    <td className="py-2 px-3">{c.city || "—"}</td>
                    <td className="py-2 px-3">{c.country || ""}</td>
                    <td className="py-2 px-3 text-right">{fmt(c.count)}</td>
                    <td className="py-2 px-3 text-right">
                      <Link
                        href={`/map?city=${encodeURIComponent(c.city || "")}`}
                        className="text-blue-600 underline"
                      >
                        Open map ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Popular categories */}
      {popularCats.length ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">Popular categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {popularCats.slice(0, 16).map((c) => (
              <div key={c.category || "—"} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="font-medium">{c.category || "—"}</div>
                <div className="text-xs text-neutral-600">{fmt(c.count)} spots</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
