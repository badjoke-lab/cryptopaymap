# CPM パフォーマンス現状調査（修正なし）

作成日: 2026-03-06

## 実行コマンドと計測ログ

### 1) Dev server 起動

```bash
npm run dev
```

### 2) Map 実トラフィック確認（Playwright）

```python
# /map 表示 + pan 操作時に /api/places を捕捉
API_PLACES_URLS [
 ('http://127.0.0.1:3000/api/places?limit=2000&bbox=-168.75%2C-68.39918%2C168.75%2C79.30264', 200),
 ('http://127.0.0.1:3000/api/places?limit=2000&bbox=-180%2C-85%2C180%2C85', 200)
]
```

### 3) API 10回計測（curl）

計測条件: `curl -sS -o /tmp/body.json -w '%{http_code} %{time_total} %{size_download}'`

#### `/api/places?bbox=-180,-85,180,85&limit=2000`

- status: 全10回 `200`
- time_total (s):
  - 0.054611, 0.036131, 0.023938, 0.018804, 0.015510, 0.015518, 0.017583, 0.015165, 0.014754, 0.015654
- 平均: **0.022767s**
- 中央値: **0.016619s**
- p95: **0.054611s**
- size_download: **510,455 bytes**（全10回同一）

キー一覧（先頭要素）:
- `about_short, accepted, address_full, amenities, category, city, country, coverImage, facebook, id, instagram, lat, lng, name, paymentNote, phone, twitter, verification, website`

#### `/api/places/cpm%3Atokyo%3Aowner-cafe-1`

- status: 全10回 `200`
- time_total (s):
  - 0.031942, 0.025559, 0.012473, 0.010314, 0.011842, 0.032154, 0.014506, 0.018803, 0.032475, 0.022619
- 平均: **0.021269s**
- 中央値: **0.020711s**
- p95: **0.032475s**
- size_download: **1,347 bytes**（全10回同一）

キー一覧:
- `about, about_short, accepted, address, amenities, category, city, contact, country, facebook, id, images, instagram, lat, lng, media, name, paymentNote, payments, phone, submitterName, twitter, updatedAt, verification, website`

#### `/api/stats`

- status: 全10回 `200`
- time_total (s):
  - 0.012576, 0.012793, 0.016623, 0.015161, 0.014987, 0.018038, 0.014738, 0.012036, 0.010407, 0.009990
- 平均: **0.013735s**
- 中央値: **0.013765s**
- p95: **0.018038s**
- size_download: **1,377 bytes**（全10回同一）

キー一覧:
- `accepting_any_count, asset_acceptance_matrix, breakdown, categories, category_ranking, chains, cities, city_ranking, countries, country_ranking, limited, meta, ok, top_assets, top_chains, total_count, total_places, verification_breakdown`

### 4) Payload 実サイズサンプル

```bash
curl -sS 'http://localhost:3000/api/places?bbox=-180,-85,180,85&limit=2000' -o /tmp/places.json
wc -c /tmp/places.json
# => 510455 /tmp/places.json
```

同レスポンス要素数: 976件（約523 bytes/件）

### 5) DB 計測可否確認

```bash
echo ${DATABASE_URL:-'<unset>'}
# => <unset>
psql --version
# => bash: psql: command not found
npm run db:compat-check
# => Missing DATABASE_URL environment variable
```

この環境では DB へ接続できず、`EXPLAIN (ANALYZE, BUFFERS)` は未実施。

## 主要観測メモ（根拠付き）

- Map 再取得は `moveend/zoomend` で発火し、120ms 遅延後に `/api/places` を呼ぶ。
- requestKey は `bbox@zoom|filterQuery`。
- フィルタ変更時は `fetchPlacesRef.current` を 150ms 後に実行。
- `/api/places` は `listPlacesForMap` を呼び、`ST_Intersects(...ST_MakeEnvelope...)` もしくは `lat/lng BETWEEN` 条件を使う。
- `/api/stats` は `fetchDbSnapshotV4`（live集計）を呼び、複数の `GROUP BY` クエリを並列実行。`stats_cache` 参照は現行コードに存在しない（repo 検索一致なし）。

## 改善余地（暫定評価）

- Map 再取得抑制: **Med**（既に client requestKey キャッシュ + 120ms 遅延あり。さらに moveend/zoomend 強制再取得やフィルタ変更時の再叩き方に調整余地あり）
- `/api/places` payload 軽量化: **High**（510KB/976件でキー数19。`about_short`/SNS/coverImage 等を Map 最小描画と分離できる余地）
- Stats cache 徹底: **Low**（現行は live 集計設計。`stats_cache` 自体が未参照）
- DB index（GiST等）: **Med**（migration 上は GiST 作成ありだが、実DBで利用確認が未実施）
