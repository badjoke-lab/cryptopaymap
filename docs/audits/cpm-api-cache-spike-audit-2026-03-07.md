# CPM `/api/places` と `/api/places/[id]` 本番キャッシュ/初回スパイク監査（2026-03-07）

## 前提
- **修正なし（計測のみ）**で実施。
- 実測対象本番: `https://cryptopaymap-v2.vercel.app`
- API反復回数: 各 5 回

## 1) `/api/places?...` 同一URL 反復取得
計測URL: `/api/places?limit=50&city=Tokyo`

| # | status | time_total (ms) | cache-control | age | x-vercel-cache | cf-cache-status | content-length |
|---:|---:|---:|---|---:|---|---|---|
| 1 | 200 | 186.3 | `public, max-age=0` | 35 | `STALE` | (none) | (none) |
| 2 | 200 | 45.5 | `public, max-age=0` | 35 | `STALE` | (none) | (none) |
| 3 | 200 | 47.1 | `public, max-age=0` | 36 | `STALE` | (none) | (none) |
| 4 | 200 | 42.9 | `public, max-age=0` | 36 | `STALE` | (none) | (none) |
| 5 | 200 | 34.6 | `public, max-age=0` | 36 | `STALE` | (none) | (none) |

観測メモ:
- `age` が増分しており、かつ `x-vercel-cache=STALE` が継続。
- 同一URL再取得時は 2 回目以降が 35–47ms と低遅延。

## 2) `/api/places/[id]` 反復取得
計測URL: `/api/places/cpm:jp-tokyo-owner-cafe-dbg-owner-2g1hq`

| # | status | time_total (ms) | cache-control | age | x-vercel-cache | cf-cache-status | content-length |
|---:|---:|---:|---|---:|---|---|---|
| 1 | 200 | 2401.9 | `public, max-age=0, must-revalidate` | 0 | `MISS` | (none) | (none) |
| 2 | 200 | 2430.9 | `public, max-age=0, must-revalidate` | 0 | `MISS` | (none) | (none) |
| 3 | 200 | 2403.5 | `public, max-age=0, must-revalidate` | 0 | `MISS` | (none) | (none) |
| 4 | 200 | 2419.4 | `public, max-age=0, must-revalidate` | 0 | `MISS` | (none) | (none) |
| 5 | 200 | 2443.9 | `public, max-age=0, must-revalidate` | 0 | `MISS` | (none) | (none) |

観測メモ:
- 毎回 `x-vercel-cache=MISS`, `age=0`。
- 5回すべて約 2.4s で、初回だけ遅い形ではない。

## 3) `/map` で Drawer 開閉時の詳細API再取得有無
実施内容:
- `/map` 読み込み後、同一 place ボタンを 4 サイクル（クリック→Esc で閉）
- 開閉サイクル所要時間（クリック後 1.2s 待機込み）: `1371.0, 1285.0, 1258.0, 1235.4 ms`
- 監視対象ネットワーク: `/api/places/<id>`

結果:
- 上記開閉中の `/api/places/<id>` リクエストは **0件**。
- 追加観測として `/map` 初期読込時は `/api/places?bbox=...` が発生（一時 503→続いて200、`x-vercel-cache=MISS`）。

## 結論（指定フォーマット）
- `/api/places` は本番で実際にキャッシュ HIT しているか
  - **実質 HIT 寄り（厳密には `STALE`）**。`age` 増加 + `x-vercel-cache=STALE` かつ再取得低遅延より、エッジ再利用は効いている。
- `/api/places/[id]` は初回だけ遅いか、毎回遅いか
  - **毎回遅い**（約2.4s、5/5で `MISS`）。
- 現在の主因は A/B/C のどれが最も濃いか
  - **B. 詳細APIスパイク** が最有力。
  - A（一覧APIキャッシュ不発）は本計測では主因度低め（一覧は反復で高速）。
  - C（実行基盤/DB接続）は、詳細APIの恒常遅延背景として副次候補。
- 次の修正対象はどこか
  1. **`/api/places/[id]` のキャッシュ戦略**（`s-maxage` / `stale-while-revalidate` / revalidate 設計）
  2. 詳細APIの DB クエリ/接続待ちの内訳計測（アプリログにクエリ時間・接続時間を分離記録）
  3. `/map` で詳細再取得が必要な条件（summary不足時のみ）に偏りがないか確認
