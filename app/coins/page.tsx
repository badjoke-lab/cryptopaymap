// app/coins/page.tsx
import { redirect } from 'next/navigation';
import fs from 'node:fs/promises';
import path from 'node:path';

export const revalidate = 0;            // 常に実行
export const dynamic = 'force-dynamic'; // ビルド時に静的化させない

async function pickDefaultSymbol(): Promise<string> {
  // 1) 環境変数があれば最優先（例：NEXT_PUBLIC_DEFAULT_COIN=BTC）
  const env = process.env.NEXT_PUBLIC_DEFAULT_COIN?.trim().toUpperCase();
  if (env) return env;

  // 2) 集計JSONがあれば total 最大のコインを使う
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'aggregates', 'coins.json');
    const txt = await fs.readFile(p, 'utf8');
    const json = JSON.parse(txt) as { coins?: Record<string, { total?: number }> };
    const entries = Object.entries(json.coins ?? {});
    if (entries.length) {
      entries.sort((a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0));
      return entries[0][0].toUpperCase();
    }
  } catch {
    // 何もなければ fallback
  }

  // 3) 最終フォールバック
  return 'BTC';
}

export default async function CoinsIndexRedirect() {
  const sym = await pickDefaultSymbol();
  redirect(`/coins/${encodeURIComponent(sym)}`);
}
