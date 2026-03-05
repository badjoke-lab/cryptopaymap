# PR-01〜PR-05 実装・挙動フル監査レポート

- 監査日: 2026-03-05
- 監査対象リポジトリ: `badjoke-lab/cryptopaymap-v2`
- 監査開始 commit hash: `1537480589ff8569273e7ed41fa226ede66ace36`
- 監査ブランチ: `audit/pr01-05-validation`
- 実行環境:
  - Node.js `v22.21.1`
  - npm `11.4.2`

## 0. 前提同期・環境確認

### 実行コマンドと結果

1. ブランチ/同期
   - 実行:
     - `git fetch origin main && git checkout main && git pull --ff-only origin main && git checkout -b audit/pr01-05-validation`
   - 結果: **未確認（理由）**
     - `origin` remote が未設定のため `main` 同期不可。
     - 代替として現ブランチ `work` から `audit/pr01-05-validation` を作成。

2. 依存導入
   - 実行: `npm ci`
   - 結果: **OK**（exit code 0）

3. Lint
   - 実行: `npm run lint`
   - 結果: **OK**（exit code 0、warning あり）

4. Build
   - 実行: `npm run build`
   - 結果: **OK**（exit code 0、warning あり）

5. 開発サーバ
   - 実行: `npm run dev`
   - 結果: **OK**（`http://localhost:3000` で起動）

---

## 1. ✅ DoDチェック表（PR-01〜05）

判定基準: 各項目は **OK / NG / 未確認（理由）** で記載。

### A. Home（PR-01想定）

| 項目 | 判定 | 確認URL / 方法 / 実測結果 |
|---|---|---|
| `/` が 200 | OK | URL: `http://localhost:3000/`。方法: Playwright + `curl`。結果: 200。 |
| total places 表示 | OK | URL: `http://localhost:3000/`。方法: Playwright テキスト抽出。結果: `5 crypto-friendly places worldwide` を確認（数値は 976 ではなく 5）。 |
| Map preview クリックで `/map` 遷移 | OK | URL: `http://localhost:3000/`。方法: `a[href="/map"]` クリック。結果: `http://localhost:3000/map` へ遷移。 |
| Discover導線（文言込み） | OK | 方法: ホーム文言抽出。結果: `Find popular spots fast → Discover` を確認。 |
| Submit導線（下部配置） | OK | 方法: ホーム文言確認。結果: `Help improve the map ... Submit a place` セクションを下部に確認。 |
| Stats導線（短文付き） | OK | 方法: ホーム文言抽出。結果: `Check coverage & trends → Stats` を確認。 |

**記録（スクリーンショット）**
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-home.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-home-mapclick.png`

---

### B. Accepts（PR-02）

| 項目 | 判定 | 確認URL / 方法 / 実測結果 |
|---|---|---|
| `/accepts/BTC` 200（ETH/USDT含む） | OK | URL: `/accepts/BTC`, `/accepts/ETH`, `/accepts/USDT`。方法: Playwright + curl。結果: すべて 200。 |
| H1 / 説明 / Open Map / View all on map | OK | 例: BTCページで H1 `Places accepting Bitcoin (BTC)`、`Open Map`/`View all on map` 表示。 |
| `Total: N places · Showing first 50` | OK | 例: BTCで `Total: 972 places · Showing first 50` を確認。 |
| 2行カード（name/category/city,country/verification） | OK | 先頭カード群に `name`, `category`, `Tokyo, JP` 等、`Owner`/`Unverified` バッジを確認。 |
| 並び順 owner → community → unverified 優先 | 未確認（理由） | 先頭が `Owner` であることは確認。`community` を同一ページで実測確認できず、完全順序は判定保留。 |
| Open Map / View all on map で asset 反映 | OK | `Open Map` クリックで `http://localhost:3000/map?asset=BTC`（ETH/USDTも同様）を確認。 |

**記録（スクリーンショット）**
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-accepts-BTC.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-accepts-BTC-openmap.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-accepts-ETH.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-accepts-ETH-openmap.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-accepts-USDT.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-accepts-USDT-openmap.png`

---

### C. City（PR-04）

確認都市: `berlin`, `tokyo`, `london`

| 項目 | 判定 | 確認URL / 方法 / 実測結果 |
|---|---|---|
| `/city/berlin` 200（他1〜2都市） | OK | `/city/berlin`, `/city/tokyo`, `/city/london` を確認。結果: すべて 200。 |
| `Total: N places · Showing first 50` 表示 | OK | berlin/tokyo/london で同フォーマット表示あり。 |
| リストがカード形式で成立 | OK | `a[href^="/place/"]` が複数件表示（berlin=50件など）。 |
| Open Map / View all on map が city フィルタ反映 | NG | `Open Map` 遷移先が `http://localhost:3000/map`（`?city=...` クエリなし）。city条件の引継ぎを確認できず。 |

