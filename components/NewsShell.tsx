"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ========================
 *  型
 *  ===================== */
type Article = {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  published_at: string;
  summary?: string;
  coins?: string[];
  cities?: string[];
  countries?: string[];
  categories?: string[];
  cluster_id?: string; // topics.json の id と対応（= topic_id）
};

type ArticlesFile = {
  generated_at?: string;
  window_days?: number;
  items: Article[];
};

type Topic = {
  id: string; // = cluster_id
  title: string;
  summary?: string;
  coins?: string[];
  cities?: string[];
  categories?: string[];
  articles?: string[]; // article.id の配列
  publisher_count?: number;
  first_seen?: string;
  last_seen?: string;
};

type TopicsFile = {
  generated_at?: string;
  topics: Topic[];
};

type HotFile = {
  generated_at?: string;
  top: { topic_id: string; rank: number; score: number }[];
};

/** ========================
 *  ユーティリティ
 *  ===================== */
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-CA").replaceAll("-", "/") : "";

const unique = <T,>(arr: T[] | undefined) => Array.from(new Set(arr ?? []));

function getBasePath() {
  // assetPrefix or basePath 対応（Vercel/Nextの設定を考慮）
  const anyWin = globalThis as any;
  const ap = anyWin?.__NEXT_DATA__?.assetPrefix || "";
  const bp = anyWin?.NEXT_PUBLIC_BASE_PATH || "";
  return (ap || "") + (bp || "");
}

