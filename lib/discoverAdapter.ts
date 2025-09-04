// lib/discoverAdapter.ts
import fs from "node:fs/promises";
import path from "node:path";

/** クライアント/サーバ両用の標準スキーマ */
export type Topic = {
  id?: string;
  title: string;
  url: string;
  subtitle?: string;
  source?: string;
  tags?: string[];
  published_at?: string; // ISO8601
  weight?: number;
};

export type DiscoverPayload = {
  version: 1;
  generated_at: string; // ISO8601
  topics: Topic[];
};

async function readJSON<T = any>(rel: string): Promise<T | null> {
  try {
    const full = path.join(process.cwd(), "public", rel.replace(/^\/+/, ""));
    const txt = await fs.readFile(full, "utf8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function pickArray(obj: any): any[] {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  return obj.items ?? obj.topics ?? obj.rows ?? obj.data ?? [];
}

function normStr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}

/** 異なるJSON形を単一スキーマ Topic[] へ正規化 */
function normalizeToTopics(input: any): Topic[] {
  const arr = pickArray(input);
  const out: Topic[] = [];
  for (const it of arr) {
    const title =
      normStr(it?.title) ?? normStr(it?.t) ?? normStr(it?.name) ?? normStr(it?.headline);
    const url = normStr(it?.url) ?? normStr(it?.href) ?? normStr(it?.link);
    if (!title || !url) continue;
    const subtitle = normStr(it?.subtitle) ?? normStr(it?.s) ?? normStr(it?.desc);
    const published_at =
      normStr(it?.published_at) ?? normStr(it?.published) ?? normStr(it?.date);
    const tags: string[] | undefined =
      Array.isArray(it?.tags) ? it.tags : Array.isArray(it?.coins) ? it.coins : undefined;
    out.push({
      id: normStr(it?.id),
      title,
      url,
      subtitle,
      source: normStr(it?.source),
      tags,
      published_at,
      weight: typeof it?.weight === "number" ? it.weight : undefined,
    });
  }
  return out;
}

/** coins.json から最低保証のカードを生成（フォールバック） */
async function fallbackFromCoins(): Promise<Topic[]> {
  type CoinsAgg = {
    coins?: Record<
      string,
      { total?: number; top_cities?: Array<{ city: string; country?: string; count?: number }> }
    >;
  };
  const agg = await readJSON<CoinsAgg>("data/aggregates/coins.json");
  const coins = agg?.coins ?? {};
  const topics: Topic[] = [];
  for (const [sym, entry] of Object.entries(coins)) {
    const total = entry?.total ?? 0;
    const lead = entry?.top_cities?.[0];
    if (!total || !lead) continue;
    topics.push({
      title: `${sym} • ${lead.city} · ${total.toLocaleString()} spots`,
      url: `/coins/${sym}`,
      subtitle: `Top city: ${lead.city}${lead.country ? ` (${lead.country})` : ""}`,
      tags: [sym],
      weight: total,
    });
  }
  // 上位を優先
  topics.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return topics.slice(0, 12);
}

/** 外部公開：Discover用データの単一点取得口 */
export async function getHotTopics(): Promise<DiscoverPayload> {
  const candidates = [
    "data/aggregates/discover.json",
    "data/aggregates/hot-topics.json",
    "data/aggregates/news/hot-topics.json",
    "data/aggregates/news/index.json",
  ];

  let topics: Topic[] = [];
  for (const rel of candidates) {
    const j = await readJSON<any>(rel);
    if (!j) continue;
    topics = normalizeToTopics(j);
    if (topics.length) break;
  }

  if (!topics.length) {
    topics = await fallbackFromCoins();
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    topics,
  };
}
