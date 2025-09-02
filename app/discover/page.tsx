'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ---- 型 ----
type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  city?: string;
  coin?: string;
  published_at: string; // ISO8601
};
type Topic = {
  id: string;
  title: string;
  coins?: string[];
  city?: string;
  articles: string[]; // Article.id の配列
};
type HotTopicAgg = {
  id: string;
  title: string;
  coins: string[];
  city?: string;
  pubs: number;
};

// ---- 内部実装（Suspense 内側） ----
function DiscoverInner() {
  const sp = useSearchParams(); // ← Suspense 内で呼び出す（ビルドエラー回避）
  const router = useRouter();

  const tab = sp.get('tab') ?? 'overview'; // 'overview' | 'news'
  const topicId = sp.get('topic') ?? undefined;

  const [articles, setArticles] = useState<Article[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [hot, setHot] = useState<HotTopicAgg[]>([]);

  useEffect(() => {
    // public ディレクトリ配下をそのままフェッチ
    const load = async () => {
      const [a, t, h] = await Promise.all([
        fetch('/data/news/articles.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('/data/news/topics.json',   { cache: 'no-store' }).then(r => r.json()),
        fetch('/data/aggregates/hot-topics.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ items: [] })),
      ]);
      setArticles(a.items ?? []);
      setTopics(t.topics ?? []);
      setHot(h.items ?? []);
    };
    load();
  }, []);

  const currentTopic = useMemo(
    () => topics.find(t => t.id === topicId),
    [topics, topicId]
  );

  const currentArticles = useMemo(() => {
    if (!currentTopic) return [];
    const ids = new Set(currentTopic.articles);
    return articles.filter(a => ids.has(a.id));
  }, [articles, currentTopic]);

  // ---- UI ----
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-4xl font-bold mb-8">Discover</h1>

      {/* Overview タブ */}
      {tab === 'overview' && (
        <>
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Hot Topics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {hot.map(t => (
                <button
                  key={t.id}
                  className="rounded-2xl border p-5 text-left hover:bg-neutral-50"
                  onClick={() => router.push(`/discover?tab=news&topic=${encodeURIComponent(t.id)}`)}
                >
                  <div className="text-lg font-semibold">{t.title}</div>
                  <div className="mt-2 text-sm text-neutral-600">
                    {t.coins.join(', ')}
                    {t.city ? ` · ${t.city}` : ''} · {t.pubs} pubs
                  </div>
                </button>
              ))}
              {hot.length === 0 && (
                <div className="text-neutral-500">No hot topics yet.</div>
              )}
            </div>
          </section>
        </>
      )}

      {/* News タブ（特定トピックの記事一覧） */}
      {tab === 'news' && (
        <section className="mb-10">
          <div className="mb-6">
            <button
              className="underline text-sm"
              onClick={() => router.push('/discover')}
            >
              ← Back to Overview
            </button>
          </div>

          <h2 className="text-2xl font-semibold mb-2">
            {currentTopic ? currentTopic.title : 'News'}
          </h2>
          <div className="space-y-4">
            {currentArticles.map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border p-5 hover:bg-neutral-50"
              >
                <div className="text-lg font-semibold">{a.title}</div>
                <div className="mt-2 text-sm text-neutral-600">
                  {a.source} · {new Date(a.published_at).toISOString().slice(0,10)}
                  {a.city ? ` · ${a.city}` : ''}
                  {a.coin ? ` · ${a.coin}` : ''}
                </div>
              </a>
            ))}
            {currentArticles.length === 0 && (
              <div className="text-neutral-500">No articles in this topic yet.</div>
            )}
          </div>
        </section>
      )}

      <footer className="mt-16 text-sm text-neutral-500">
        Data sources: OpenStreetMap contributors. Use at your own risk. No warranty.
      </footer>
    </main>
  );
}

// ---- ページ（Suspense ラッパー） ----
export default function DiscoverPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-6 py-8" />}>
      <DiscoverInner />
    </Suspense>
  );
}
