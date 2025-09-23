"use client";

import React, { useEffect, useMemo, useState } from "react";

type Article = {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  published_at?: string;
  summary?: string;
  coins?: string[];
  cities?: string[];
  categories?: string[];
};

type ArticlesPayload = {
  generated_at?: string;
  articles: Article[];
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

export default function NewsPage() {
  const [data, setData] = useState<ArticlesPayload | null>(null);
  const [qCoin, setQCoin] = useState<string>("");
  const [qCity, setQCity] = useState<string>("");
  const [qCategory, setQCategory] = useState<string>("");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [sort, setSort] = useState<"new" | "hot" | "coverage">("new");

  useEffect(() => {
    let alive = true;
    (async () => {
      const payload =
        (await fetchJSON<ArticlesPayload>("/data/news/articles.json")) || {
          articles: [],
        };
      if (!alive) return;
      setData(payload);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => {
    if (!data) return [];
    let a = [...(data.articles || [])];
    // period はダミー実装（今はデータが少ないのでフィルタせず枠だけ）
    if (sort === "new") {
      a.sort(
        (x, y) =>
          (y.published_at ? Date.parse(y.published_at) : 0) -
          (x.published_at ? Date.parse(x.published_at) : 0)
      );
    }
    // hot/coverage は今は表示順固定（将来: 指標ができたら切替）
    if (qCoin) a = a.filter((it) => (it.coins || []).includes(qCoin));
    if (qCity) a = a.filter((it) => (it.cities || []).includes(qCity));
    if (qCategory) a = a.filter((it) => (it.categories || []).includes(qCategory));
    return a;
  }, [data, qCoin, qCity, qCategory, period, sort]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">News</h1>
        {data?.generated_at && (
          <div className="text-xs text-neutral-500">
            generated at: {new Date(data.generated_at).toLocaleString()}
          </div>
        )}
      </header>

      {/* Filters (枠) */}
      <section className="rounded-xl border bg-white p-3 flex flex-wrap gap-2 items-center">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={qCoin}
          onChange={(e) => setQCoin(e.target.value)}
        >
          <option value="">All coins</option>
          <option>BTC</option>
          <option>ETH</option>
          <option>USDT</option>
          <option>USDC</option>
        </select>
        <input
          className="border rounded px-2 py-1 text-sm"
          placeholder="City"
          value={qCity}
          onChange={(e) => setQCity(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1 text-sm"
          placeholder="Category"
          value={qCategory}
          onChange={(e) => setQCategory(e.target.value)}
        />
        <select
          className="border rounded px-2 py-1 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
        >
          <option value="7d">Last 7d</option>
          <option value="30d">Last 30d</option>
          <option value="90d">Last 90d</option>
        </select>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
        >
          <option value="new">Sort: New</option>
          <option value="hot">Sort: Hot</option>
          <option value="coverage">Sort: Coverage</option>
        </select>
      </section>

      {/* List */}
      {list.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-neutral-600">
          No articles in the selected window.
        </div>
      ) : (
        <section className="grid gap-3">
          {list.map((a) => (
            <article key={a.id} className="rounded-xl border bg-white p-4">
              <div className="text-sm text-neutral-500">
                {a.publisher || "—"} ·{" "}
                {a.published_at ? new Date(a.published_at).toLocaleDateString() : "—"}
              </div>
              <h2 className="font-semibold text-lg leading-snug mt-1">{a.title}</h2>
              {a.summary && (
                <p className="text-sm text-neutral-700 mt-1 line-clamp-3">{a.summary}</p>
              )}
              <div className="flex flex-wrap gap-2 text-xs text-neutral-600 mt-2">
                {a.coins?.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-full border">
                    {c}
                  </span>
                ))}
                {a.cities?.slice(0, 4).map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-full border">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-3">
                <a
                  href={a.url}
                  target="_blank"
                  className="text-blue-600 underline text-sm"
                >
                  Open source ↗
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
