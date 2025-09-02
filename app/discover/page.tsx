'use client';

import { useEffect, useState } from 'react';

type Topic = {
  id: string;
  title: string;
  coins: string[];
  city?: string;
  count?: number;
};

type HotTopics = {
  topics: Topic[];
};

export default function DiscoverPage() {
  const [topics, setTopics] = useState<Topic[] | null>(null); // null=ロード中

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ビルドスクリプトで生成される集計をクライアントから読む
        const res = await fetch('/data/aggregates/hot-topics.json', {
          // Vercel上で最新反映を取りこぼさないようにする
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('fetch failed');
        const json = (await res.json()) as HotTopics;
        if (!cancelled) setTopics(json.topics ?? []);
      } catch {
        if (!cancelled) setTopics([]); // 失敗時は空扱い
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-4xl font-bold mb-6">Discover</h1>

      <h2 className="text-2xl font-semibold mb-3">Hot Topics</h2>

      {topics === null && <p>Loading…</p>}
      {topics !== null && topics.length === 0 && <p>No hot topics yet.</p>}

      {topics && topics.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {topics.map((t) => (
            <a
              key={t.id}
              href={`/discover?tab=news&topic=${encodeURIComponent(t.id)}`}
              className="block rounded-xl border bg-white p-4 shadow hover:shadow-md transition"
            >
              <div className="text-xl font-semibold">{t.title}</div>
              <div className="text-sm text-gray-600 mt-1">
                {t.coins.join(', ')}
                {t.city ? ` · ${t.city}` : ''}
                {typeof t.count === 'number' ? ` · ${t.count} pubs` : ''}
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="text-sm text-gray-500 mt-10">
        Data sources: OpenStreetMap contributors. Use at your own risk. No
        warranty.
      </p>
    </div>
  );
}

// SSRは使わずクライアント描画
export const dynamic = 'force-dynamic';