async function fetchJSON<T>(path: string): Promise<T | null> {
  const base = getBasePath();
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** ========================
 *  本体
 *  ===================== */
export default function NewsShell() {
  const [articlesFile, setArticlesFile] = useState<ArticlesFile | null>(null);
  const [topicsFile, setTopicsFile] = useState<TopicsFile | null>(null);
  const [hotFile, setHotFile] = useState<HotFile | null>(null);

  // UI 状態
  const [coin, setCoin] = useState<string>("All coins");
  const [city, setCity] = useState<string>("City");
  const [category, setCategory] = useState<string>("Category");
  const [days, setDays] = useState<number>(0); // 0 = All time
  const [sort, setSort] = useState<"new" | "coverage" | "hot">("new");

  // topic view（?topic=xxx）
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  // 初期ロード
  useEffect(() => {
    (async () => {
      const [a, t, h] = await Promise.all([
        fetchJSON<ArticlesFile>("/data/news/articles.json"),
        fetchJSON<TopicsFile>("/data/news/topics.json"),
        fetchJSON<HotFile>("/data/aggregates/hot-topics.json"),
      ]);
      if (a) setArticlesFile(a);
      if (t) setTopicsFile(t);
      if (h) setHotFile(h);

      // URLパラメータ（?topic=）
      const p = new URLSearchParams(location.search);
      const qTopic = p.get("topic");
      if (qTopic) setTopicFilter(qTopic);
    })();
  }, []);

  const articles = articlesFile?.items ?? [];
  const topics = topicsFile?.topics ?? [];
  const hotTop = hotFile?.top ?? [];

  // マップ化
  const topicMap = useMemo(
    () => new Map<string, Topic>(topics.map((t) => [t.id, t])),
    [topics]
  );
  const hotScoreMap = useMemo(
    () => new Map<string, number>(hotTop.map((x) => [x.topic_id, x.score])),
    [hotTop]
  );

  // フィルタ UI 選択肢
  const allCoins = useMemo(() => ["BTC", "ETH", "USDT", "USDC"], []);
  const allCities = useMemo(
    () => unique(articles.flatMap((a) => a.cities ?? [])).sort(),
    [articles]
  );
  const allCategories = useMemo(
    () => unique(articles.flatMap((a) => a.categories ?? [])).sort(),
    [articles]
  );

  // 日付ソート
  const byDateDesc = (a: Article, b: Article) =>
    +new Date(b.published_at) - +new Date(a.published_at);

  // カバレッジ算出
  const coverageOf = (clusterId?: string) => {
    if (!clusterId) return 0;
    const tp = topicMap.get(clusterId);
    if (!tp) return 0;
    const nCity = unique(tp.cities ?? []).length;
    return (tp.publisher_count ?? 0) + nCity;
  };

  // 画面に出すリスト
  const visible = useMemo(() => {
    let base: Article[] = articles;

    // topic view
    if (topicFilter) {
      const tp = topicMap.get(topicFilter);
      if (tp?.articles?.length) {
        const ids = new Set(tp.articles);
        base = base.filter((a) => ids.has(a.id));
      } else {
        base = [];
      }
    }

    // フィルタ
    const now = Date.now();
    const filtered = base.filter((a) => {
      const within =
        days === 0 ? true : (now - +new Date(a.published_at)) / 86400000 <= days;
      const okCoin = coin === "All coins" || (a.coins ?? []).includes(coin);
      const okCity = city === "City" || (a.cities ?? []).includes(city);
      const okCat = category === "Category" || (a.categories ?? []).includes(category);
      return within && okCoin && okCity && okCat;
    });

    // ソート
    if (sort === "coverage") {
      return [...filtered].sort((x, y) => {
        const cy = coverageOf(y.cluster_id);
        const cx = coverageOf(x.cluster_id);
        if (cy !== cx) return cy - cx;
        return byDateDesc(x, y);
      });
    }
    if (sort === "hot") {
      return [...filtered].sort((x, y) => {
        const sy = hotScoreMap.get(y.cluster_id ?? "") ?? 0;
        const sx = hotScoreMap.get(x.cluster_id ?? "") ?? 0;
        if (sy !== sx) return sy - sx;
        return byDateDesc(x, y);
      });
    }
    // default: New
    return [...filtered].sort(byDateDesc);
  }, [articles, topicFilter, topicMap, hotScoreMap, coin, city, category, days, sort]);

  // 右上の generated at
  const generatedAt =
    articlesFile?.generated_at ||
    topicsFile?.generated_at ||
    hotFile?.generated_at ||
    "";

  // ========= ここから「見た目のみ」調整（ロジック変更なし） =========
  return (
    <main className="pt-[var(--header-h,64px)] mx-auto max-w-6xl px-4 md:px-6 py-10">
      {/* タイトル行：Coins/Discover と同じ骨格に揃える */}
      <section className="flex items-end justify-between gap-4 mb-6">
        <h1 className="text-3xl font-extrabold">News</h1>
        <div className="text-sm text-gray-500">
          {generatedAt && <span>generated at: {new Date(generatedAt).toLocaleString()}</span>}
        </div>
      </section>

      {/* フィルタ群 */}
      <section className="flex flex-wrap gap-3 items-center mb-6">
        {/* Coins */}
        <select
          className="h-10 rounded-xl border px-3 bg-white"
          value={coin}
          onChange={(e) => setCoin(e.target.value)}
        >
          <option>All coins</option>
          {allCoins.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* City */}
        <select
          className="h-10 rounded-xl border px-3 bg-white"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          <option>City</option>
          {allCities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Category */}
        <select
          className="h-10 rounded-xl border px-3 bg-white"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>Category</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Window */}
        <select
          className="h-10 rounded-xl border px-3 bg-white"
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value="0">All time</option>
          <option value="1">Last 1d</option>
          <option value="7">Last 7d</option>
          <option value="30">Last 30d</option>
          <option value="90">Last 90d</option>
        </select>

        {/* Sort */}
        <select
          className="h-10 rounded-xl border px-3 bg-white"
          value={sort}
          onChange={(e) => setSort(e.target.value as "new" | "coverage" | "hot")}
        >
          <option value="new">Sort: New</option>
          <option value="coverage">Sort: Coverage</option>
          <option value="hot">Sort: Hot</option>
        </select>
      </section>

      {/* 一覧 */}
      <ul className="space-y-3">
        {visible.map((a) => {
          const cov = coverageOf(a.cluster_id);
          const hot = hotScoreMap.get(a.cluster_id ?? "");
          return (
            <li key={a.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[17px] text-blue-700 hover:underline"
                >
                  {a.title}
                </a>
                <div className="shrink-0 text-xs text-gray-500">
                  {a.publisher && <span className="mr-2">{a.publisher}</span>}
                  <span>{fmtDate(a.published_at)}</span>
                </div>
              </div>

              {a.summary && <p className="mt-2 text-sm text-gray-700">{a.summary}</p>}

              {/* メタ行 */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span><strong>Coins:</strong> {unique(a.coins).join(", ") || "-"}</span>
                <span><strong>Category:</strong> {unique(a.categories).join(", ") || "-"}</span>
                <span><strong>City:</strong> {unique(a.cities).join(", ") || "-"}</span>

                {cov > 0 && (
                  <span className="rounded bg-indigo-50 px-2 py-[2px] text-indigo-700">
                    Coverage {cov}
                  </span>
                )}
                {typeof hot === "number" && hot > 0 && (
                  <span className="rounded bg-amber-50 px-2 py-[2px] text-amber-700">
                    Hot {hot.toFixed(2)}
                  </span>
                )}

                <a className="text-blue-600 hover:underline" href={a.url} target="_blank" rel="noreferrer">
                  Open source ↗
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 件数 0 のとき */}
      {visible.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-600 mt-4">
          No articles in the selected window.
        </div>
      )}
    </main>
  );
}
