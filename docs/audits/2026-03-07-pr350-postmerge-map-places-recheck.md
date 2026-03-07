# CPM PR #350 マージ後 `/api/places` 再計測 + `/map` 表示確認（2026-03-07）

## 実施条件
- ルールに従い、**修正なし**で計測・確認のみ実施。
- 本番 `https://www.cryptopaymap.com/map` を Playwright で開き、実際に発火した `/api/places?...` URL を取得。
- 取得 URL を同一セッションで 10 回計測（`time_total / size_download / http_code`）。
- `curl` 直叩きはこの実行環境で `403 CONNECT tunnel failed` のため不可だったため、ブラウザ内 `fetch` で計測。

## 1) 本番 `/map` で実際に発火した `/api/places?...` URL
- `https://www.cryptopaymap.com/api/places?limit=2000&bbox=-180%2C-85%2C180%2C85`
- 初回ロード時レスポンス: `200`

## 2) 同一URL 10回計測（上記 URL）

| run | time_total (s) | size_download (bytes) | http_code |
|---:|---:|---:|---:|
| 1 | 0.0521 | 188328 | 200 |
| 2 | 0.0611 | 188328 | 200 |
| 3 | 0.0423 | 188328 | 200 |
| 4 | 0.0475 | 188328 | 200 |
| 5 | 0.0428 | 188328 | 200 |
| 6 | 0.0416 | 188328 | 200 |
| 7 | 0.0491 | 188328 | 200 |
| 8 | 0.0530 | 188328 | 200 |
| 9 | 0.0458 | 188328 | 200 |
| 10 | 0.0479 | 188328 | 200 |

- 平均: `0.04832 s`（48.32 ms）
- 中央値: `0.04770 s`（47.70 ms）
- p95: `0.06110 s`（61.10 ms）

## 3) 前回比（size_download / p95）

前回レポート（2026-03-06）の多件数URL:
- URL: `https://www.cryptopaymap.com/api/places?limit=2000&bbox=139.5671,35.481199999999994,139.9671,35.8812`
- 前回値: `size_download=21430 bytes`, `p95=1.9724 s`

今回、**同一 Tokyo広域 URL** も参考として 10 回再計測:

| run | time_total (s) | size_download (bytes) | http_code |
|---:|---:|---:|---:|
| 1 | 3.1294 | 9468 | 200 |
| 2 | 0.0250 | 9468 | 200 |
| 3 | 0.0308 | 9468 | 200 |
| 4 | 0.3352 | 9468 | 200 |
| 5 | 0.0305 | 9468 | 200 |
| 6 | 0.0259 | 9468 | 200 |
| 7 | 0.0238 | 9468 | 200 |
| 8 | 0.0274 | 9468 | 200 |
| 9 | 0.0240 | 9468 | 200 |
| 10 | 0.0243 | 9468 | 200 |

Tokyo広域URLの比較（前回→今回）:
- `size_download`: `21430 -> 9468 bytes`（**-55.8%**, -11,962 bytes）
- `p95`: `1.9724 -> 3.1294 s`（**+58.7%**、p95は悪化）
- 参考: 中央値は `0.0616 -> 0.02665 s`（改善）

## 4) `/map` 表示・Drawer 確認

### 確認結果
- 初回表示でピン（クラスター）描画を確認。
- パン後に表示が崩れないことを確認（クライアント側再描画で不自然な崩れは確認されず）。
- ピン選択相当として `?place=<id>` で Drawer 表示を確認し、`/api/places/[id]` の 200 を確認。
- Drawer 内に `ACCEPTED PAYMENTS / NAVIGATE / ADDRESS` が表示され、詳細欠落やエラー文言は確認されず。

### スクリーンショット
- map初期表示: `browser:/tmp/codex_browser_invocations/8e43029462128413/artifacts/artifacts/map-check.png`
- place選択時 Drawer: `browser:/tmp/codex_browser_invocations/32c0bbd1bc97b1e2/artifacts/artifacts/map-place-drawer-check.png`

## 5) `/api/places/[id]` 1回計測
- URL: `https://www.cryptopaymap.com/api/places/cpm:jp-tokyo-owner-cafe-dbg-owner-2g1hq`
- `time_total`: `3.7711 s`
- `size_download`: `548 bytes`
- `http_code`: `200`

単発のため統計は出せないが、体感上は「極端に重い」可能性があるので継続監視対象。

## 結論（指定フォーマット）
- `/api/places` の payload はどれだけ減ったか
  - 同一 Tokyo広域URL 比較で **-55.8%（21430 -> 9468 bytes）**。
- p95 は改善したか
  - 同一 Tokyo広域URL 比較では **悪化（1.9724 -> 3.1294 s）**。
  - ただし中央値は改善しており、p95を押し上げるスパイクが存在。
- Map表示やDrawerに不具合はないか
  - 今回の確認範囲では **不具合は観測なし**（初期描画/パン後表示/Drawer詳細表示/エラー文言なし）。
- 次の優先タスクは何か
  - **C: cache/infra調査**（p95スパイク解消を最優先）
  - 次点で **B: /api/places の追加最適化**（中央値は良好なため、主に最悪値対策）