**記録（スクリーンショット）**
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-city-berlin.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-city-tokyo.png`
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-city-london.png`

---

### D. Place（PR-03）

| 項目 | 判定 | 確認URL / 方法 / 実測結果 |
|---|---|---|
| `/place/[id]` が 200 | NG | `/accepts/BTC` の先頭リンク `/place/cpm%3Ajp-tokyo-owner-cafe-dbg-owner-2g1hq` に遷移し 404。API取得IDでも `/place/...` は 404。 |
| 詳細表示（category/accepted/note/address） | NG | `/place/[id]` が404のため詳細ブロックを確認不可。 |
| Open on Map（`/map?place=...`） | NG | 同上。 |
| Related in this city | NG | 同上。 |
| “More in Tokyo” → `/city/...` | NG | 同上。 |
| “Accepts BTC” → `/accepts/BTC` | NG | 同上。 |

**記録（スクリーンショット）**
- `browser:/tmp/codex_browser_invocations/95a012161b9bff1f/artifacts/artifacts/audit-place.png`（404画面）

---

### E. Near-me（PR-05）

| 項目 | 判定 | 確認URL / 方法 / 実測結果 |
|---|---|---|
| `/near-me` 200 | NG | `curl http://localhost:3000/near-me` で 404。 |
| 位置情報 許可時の近傍表示 | NG | ルート自体が404のため検証不可。 |
| 位置情報 拒否時のフォールバック | NG | 同上。 |
| 未対応/失敗時のフォールバック | NG | 同上。 |
| Open Map が near-me 状態引継ぎ | NG | 同上。 |

---

## 2. 追加整合チェック

### `/places/${id}` 生成箇所残存チェック

- 実行コマンド:
  - `rg -n '"/places/|/places/\$\{' app components -S`
- 結果: **OK**
  - ヒットは `components/map/MapClient.tsx:810: safeFetch<Place>(
    \
    `/api/places/${selectedPlaceId}`
    )` のみ。
  - フロント導線の `/places/...` ではなく API パスであるため監査条件上は問題なし。

### 主要導線404チェック

- 実行コマンド:
  - `for u in / /accepts/BTC /accepts/ETH /accepts/USDT /city/berlin /city/tokyo /near-me; do code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$u); echo "$u $code"; done`
- 結果:
  - `/` 200
  - `/accepts/BTC` 200
  - `/accepts/ETH` 200
  - `/accepts/USDT` 200
  - `/city/berlin` 200
  - `/city/tokyo` 200
  - `/near-me` **404 (NG)**

---

## 🔥 バグ一覧

### 1) `/near-me` が 404
- 影響範囲: PR-05 要件全体（位置情報許可/拒否/失敗時ハンドリング、Map引継ぎ）
- 再現手順:
  1. `npm run dev`
  2. `curl -I http://localhost:3000/near-me` またはブラウザでアクセス
- 期待: 200 で near-me UI 表示
- 実際: 404
- 暫定原因: **推測**: ルーティング未実装/未マウント

### 2) Placeリンクが 404
- 影響範囲: PR-03 要件（Place詳細、関連導線、Open on Map）
- 再現手順:
  1. `/accepts/BTC` を開く
  2. 先頭 place リンクをクリック
- 期待: `/place/[id]` の詳細ページ表示
- 実際: 404
- 暫定原因: **推測**: 一覧で出している `id` と `/place/[id]` ルート解決ロジックの不整合

### 3) City → Map 遷移で city フィルタ引継ぎなし
- 影響範囲: PR-04 の map連携要件
- 再現手順:
  1. `/city/berlin` を開く
  2. `Open Map` をクリック
- 期待: `/map?city=Berlin` 等、city条件が反映
- 実際: `/map`（クエリ無し）
- 暫定原因: **推測**: Open Mapリンク生成時に city パラメータを渡していない

---

## 📌 次の修正PR候補

- **P0**: `/near-me` ルート実装（または復旧）し、位置情報許可/拒否/失敗のフォールバックを実装。
- **P0**: `/place/[id]` で一覧由来IDを正しく解決できるように修正。
- **P1**: `/city/[city]` の Open Map / View all on map で city フィルタを map 側へ引継ぎ。
- **P2**: Acceptsリストで verification の `owner > community > unverified` をテストで固定化（現在は community の同時実測不足）。

---

## 最終確認

- `npm run lint`: 通過（warningあり）
- `npm run build`: 通過（warningあり）

## 監査結論（マージ可否）

- **結論: NO（現時点ではマージ非推奨）**
- 理由:
  - PR-03, PR-04, PR-05 の重要要件にNGが存在（`/place/[id]` 404、cityフィルタ引継ぎ不備、`/near-me` 404）。
