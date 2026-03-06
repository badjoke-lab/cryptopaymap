# CPM 本番 `/api/places`（データあり bbox）計測レポート（2026-03-06）

## 実施条件
- 対象: `https://www.cryptopaymap.com/map` を開いたセッション上で、同一オリジン `fetch` により `/api/places` を計測。
- 計測回数: 各 URL 10 回。
- 計測項目: `time_total(ms)` / `size_download(bytes)` / `http_code`。
- 計測手法: Playwright（browser container）で `performance.now()` 前後差分と `arrayBuffer().byteLength` を採取。

## 取得した places>0 URL
- 少件数URL（Tokyo Station 周辺）
  - `https://www.cryptopaymap.com/api/places?limit=2000&bbox=139.7571,35.6712,139.7771,35.691199999999995`
- 多件数URL（Tokyo 広域）
  - `https://www.cryptopaymap.com/api/places?limit=2000&bbox=139.5671,35.481199999999994,139.9671,35.8812`

---

## 計測結果1（少件数URL）
URL: `https://www.cryptopaymap.com/api/places?limit=2000&bbox=139.7571,35.6712,139.7771,35.691199999999995`

| run | time_total (ms) | size_download (bytes) | http_code |
|---:|---:|---:|---:|
| 1 | 1568.0 | 1839 | 200 |
| 2 | 64.6 | 1839 | 200 |
| 3 | 63.1 | 1839 | 200 |
| 4 | 60.4 | 1839 | 200 |
| 5 | 57.0 | 1839 | 200 |
| 6 | 54.3 | 1839 | 200 |
| 7 | 55.4 | 1839 | 200 |
| 8 | 59.8 | 1839 | 200 |
| 9 | 66.9 | 1839 | 200 |
| 10 | 69.5 | 1839 | 200 |

- 平均: `211.90 ms`
- 中央値: `61.75 ms`
- p95: `1568.00 ms`
- places length: `4`
- 先頭1件の keys:
  - `id, name, lat, lng, verification, category, city, country, accepted, address_full, about_short, paymentNote, amenities, phone, website, twitter, instagram, facebook, coverImage`

---

## 計測結果2（多件数URL・任意）
URL: `https://www.cryptopaymap.com/api/places?limit=2000&bbox=139.5671,35.481199999999994,139.9671,35.8812`

| run | time_total (ms) | size_download (bytes) | http_code |
|---:|---:|---:|---:|
| 1 | 1972.4 | 21430 | 200 |
| 2 | 61.3 | 21430 | 200 |
| 3 | 60.1 | 21430 | 200 |
| 4 | 60.4 | 21430 | 200 |
| 5 | 61.4 | 21430 | 200 |
| 6 | 57.7 | 21430 | 200 |
| 7 | 65.9 | 21430 | 200 |
| 8 | 68.7 | 21430 | 200 |
| 9 | 61.8 | 21430 | 200 |
| 10 | 69.4 | 21430 | 200 |

- 平均: `253.91 ms`
- 中央値: `61.60 ms`
- p95: `1972.40 ms`
- places length: `45`
- 先頭1件の keys:
  - `id, name, lat, lng, verification, category, city, country, accepted, address_full, about_short, paymentNote, amenities, phone, website, twitter, instagram, facebook, coverImage`

## 再現手順（実測手順のみ）
1. Playwright で `https://www.cryptopaymap.com/map` を開く。
2. `fetch('/api/places?limit=2000&bbox=...')` を実行し、`places length > 0` の URL を確定する。
3. 同一 URL に対して 10 回 `fetch` を行い、毎回以下を記録する。
   - `time_total`: `performance.now()` 差分
   - `size_download`: `arrayBuffer().byteLength`
   - `http_code`: `response.status`
4. レスポンス JSON 配列の `length` と先頭要素 `Object.keys()` を記録する。
